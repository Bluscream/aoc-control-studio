#![cfg(target_os = "linux")]

//! Backend DDC/CI para Linux via `/dev/i2c-*` (módulo `i2c-dev`).
//!
//! O barramento correto é descoberto a partir dos conectores DRM em
//! `/sys/class/drm/cardN-<CONECTOR>` (ex.: `card1-DP-3` → `i2c-8`), lendo o EDID
//! para identificar o monitor AOC. Caso não seja possível mapear pelo DRM, faz
//! uma varredura conservadora pelos barramentos que não sejam SMBus.

use super::{vcp, MonitorInfo};
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::os::unix::io::AsRawFd;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

const I2C_SLAVE: libc::c_ulong = 0x0703;
const DDC_I2C_ADDR: libc::c_ulong = 0x37; // 0x6E >> 1

/// Monitor físico conectado, descoberto via sysfs/DRM.
#[derive(Debug, Clone, Default)]
struct DrmConnector {
    /// Nome do conector no formato do compositor (ex.: "DP-3", "HDMI-A-1")
    connector: String,
    /// Número do barramento I2C (ex.: 8 para /dev/i2c-8)
    bus: Option<u32>,
    /// Fabricante PNP (ex.: "AOC")
    vendor: String,
    /// Nome do modelo no EDID (ex.: "24G2W1G3-")
    model: String,
}

impl DrmConnector {
    fn display_name(&self) -> String {
        let model = self.model.trim().trim_end_matches('-').trim();
        match (self.vendor.is_empty(), model.is_empty()) {
            (false, false) => format!("{} {}", self.vendor, model),
            (true, false) => model.to_string(),
            (false, true) => self.vendor.clone(),
            _ => "AOC 24G2S".to_string(),
        }
    }

    fn is_aoc(&self) -> bool {
        let v = self.vendor.to_ascii_uppercase();
        let m = self.model.to_ascii_uppercase();
        v == "AOC" || m.contains("AOC") || m.contains("24G2")
    }

    fn connection_label(&self) -> String {
        if self.connector.starts_with("DP") {
            "DisplayPort".to_string()
        } else if self.connector.starts_with("HDMI") {
            "HDMI".to_string()
        } else if self.connector.starts_with("DVI") {
            "DVI".to_string()
        } else if self.connector.is_empty() {
            "DisplayPort".to_string()
        } else {
            self.connector.clone()
        }
    }
}

fn parse_edid(edid: &[u8]) -> (String, String) {
    if edid.len() < 128 || edid[0..8] != [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00] {
        return (String::new(), String::new());
    }
    // Fabricante: 3 letras comprimidas em 5 bits cada (bytes 8-9)
    let id = ((edid[8] as u16) << 8) | edid[9] as u16;
    let letters = [(id >> 10) & 0x1F, (id >> 5) & 0x1F, id & 0x1F];
    let vendor: String = letters
        .iter()
        .filter(|&&c| (1..=26).contains(&c))
        .map(|&c| (b'A' + c as u8 - 1) as char)
        .collect();

    // Nome do monitor: descritor 0xFC em um dos 4 blocos de 18 bytes
    let mut model = String::new();
    for i in 0..4 {
        let off = 54 + i * 18;
        let d = &edid[off..off + 18];
        if d[0] == 0 && d[1] == 0 && d[3] == 0xFC {
            model = d[5..18]
                .iter()
                .take_while(|&&b| b != 0x0A && b != 0x00)
                .map(|&b| b as char)
                .collect::<String>()
                .trim()
                .to_string();
            break;
        }
    }
    (vendor, model)
}

/// Extrai o número `N` de nomes como "i2c-8".
fn parse_i2c_name(name: &str) -> Option<u32> {
    name.strip_prefix("i2c-").and_then(|n| n.parse().ok())
}

fn find_connector_bus(dir: &Path) -> Option<u32> {
    // 1. Subdiretório i2c-N direto (amdgpu / i915 em DP)
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if let Some(n) = parse_i2c_name(&e.file_name().to_string_lossy()) {
                return Some(n);
            }
        }
    }
    // 2. Link simbólico "ddc" → .../i2c-N (HDMI / DVI)
    if let Ok(target) = fs::read_link(dir.join("ddc")) {
        if let Some(n) = target
            .file_name()
            .and_then(|f| parse_i2c_name(&f.to_string_lossy()))
        {
            return Some(n);
        }
    }
    None
}

fn list_connected_monitors() -> Vec<DrmConnector> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir("/sys/class/drm") else {
        return out;
    };
    let mut dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    dirs.sort();
    for dir in dirs {
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        // Formato: cardN-CONECTOR (ignora "cardN", "renderD128", "version")
        let Some((card, connector)) = name.split_once('-') else {
            continue;
        };
        if !card.starts_with("card") || connector.starts_with("Writeback") {
            continue;
        }
        let status = fs::read_to_string(dir.join("status")).unwrap_or_default();
        if status.trim() != "connected" {
            continue;
        }
        let edid = fs::read(dir.join("edid")).unwrap_or_default();
        let (vendor, model) = parse_edid(&edid);
        out.push(DrmConnector {
            connector: connector.to_string(),
            bus: find_connector_bus(&dir),
            vendor,
            model,
        });
    }
    // Monitores AOC primeiro
    out.sort_by_key(|c| !c.is_aoc());
    out
}

fn is_smbus_adapter(bus: u32) -> bool {
    let name = fs::read_to_string(format!("/sys/bus/i2c/devices/i2c-{}/name", bus))
        .unwrap_or_default()
        .to_ascii_lowercase();
    name.contains("smbus") || name.contains("piix4") || name.contains("i801")
}

pub struct LinuxDdcManager {
    file: Option<File>,
    bus: u32,
    monitor: DrmConnector,
}

impl LinuxDdcManager {
    pub fn new() -> Result<Self, String> {
        let mut permission_denied: Vec<String> = Vec::new();
        let mut tried: Vec<u32> = Vec::new();

        // 1. Barramentos mapeados a partir dos conectores DRM (preferência para AOC)
        for mon in list_connected_monitors() {
            let Some(bus) = mon.bus else { continue };
            tried.push(bus);
            match Self::try_open(bus, mon.clone()) {
                Ok(m) => return Ok(m),
                Err(e) if e.kind() == ErrorKind::PermissionDenied => {
                    permission_denied.push(format!("/dev/i2c-{}", bus))
                }
                Err(_) => {}
            }
        }

        // 2. Fallback: varredura dos demais barramentos (exceto SMBus da placa-mãe)
        let mut buses: Vec<u32> = fs::read_dir("/dev")
            .map(|rd| {
                rd.flatten()
                    .filter_map(|e| parse_i2c_name(&e.file_name().to_string_lossy()))
                    .collect()
            })
            .unwrap_or_default();
        buses.sort_unstable();
        for bus in buses {
            if tried.contains(&bus) || is_smbus_adapter(bus) {
                continue;
            }
            match Self::try_open(bus, DrmConnector::default()) {
                Ok(m) => return Ok(m),
                Err(e) if e.kind() == ErrorKind::PermissionDenied => {
                    permission_denied.push(format!("/dev/i2c-{}", bus))
                }
                Err(_) => {}
            }
        }

        if !permission_denied.is_empty() {
            return Err(format!(
                "Sem permissão para acessar {} — execute 'sudo ./scripts/setup-linux.sh' e faça logout/login",
                permission_denied.join(", ")
            ));
        }
        if !Path::new("/dev/i2c-0").exists() {
            return Err(
                "Nenhum /dev/i2c-* encontrado — carregue o módulo com 'sudo modprobe i2c-dev'".to_string(),
            );
        }
        Err("Nenhum monitor DDC/CI respondeu nos barramentos /dev/i2c-* (verifique se DDC/CI está ligado no OSD do monitor)".to_string())
    }

    fn try_open(bus: u32, monitor: DrmConnector) -> std::io::Result<Self> {
        let path = format!("/dev/i2c-{}", bus);
        let file = OpenOptions::new().read(true).write(true).open(&path)?;
        let rc = unsafe { libc::ioctl(file.as_raw_fd(), I2C_SLAVE as _, DDC_I2C_ADDR) };
        if rc < 0 {
            return Err(std::io::Error::last_os_error());
        }
        let mut manager = Self {
            file: Some(file),
            bus,
            monitor,
        };
        match manager.get_vcp(vcp::BRIGHTNESS) {
            Ok(_) => {
                crate::log_msg(
                    "LinuxDDC",
                    &format!(
                        "Monitor '{}' ({}) respondendo via DDC/CI em {}",
                        manager.monitor.display_name(),
                        if manager.monitor.connector.is_empty() {
                            "?"
                        } else {
                            &manager.monitor.connector
                        },
                        path
                    ),
                );
                Ok(manager)
            }
            Err(e) => Err(std::io::Error::other(e)),
        }
    }

    pub fn get_monitor_info(&mut self) -> MonitorInfo {
        let (hdr_sup, hdr_ena) = self.get_hdr_status();
        let (fs_sup, fs_ena) = self.get_adaptive_sync_status();
        MonitorInfo {
            name: self.monitor.display_name(),
            connection: self.monitor.connection_label(),
            ddc_supported: self.file.is_some(),
            hdr_supported: hdr_sup,
            hdr_enabled: hdr_ena,
            adaptive_sync_supported: fs_sup,
            adaptive_sync_enabled: fs_ena,
        }
    }

    #[allow(dead_code)]
    pub fn bus(&self) -> u32 {
        self.bus
    }

    fn raw_write(&mut self, payload: &[u8], settle_ms: u64) -> Result<(), String> {
        let file = self
            .file
            .as_mut()
            .ok_or_else(|| "Barramento I2C não aberto".to_string())?;
        let mut pkt = Vec::with_capacity(payload.len() + 3);
        pkt.push(0x51);
        pkt.push(0x80 | (payload.len() as u8));
        pkt.extend_from_slice(payload);

        // No padrão DDC/CI, o checksum inclui o endereço de escrita 8-bit 0x6E
        let mut chk: u8 = 0x6E;
        for &b in &pkt {
            chk ^= b;
        }
        pkt.push(chk);

        let res = file
            .write_all(&pkt)
            .map_err(|e| format!("Erro I2C write Linux: {}", e));
        sleep(Duration::from_millis(settle_ms));
        res
    }

    fn raw_read_reply(&mut self) -> Result<[u8; 11], String> {
        let file = self
            .file
            .as_mut()
            .ok_or_else(|| "Barramento I2C não aberto".to_string())?;
        let mut reply = [0u8; 11];
        let res = file.read_exact(&mut reply);
        sleep(Duration::from_millis(45));
        res.map_err(|e| format!("Erro I2C read Linux: {}", e))?;
        if reply[0] != 0x6E || (reply[1] & 0x80) == 0 {
            return Err("Cabeçalho DDC/CI inválido".to_string());
        }
        let body_len = (reply[1] & 0x7F) as usize;
        if body_len != 8 {
            return Err(format!("Monitor ocupado (len={})", body_len));
        }
        let mut chk: u8 = 0x50;
        for &b in &reply {
            chk ^= b;
        }
        if chk != 0 {
            return Err("Checksum DDC/CI inválido".to_string());
        }
        Ok(reply)
    }

    fn write_with_retry(&mut self, payload: &[u8], settle_ms: u64) -> Result<(), String> {
        let mut last_err = String::new();
        for attempt in 0..3 {
            if attempt > 0 {
                sleep(Duration::from_millis(100));
            }
            match self.raw_write(payload, settle_ms) {
                Ok(()) => return Ok(()),
                Err(e) => last_err = e,
            }
        }
        Err(last_err)
    }

    pub fn get_vcp(&mut self, code: u8) -> Result<(u32, u32), String> {
        let mut last_err = String::new();
        for attempt in 0..3 {
            if attempt > 0 {
                sleep(Duration::from_millis(90));
            }
            if let Err(e) = self.raw_write(&[0x01, code], 65) {
                last_err = e;
                continue;
            }
            match self.raw_read_reply() {
                Ok(raw) => {
                    if raw[3] != 0 {
                        return Err(format!("VCP 0x{:02X} não suportado", code));
                    }
                    let max = ((raw[6] as u32) << 8) | (raw[7] as u32);
                    let cur = ((raw[8] as u32) << 8) | (raw[9] as u32);
                    return Ok((cur, max));
                }
                Err(e) => last_err = e,
            }
        }
        Err(last_err)
    }

    pub fn set_vcp(&mut self, code: u8, value: u32) -> Result<(), String> {
        let hi = ((value >> 8) & 0xFF) as u8;
        let lo = (value & 0xFF) as u8;
        self.write_with_retry(&[0x03, code, hi, lo], 185)
    }

    pub fn get_tpv_vcp(&mut self, b1: u8, b2: u8, b3: u8) -> Result<(u32, u32), String> {
        let mut last_err = String::new();
        for attempt in 0..3 {
            if attempt > 0 {
                sleep(Duration::from_millis(90));
            }
            if let Err(e) = self.raw_write(&[0x01, b1, b2, b3], 70) {
                last_err = e;
                continue;
            }
            match self.raw_read_reply() {
                Ok(raw) => {
                    if raw[3] != 0 {
                        return Err(format!("TPV {:02X} {:02X} {:02X} não suportado", b1, b2, b3));
                    }
                    // No AOC 24G2S, opcodes F8 E1 válidos retornam tag 0xFE 0x01
                    if b1 == 0xF8 && b2 == 0xE1 && !(raw[4] == 0xFE && raw[5] == 0x01) {
                        return Err(format!("TPV F8 E1 {:02X} indisponível", b3));
                    }
                    let max = ((raw[6] as u32) << 8) | (raw[7] as u32);
                    let cur = ((raw[8] as u32) << 8) | (raw[9] as u32);
                    return Ok((cur, max));
                }
                Err(e) => last_err = e,
            }
        }
        Err(last_err)
    }

    pub fn set_tpv_vcp(&mut self, b1: u8, b2: u8, b3: u8, value: u32) -> Result<(), String> {
        let hi = ((value >> 8) & 0xFF) as u8;
        let lo = (value & 0xFF) as u8;
        self.write_with_retry(&[0x03, b1, b2, b3, hi, lo], 190)
    }

    /// HDR do sistema operacional (sinal HDR10). No Linux isso é controlado pelo
    /// compositor; os perfis "HDR Picture/Movie/Game" do monitor continuam
    /// funcionando via TPV (F8 E1 52) independentemente disso.
    pub fn get_hdr_status(&self) -> (bool, bool) {
        (false, false)
    }

    pub fn set_hdr(&mut self, enabled: bool) -> Result<(), String> {
        if !enabled {
            // Nada a desligar: o HDR do SO não é ativado por este app no Linux
            return Ok(());
        }
        Err("HDR do sistema deve ser ativado nas configurações de tela do compositor".to_string())
    }

    pub fn get_adaptive_sync_status(&self) -> (bool, bool) {
        vrr::status(&self.monitor.connector)
    }

    pub fn set_adaptive_sync(&mut self, enabled: bool) -> Result<(), String> {
        vrr::set(&self.monitor.connector, enabled)
    }
}

/// Controle de Adaptive-Sync / FreeSync (VRR) através do compositor Wayland.
mod vrr {
    use super::Command;

    fn desktop() -> String {
        std::env::var("XDG_CURRENT_DESKTOP")
            .unwrap_or_default()
            .to_ascii_uppercase()
    }

    fn run(cmd: &str, args: &[&str]) -> Option<String> {
        let out = Command::new(cmd).args(args).output().ok()?;
        if !out.status.success() {
            return None;
        }
        Some(String::from_utf8_lossy(&out.stdout).to_string())
    }

    /// Retorna o bloco de texto de `cosmic-randr list` referente ao conector.
    fn cosmic_block(connector: &str) -> Option<String> {
        let list = run("cosmic-randr", &["list"])?;
        let mut block = String::new();
        let mut inside = false;
        for line in list.lines() {
            let is_header = !line.starts_with(' ') && !line.trim().is_empty();
            if is_header {
                inside = connector.is_empty() || line.split_whitespace().next() == Some(connector);
                if inside && !block.is_empty() {
                    break;
                }
            }
            if inside {
                block.push_str(line);
                block.push('\n');
            }
        }
        if block.is_empty() { None } else { Some(block) }
    }

    fn cosmic_field(block: &str, key: &str) -> Option<String> {
        block
            .lines()
            .find_map(|l| l.trim().strip_prefix(key).map(|v| v.trim_start_matches(':').trim().to_string()))
    }

    pub fn status(connector: &str) -> (bool, bool) {
        let de = desktop();
        if de.contains("COSMIC") {
            if let Some(block) = cosmic_block(connector) {
                let sup = cosmic_field(&block, "Adaptive Sync Support")
                    .map(|v| v == "true")
                    .unwrap_or(false);
                let ena = cosmic_field(&block, "Adaptive Sync")
                    .map(|v| v != "false")
                    .unwrap_or(false);
                return (sup, ena);
            }
        } else if de.contains("KDE") {
            if let Some(out) = run("kscreen-doctor", &["-o"]) {
                // kscreen-doctor não informa capacidade de forma simples; assume suportado
                let ena = out.contains("Vrr: Always") || out.contains("Vrr: Automatic");
                return (true, ena);
            }
        }
        (false, false)
    }

    pub fn set(connector: &str, enabled: bool) -> Result<(), String> {
        let de = desktop();
        if de.contains("COSMIC") {
            let block = cosmic_block(connector)
                .ok_or_else(|| "FreeSync: saída não encontrada no cosmic-randr".to_string())?;
            let name = block.split_whitespace().next().unwrap_or(connector).to_string();
            // Linha do modo atual: "1920x1080 @ 165.003 Hz (current)"
            let cur = block
                .lines()
                .find(|l| l.contains("(current)"))
                .ok_or_else(|| "FreeSync: modo atual não encontrado".to_string())?;
            let mut parts = cur.split_whitespace();
            let res = parts.next().unwrap_or_default();
            let _at = parts.next();
            let hz = parts.next().unwrap_or_default();
            let (w, h) = res
                .split_once('x')
                .ok_or_else(|| "FreeSync: resolução inválida".to_string())?;
            let value = if enabled { "true" } else { "false" };
            let ok = Command::new("cosmic-randr")
                .args(["mode", &name, w, h, "--refresh", hz, "--adaptive-sync", value])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            return if ok {
                Ok(())
            } else {
                Err("FreeSync: o COSMIC recusou a alteração de Adaptive-Sync (verifique se o monitor anuncia suporte)".to_string())
            };
        }
        if de.contains("KDE") {
            let policy = if enabled { "always" } else { "never" };
            let ok = Command::new("kscreen-doctor")
                .arg(format!("output.{}.vrrpolicy.{}", connector, policy))
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            return if ok {
                Ok(())
            } else {
                Err("FreeSync: falha ao aplicar via kscreen-doctor".to_string())
            };
        }
        Err("FreeSync: controle de VRR não suportado neste ambiente gráfico (ajuste nas configurações de tela do sistema)".to_string())
    }
}
