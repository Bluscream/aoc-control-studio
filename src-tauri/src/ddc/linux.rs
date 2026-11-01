#![cfg(target_os = "linux")]

use super::{vcp, MonitorInfo};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::os::unix::io::AsRawFd;
use std::path::Path;
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

const I2C_SLAVE: libc::c_ulong = 0x0703;
const DDC_I2C_ADDR: libc::c_ulong = 0x37; // 0x6E >> 1

pub struct LinuxDdcManager {
    file: Option<File>,
}

impl LinuxDdcManager {
    pub fn new() -> Result<Self, String> {
        for i in 0..20 {
            let path = format!("/dev/i2c-{}", i);
            if !Path::new(&path).exists() {
                continue;
            }
            if let Ok(file) = OpenOptions::new().read(true).write(true).open(&path) {
                unsafe {
                    if libc::ioctl(file.as_raw_fd(), I2C_SLAVE, DDC_I2C_ADDR) >= 0 {
                        let mut manager = Self { file: Some(file) };
                        if manager.get_vcp(vcp::BRIGHTNESS).is_ok() {
                            return Ok(manager);
                        }
                    }
                }
            }
        }
        Err("Nenhum monitor DDC/CI acessível em /dev/i2c-* (verifique permissões do grupo i2c)".to_string())
    }

    pub fn get_monitor_info(&mut self) -> MonitorInfo {
        MonitorInfo {
            name: "AOC 24G2S".to_string(),
            connection: "DisplayPort".to_string(),
            ddc_supported: self.file.is_some(),
            hdr_supported: true,
            hdr_enabled: false,
            adaptive_sync_supported: true,
            adaptive_sync_enabled: false,
        }
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

        file.write_all(&pkt)
            .map_err(|e| format!("Erro I2C write Linux: {}", e))?;
        sleep(Duration::from_millis(settle_ms));
        Ok(())
    }

    fn raw_read_reply(&mut self) -> Result<[u8; 11], String> {
        let file = self
            .file
            .as_mut()
            .ok_or_else(|| "Barramento I2C não aberto".to_string())?;
        let mut reply = [0u8; 11];
        file.read_exact(&mut reply)
            .map_err(|e| format!("Erro I2C read Linux: {}", e))?;
        sleep(Duration::from_millis(45));
        if reply[0] != 0x6E || (reply[1] & 0x80) == 0 {
            return Err("Cabeçalho DDC/CI inválido".to_string());
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
        self.raw_write(&[0x03, code, hi, lo], 185)
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
                        return Err("TPV VCP não suportado".to_string());
                    }
                    if b1 == 0xF8 && b2 == 0xE1 && !(raw[4] == 0xFE && raw[5] == 0x01) {
                        return Err("TPV F8 E1 indisponível".to_string());
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
        self.raw_write(&[0x03, b1, b2, b3, hi, lo], 190)
    }

    pub fn get_hdr_status(&self) -> (bool, bool) {
        (true, false)
    }

    pub fn set_hdr(&mut self, enabled: bool) -> Result<(), String> {
        // Tenta kscreen-doctor (KDE Wayland) e fallback para TPV HDRMode
        let mode = if enabled { "enable" } else { "disable" };
        if Command::new("kscreen-doctor")
            .arg(format!("output.1.hdr.{}", mode))
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
        self.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_HDR_MODE, if enabled { 1 } else { 0 })
    }

    pub fn get_adaptive_sync_status(&self) -> (bool, bool) {
        (true, false)
    }

    pub fn set_adaptive_sync(&mut self, enabled: bool) -> Result<(), String> {
        let policy = if enabled { "always" } else { "never" };
        let _ = Command::new("kscreen-doctor")
            .arg(format!("output.1.vrrpolicy.{}", policy))
            .status();
        Ok(())
    }
}
