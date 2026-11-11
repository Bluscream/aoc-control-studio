mod ddc;

use ddc::{vcp, ApplyResult, AutoProfileConfig, MonitorInfo, MonitorSettings, RunningAppInfo};

#[cfg(target_os = "windows")]
use ddc::windows::WindowsDdcManager as DdcDriver;

#[cfg(target_os = "linux")]
use ddc::linux::LinuxDdcManager as DdcDriver;

#[cfg(target_os = "linux")]
mod linux_process;
#[cfg(target_os = "linux")]
use linux_process as app_process;
#[cfg(target_os = "windows")]
use win_process as app_process;

use std::fs::OpenOptions;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, State};

static VERBOSE_MODE: AtomicBool = AtomicBool::new(false);
static START_INSTANT: LazyLock<Instant> = LazyLock::new(Instant::now);
static LOG_FILE: Mutex<Option<std::fs::File>> = Mutex::new(None);

/// Caminho de um arquivo de log. No Windows fica no diretório de execução (como
/// antes); no Linux vai para `$XDG_STATE_HOME/aoc-control-studio` (padrão
/// `~/.local/state/aoc-control-studio`), pois o diretório de trabalho de apps
/// iniciados pelo menu costuma ser `$HOME` ou somente leitura (AppImage).
pub fn log_path(file_name: &str) -> std::path::PathBuf {
    #[cfg(target_os = "linux")]
    {
        let base = std::env::var_os("XDG_STATE_HOME")
            .map(std::path::PathBuf::from)
            .filter(|p| p.is_absolute())
            .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/state")));
        if let Some(base) = base {
            let dir = base.join("aoc-control-studio");
            if std::fs::create_dir_all(&dir).is_ok() {
                return dir.join(file_name);
            }
        }
    }
    std::path::PathBuf::from(file_name)
}

pub fn set_verbose(v: bool) {
    VERBOSE_MODE.store(v, Ordering::SeqCst);
    let log_path = log_path("aoc_debug.log");
    let log_file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(&log_path)
        .ok();
    *LOG_FILE.lock().unwrap() = log_file;

    if v {
        log_msg("Init", "=================================================");
        log_msg("Init", " AOC Control Studio iniciado com modo Verbose (-v)");
        log_msg("Init", &format!(" Logs exibidos no terminal e gravados em {}", log_path.display()));
        log_msg("Init", "=================================================");
    }
}

pub fn log_msg(tag: &str, msg: &str) {
    let elapsed = START_INSTANT.elapsed().as_secs_f64();
    let line = format!("[{:07.3}s][{}] {}", elapsed, tag, msg);

    // Grava no arquivo
    if let Ok(mut guard) = LOG_FILE.lock() {
        if let Some(f) = guard.as_mut() {
            let _ = writeln!(f, "{}", line);
            let _ = f.flush();
        }
    }

    // Se verbose, imprime no terminal / CONOUT$
    if VERBOSE_MODE.load(Ordering::SeqCst) {
        #[cfg(windows)]
        {
            if let Ok(mut con) = OpenOptions::new().write(true).open("CONOUT$") {
                let _ = writeln!(con, "{}", line);
            } else {
                println!("{}", line);
            }
        }
        #[cfg(not(windows))]
        {
            println!("{}", line);
        }
    }
}

#[derive(Debug, Clone)]
struct OverdriveVerification {
    target: String,
    attempts: u32,
    max_attempts: u32,
    next_check: Instant,
}

#[derive(Debug, Clone)]
struct ProfileVerification {
    target: MonitorSettings,
    check_at: Instant,
    step: u8,
    blocking_mode_changed: bool,
}

pub struct AppState {
    driver: Mutex<Option<DdcDriver>>,
    last_applied: Mutex<Option<MonitorSettings>>,
    auto_config: Mutex<Option<AutoProfileConfig>>,
    overdrive_verifier: Mutex<Option<OverdriveVerification>>,
    profile_verifier: Mutex<Option<ProfileVerification>>,
}

fn trigger_overdrive_verification(state: &AppState, target_overdrive: String) {
    if target_overdrive.is_empty() {
        return;
    }
    log_msg(
        "OverdriveVerifier",
        &format!(
            "Agendando verificação de Overdrive para '{}' (iniciando em 2s)...",
            target_overdrive
        ),
    );
    let mut guard = state.overdrive_verifier.lock().unwrap();
    *guard = Some(OverdriveVerification {
        target: target_overdrive,
        attempts: 0,
        max_attempts: 5,
        next_check: Instant::now() + Duration::from_millis(2000),
    });
}

fn trigger_profile_verification(state: &AppState, target: MonitorSettings, blocking_mode_changed: bool) {
    log_msg(
        "ProfileVerifier",
        &format!(
            "Agendando verificação pós-troca (Polling 1 em 2.5s, alterou_bloqueios={})...",
            blocking_mode_changed
        ),
    );
    let mut guard = state.profile_verifier.lock().unwrap();
    *guard = Some(ProfileVerification {
        target,
        check_at: Instant::now() + Duration::from_millis(2500),
        step: 1,
        blocking_mode_changed,
    });
}

fn ensure_driver(guard: &mut Option<DdcDriver>) -> Result<&mut DdcDriver, String> {
    if guard.is_none() {
        log_msg("Rust", "ensure_driver: inicializando DdcDriver...");
        *guard = Some(DdcDriver::new()?);
        log_msg("Rust", "ensure_driver: DdcDriver inicializado com sucesso.");
    }
    guard
        .as_mut()
        .ok_or_else(|| "Monitor DDC/CI não acessível".to_string())
}

fn map_gamma_to_hw(s: &str) -> u32 {
    match s {
        "Gamma 1" => 0,
        "Gamma 2" => 1,
        "Gamma 3" => 2,
        _ => 0,
    }
}

fn map_gamma_from_hw(v: u32) -> String {
    match v {
        1 => "Gamma 2".to_string(),
        2 => "Gamma 3".to_string(),
        _ => "Gamma 1".to_string(),
    }
}

fn map_eco_to_hw(s: &str) -> u32 {
    match s {
        "Padrão" | "Standard" => 0,
        "Texto" | "Text" => 1,
        "Internet" => 2,
        "Jogo" | "Game" => 3,
        "Filme" | "Movie" => 4,
        "Esportes" | "Sports" => 5,
        "Leitura" | "Reading" => 6,
        _ => 0,
    }
}

fn map_eco_from_hw(v: u32) -> String {
    match v {
        1 => "Texto".to_string(),
        2 => "Internet".to_string(),
        3 => "Jogo".to_string(),
        4 => "Filme".to_string(),
        5 => "Esportes".to_string(),
        6 => "Leitura".to_string(),
        _ => "Padrão".to_string(),
    }
}

fn map_color_temp_to_hw(s: &str) -> u32 {
    match s {
        "sRGB" => 1,
        "Quente" | "Warm" => 5,
        "Normal" => 6,
        "Frio" | "Cool" => 8,
        "UserRGB" | "Usuário" => 11,
        _ => 6,
    }
}

fn map_color_temp_from_hw(v: u32) -> String {
    match v {
        1 => "sRGB".to_string(),
        5 => "Quente".to_string(),
        6 => "Normal".to_string(),
        8 => "Frio".to_string(),
        11 => "UserRGB".to_string(),
        _ => "Normal".to_string(),
    }
}

fn map_low_blue_to_hw(s: &str) -> u32 {
    match s {
        "Desligado" | "Off" => 0,
        "Multimídia" | "Multimedia" => 1,
        "Internet" => 2,
        "Escritório" | "Office" => 3,
        "Leitura" | "Reading" => 4,
        _ => 0,
    }
}

fn map_low_blue_from_hw(v: u32) -> String {
    match v {
        1 => "Multimídia".to_string(),
        2 => "Internet".to_string(),
        3 => "Escritório".to_string(),
        4 => "Leitura".to_string(),
        _ => "Desligado".to_string(),
    }
}

fn map_game_mode_to_hw(s: &str) -> u32 {
    match s {
        "Desligado" | "Off" => 0,
        "FPS" => 11,
        "RTS" => 12,
        "Corrida" | "Racing" => 13,
        "Gamer 1" | "Gamer1" => 14,
        "Gamer 2" | "Gamer2" => 15,
        "Gamer 3" | "Gamer3" => 16,
        _ => 0,
    }
}

fn map_game_mode_from_hw(v: u32) -> String {
    match v {
        11 | 1 => "FPS".to_string(),
        12 | 2 => "RTS".to_string(),
        13 | 3 => "Corrida".to_string(),
        14 | 4 => "Gamer 1".to_string(),
        15 | 5 => "Gamer 2".to_string(),
        16 | 6 => "Gamer 3".to_string(),
        _ => "Desligado".to_string(),
    }
}

fn map_overdrive_to_hw(s: &str) -> u32 {
    match s {
        "Desligado" | "Off" => 0,
        "Fraco" | "Weak" => 1,
        "Médio" | "Medium" => 2,
        "Forte" | "Strong" => 3,
        "Boost" => 4,
        _ => 2,
    }
}

fn map_overdrive_from_hw(v: u32) -> String {
    match v {
        0 => "Desligado".to_string(),
        1 => "Fraco".to_string(),
        2 => "Médio".to_string(),
        3 => "Forte".to_string(),
        _ => "Boost".to_string(),
    }
}

fn map_frame_counter_to_hw(s: &str) -> u32 {
    match s {
        "Desligado" | "Off" => 0,
        "Sup. Direito" | "TopRight" => 1,
        "Inf. Direito" | "BotRight" => 2,
        "Inf. Esquerdo" | "BotLeft" => 3,
        "Sup. Esquerdo" | "TopLeft" => 4,
        _ => 0,
    }
}

fn map_frame_counter_from_hw(v: u32) -> String {
    match v {
        1 => "Sup. Direito".to_string(),
        2 => "Inf. Direito".to_string(),
        3 => "Inf. Esquerdo".to_string(),
        4 => "Sup. Esquerdo".to_string(),
        _ => "Desligado".to_string(),
    }
}

fn map_hdr_mode_to_hw(s: &str) -> u32 {
    match s {
        "HDR Picture" | "Picture" => 1,
        "HDR Movie" | "Movie" => 2,
        "HDR Game" | "Game" => 3,
        _ => 0, // "Off"
    }
}

fn map_hdr_mode_from_hw(v: u32) -> String {
    match v {
        1 => "HDR Picture".to_string(),
        2 => "HDR Movie".to_string(),
        3 => "HDR Game".to_string(),
        _ => "Off".to_string(),
    }
}

fn apply_diff_internal(
    driver: &mut DdcDriver,
    target: &MonitorSettings,
    prev: Option<&MonitorSettings>,
) -> ApplyResult {
    let mut applied_count: u32 = 0;
    let mut warnings: Vec<String> = Vec::new();

    let dcr_changed = prev.map(|p| p.dcr != target.dcr).unwrap_or(true);
    let eco_changed = prev.map(|p| p.eco_mode != target.eco_mode).unwrap_or(true);
    let gm_changed = prev.map(|p| p.game_mode != target.game_mode).unwrap_or(true);
    let hdr_changed = prev.map(|p| p.hdr_mode != target.hdr_mode).unwrap_or(true);
    let target_hdr_val = map_hdr_mode_to_hw(&target.hdr_mode);

    // =========================================================================
    // FASE 1: HDR (Master de cor e bloqueio de presets no painel AOC)
    // =========================================================================
    // Se o perfil de destino requer HDR desligado (perfil normal / SDR):
    // Desativa o HDR como primeiro passo para liberar os registradores de
    // Modo de Jogo, Modo ECO, Curva de Gama, Temperatura de Cor e Contraste.
    if target_hdr_val == 0 {
        if hdr_changed {
            let (_, cur_win_hdr) = driver.get_hdr_status();
            if cur_win_hdr {
                let _ = driver.set_hdr(false);
                sleep(Duration::from_millis(150));
            }

            match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_HDR_MODE, 0) {
                Ok(()) => {
                    applied_count += 1;
                    // Aguarda o controlador do monitor chavear o pipeline de imagem de HDR para SDR
                    sleep(Duration::from_millis(250));
                }
                Err(e) => warnings.push(format!("HDR Mode (Off): {}", e)),
            }
        }
    } else {
        // O perfil de destino requer um modo HDR (Picture, Movie, Game).
        // No AOC 24G2S, qualquer Modo de Jogo ativo bloqueia a ativação do HDR.
        // Portanto, se algum Modo de Jogo estava ativo, desliga-o primeiro.
        if prev.map(|p| p.game_mode != "Desligado").unwrap_or(true) {
            let _ = driver.set_vcp(vcp::GAME_MODE, 0);
            sleep(Duration::from_millis(100));
        }

        if hdr_changed {
            let (_, cur_win_hdr) = driver.get_hdr_status();
            if cur_win_hdr {
                let _ = driver.set_hdr(false);
                sleep(Duration::from_millis(150));
            }

            match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_HDR_MODE, target_hdr_val) {
                Ok(()) => {
                    applied_count += 1;
                    sleep(Duration::from_millis(250));
                }
                Err(e) => warnings.push(format!("HDR Mode: {}", e)),
            }
        }
    }

    // =========================================================================
    // FASE 2: Modo de Jogo AOC (0xDC)
    // =========================================================================
    // Aplica o Modo de Jogo antes dos controles finos. Se o HDR estiver ativo,
    // o Modo de Jogo é ignorado pelo hardware, portanto só aplica se HDR for Off.
    if target_hdr_val == 0 && gm_changed {
        let gm_val = map_game_mode_to_hw(&target.game_mode);
        match driver.set_vcp(vcp::GAME_MODE, gm_val) {
            Ok(()) => {
                applied_count += 1;
                sleep(Duration::from_millis(150));
            }
            Err(e) => warnings.push(format!("Modo de Jogo: {}", e)),
        }
    }

    // =========================================================================
    // FASE 3: Modo ECO e DCR (Contraste Dinâmico)
    // =========================================================================
    let is_gm_active = target_hdr_val == 0 && target.game_mode != "Desligado";

    // Se DCR está desligado no perfil, desliga primeiro para liberar brilho/contraste
    if dcr_changed && !target.dcr {
        match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_DCR, 0) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(format!("DCR: {}", e)),
        }
    }

    // Aplica Modo ECO (se ECO for Padrão, destrava brilho/contraste; se for outro, aplica)
    if eco_changed {
        let eco_val = map_eco_to_hw(&target.eco_mode);
        match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_ECO_MODE, eco_val) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(format!("Modo ECO: {}", e)),
        }
    }

    // Se DCR estiver ligado no perfil, ativa-o (apenas se Modo de Jogo não estiver ativo)
    if dcr_changed && target.dcr && !is_gm_active {
        match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_DCR, 1) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(format!("DCR: {}", e)),
        }
    }

    // =========================================================================
    // FASE 4: Restante do perfil (Controles finos de imagem e hardware)
    // =========================================================================

    // 4.1 Brilho (0x10)
    if prev
        .map(|p| p.brightness != target.brightness)
        .unwrap_or(true)
    {
        match driver.set_vcp(vcp::BRIGHTNESS, target.brightness.min(100)) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(format!("Brilho: {}", e)),
        }
    }

    // 4.2 Contraste (0x12) - apenas se não bloqueado por Modo de Jogo ou HDR
    if !is_gm_active && target_hdr_val == 0 {
        if prev.map(|p| p.contrast != target.contrast).unwrap_or(true) {
            match driver.set_vcp(vcp::CONTRAST, target.contrast.min(100)) {
                Ok(()) => applied_count += 1,
                Err(e) => warnings.push(format!("Contraste: {}", e)),
            }
        }
    }

    // 4.3 Curva de Gamma (F8 E1 12) - apenas se não bloqueado por Modo de Jogo ou HDR
    if !is_gm_active && target_hdr_val == 0 {
        if prev.map(|p| p.gamma != target.gamma).unwrap_or(true) {
            let gamma_val = map_gamma_to_hw(&target.gamma);
            match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_GAMMA, gamma_val) {
                Ok(()) => applied_count += 1,
                Err(e) => warnings.push(format!("Gamma: {}", e)),
            }
        }
    }

    // 4.4 Temperatura de Cor e Ganhos RGB (desativados quando HDR está ativo)
    if target_hdr_val == 0 {
        let color_temp_changed = prev
            .map(|p| p.color_temp != target.color_temp)
            .unwrap_or(true);
        let temp_val = map_color_temp_to_hw(&target.color_temp);
        if color_temp_changed {
            match driver.set_vcp(vcp::COLOR_PRESET, temp_val) {
                Ok(()) => applied_count += 1,
                Err(e) => warnings.push(format!("Temperatura de Cor: {}", e)),
            }
        }

        if temp_val == 11 {
            if color_temp_changed || prev.map(|p| p.r != target.r).unwrap_or(true) {
                let _ = driver.set_vcp(vcp::RED_GAIN, target.r.min(100));
                applied_count += 1;
            }
            if color_temp_changed || prev.map(|p| p.g != target.g).unwrap_or(true) {
                let _ = driver.set_vcp(vcp::GREEN_GAIN, target.g.min(100));
                applied_count += 1;
            }
            if color_temp_changed || prev.map(|p| p.b != target.b).unwrap_or(true) {
                let _ = driver.set_vcp(vcp::BLUE_GAIN, target.b.min(100));
                applied_count += 1;
            }
        }
    }

    // 4.5 Low Blue Light (F8 E1 59: 0..4) - desativado em HDR
    if target_hdr_val == 0 {
        if prev.map(|p| p.low_blue != target.low_blue).unwrap_or(true) {
            let lb_val = map_low_blue_to_hw(&target.low_blue);
            match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_LOW_BLUE, lb_val) {
                Ok(()) => applied_count += 1,
                Err(e) => warnings.push(format!("Low Blue Light: {}", e)),
            }
        }
    }

    // 4.6 Game Color (F8 E1 57: 0..20) - bloqueado em HDR e em presets FPS/RTS/Corrida
    let is_preset_game_mode = matches!(target.game_mode.as_str(), "FPS" | "RTS" | "Corrida");
    if target_hdr_val == 0 && !is_preset_game_mode {
        if prev
            .map(|p| p.game_color != target.game_color)
            .unwrap_or(true)
        {
            let gc_val = target.game_color.min(20);
            match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_GAME_COLOR, gc_val) {
                Ok(()) => applied_count += 1,
                Err(e) => warnings.push(format!("Game Color: {}", e)),
            }
        }
    }

    // 4.7 Shadow Control (F8 E1 58: 0..100 em passos de 10) - bloqueado em HDR e presets
    if target_hdr_val == 0 && !is_preset_game_mode {
        if prev
            .map(|p| p.shadow_control != target.shadow_control)
            .unwrap_or(true)
        {
            let sc_val = (((target.shadow_control + 5) / 10) * 10).min(100);
            match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_SHADOW_CONTROL, sc_val) {
                Ok(()) => applied_count += 1,
                Err(e) => warnings.push(format!("Shadow Control: {}", e)),
            }
        }
    }

    // 4.8 Overdrive (F8 E1 51: 0..4) - funciona sempre em qualquer modo
    if prev
        .map(|p| p.overdrive != target.overdrive)
        .unwrap_or(true)
    {
        let od_val = map_overdrive_to_hw(&target.overdrive);
        match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_OVERDRIVE, od_val) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(format!("Overdrive: {}", e)),
        }
    }

    // 4.9 Mira na Tela / Dial Point (F8 E1 5A: 0..1)
    if prev
        .map(|p| p.crosshair != target.crosshair)
        .unwrap_or(true)
    {
        let dp_val = if target.crosshair { 1 } else { 0 };
        match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_DIAL_POINT, dp_val) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(format!("Mira na Tela: {}", e)),
        }
    }

    // 4.10 Frame Counter (F8 E1 5B: 0..4)
    if prev
        .map(|p| p.frame_counter != target.frame_counter)
        .unwrap_or(true)
    {
        let fc_val = map_frame_counter_to_hw(&target.frame_counter);
        match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_FRAME_COUNTER, fc_val) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(format!("Frame Counter: {}", e)),
        }
    }

    // 4.11 Adaptive-Sync / AMD FreeSync (via ADLX)
    if prev
        .map(|p| p.adaptive_sync != target.adaptive_sync)
        .unwrap_or(false)
    {
        match driver.set_adaptive_sync(target.adaptive_sync) {
            Ok(()) => applied_count += 1,
            Err(e) => warnings.push(e),
        }
    } else if prev.is_none() {
        let (sup, _) = driver.get_adaptive_sync_status();
        if sup {
            let _ = driver.set_adaptive_sync(target.adaptive_sync);
            applied_count += 1;
        } else if target.adaptive_sync {
            warnings.push(
                "Ative 'Adaptive-Sync' uma única vez nos botões físicos do monitor (Config. Jogo → Adaptive-Sync) para alternar FreeSync pelo app."
                    .to_string(),
            );
        }
    }

    ApplyResult {
        applied_count,
        warnings,
    }
}

#[tauri::command]
fn frontend_log(level: String, message: String) {
    log_msg(&format!("Frontend:{}", level), &message);
}

#[tauri::command]
fn get_monitor_info(state: State<'_, AppState>) -> MonitorInfo {
    log_msg("Rust", ">> get_monitor_info chamado");
    let mut guard = match state.driver.lock() {
        Ok(g) => g,
        Err(e) => {
            log_msg("Rust", &format!("Falha ao obter lock em get_monitor_info: {}", e));
            return MonitorInfo {
                name: "AOC 24G2S".to_string(),
                connection: "DisplayPort".to_string(),
                ddc_supported: false,
                hdr_supported: false,
                hdr_enabled: false,
                adaptive_sync_supported: true,
                adaptive_sync_enabled: false,
            };
        }
    };
    if let Ok(driver) = ensure_driver(&mut guard) {
        log_msg("Rust", "Consultando driver.get_monitor_info()...");
        let info = driver.get_monitor_info();
        log_msg(
            "Rust",
            &format!(
                "<< get_monitor_info concluído: name='{}', ddc={}, vrr={}",
                info.name, info.ddc_supported, info.adaptive_sync_supported
            ),
        );
        info
    } else {
        log_msg("Rust", "ensure_driver falhou em get_monitor_info");
        MonitorInfo {
            name: "AOC 24G2S".to_string(),
            connection: "DisplayPort".to_string(),
            ddc_supported: false,
            hdr_supported: false,
            hdr_enabled: false,
            adaptive_sync_supported: true,
            adaptive_sync_enabled: false,
        }
    }
}

fn read_hardware_settings_internal(driver: &mut DdcDriver) -> MonitorSettings {
    let brightness = driver.get_vcp(vcp::BRIGHTNESS).map(|(c, _)| c.min(100)).unwrap_or(80);
    let contrast = driver.get_vcp(vcp::CONTRAST).map(|(c, _)| c.min(100)).unwrap_or(50);
    let color_temp = driver
        .get_vcp(vcp::COLOR_PRESET)
        .map(|(c, _)| map_color_temp_from_hw(c))
        .unwrap_or_else(|_| "Normal".to_string());
    let r = driver.get_vcp(vcp::RED_GAIN).map(|(c, _)| c.min(100)).unwrap_or(50);
    let g = driver.get_vcp(vcp::GREEN_GAIN).map(|(c, _)| c.min(100)).unwrap_or(50);
    let b = driver.get_vcp(vcp::BLUE_GAIN).map(|(c, _)| c.min(100)).unwrap_or(50);
    let game_mode = driver
        .get_vcp(vcp::GAME_MODE)
        .map(|(c, _)| map_game_mode_from_hw(c))
        .unwrap_or_else(|_| "Desligado".to_string());

    let eco_mode = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_ECO_MODE)
        .map(|(c, _)| map_eco_from_hw(c))
        .unwrap_or_else(|_| "Padrão".to_string());
    let gamma = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_GAMMA)
        .map(|(c, _)| map_gamma_from_hw(c))
        .unwrap_or_else(|_| "Gamma 1".to_string());
    let dcr = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_DCR)
        .map(|(c, _)| c != 0)
        .unwrap_or(false);
    let overdrive = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_OVERDRIVE)
        .map(|(c, _)| map_overdrive_from_hw(c))
        .unwrap_or_else(|_| "Médio".to_string());
    let game_color = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_GAME_COLOR)
        .map(|(c, _)| c.min(20))
        .unwrap_or(10);
    let shadow_control = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_SHADOW_CONTROL)
        .map(|(c, _)| (((c + 5) / 10) * 10).min(100))
        .unwrap_or(50);
    let low_blue = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_LOW_BLUE)
        .map(|(c, _)| map_low_blue_from_hw(c))
        .unwrap_or_else(|_| "Desligado".to_string());
    let crosshair = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_DIAL_POINT)
        .map(|(c, _)| c != 0)
        .unwrap_or(false);
    let frame_counter = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_FRAME_COUNTER)
        .map(|(c, _)| map_frame_counter_from_hw(c))
        .unwrap_or_else(|_| "Desligado".to_string());

    let hdr_mode = driver
        .get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_HDR_MODE)
        .map(|(c, _)| map_hdr_mode_from_hw(c))
        .unwrap_or_else(|_| "Off".to_string());
    let (_, fs_ena) = driver.get_adaptive_sync_status();

    MonitorSettings {
        brightness,
        contrast,
        gamma,
        eco_mode,
        dcr,
        color_temp,
        r,
        g,
        b,
        game_color,
        low_blue,
        game_mode,
        overdrive,
        shadow_control,
        adaptive_sync: fs_ena,
        crosshair,
        frame_counter,
        hdr_mode,
    }
}

#[tauri::command]
fn read_hardware_settings(state: State<'_, AppState>) -> Result<MonitorSettings, String> {
    log_msg("Rust", ">> read_hardware_settings chamado");
    let mut guard = state.driver.lock().map_err(|e| e.to_string())?;
    let driver = ensure_driver(&mut guard)?;
    let live = read_hardware_settings_internal(driver);
    log_msg("Rust", "<< read_hardware_settings concluído com sucesso");
    *state.last_applied.lock().unwrap() = Some(live.clone());

    // Se o hardware já estiver com o overdrive alvo, encerra polling pendente
    let mut v_guard = state.overdrive_verifier.lock().unwrap();
    if let Some(v) = v_guard.as_ref() {
        if map_overdrive_to_hw(&v.target) == map_overdrive_to_hw(&live.overdrive) {
            *v_guard = None;
        }
    }

    Ok(live)
}

#[tauri::command]
fn apply_changed_settings(
    current: MonitorSettings,
    initial: MonitorSettings,
    state: State<'_, AppState>,
) -> Result<ApplyResult, String> {
    log_msg("Rust", ">> apply_changed_settings chamado");
    let mut guard = state.driver.lock().map_err(|e| e.to_string())?;
    let driver = ensure_driver(&mut guard)?;
    let res = apply_diff_internal(driver, &current, Some(&initial));
    log_msg(
        "Rust",
        &format!(
            "<< apply_changed_settings: {} aplicados, {} avisos",
            res.applied_count,
            res.warnings.len()
        ),
    );
    *state.last_applied.lock().unwrap() = Some(current.clone());
    drop(guard);

    if current.overdrive != initial.overdrive || current.game_mode != initial.game_mode {
        trigger_overdrive_verification(&state, current.overdrive.clone());
    }
    let blocking_changed = initial.hdr_mode != current.hdr_mode
        || initial.game_mode != current.game_mode
        || initial.eco_mode != current.eco_mode;
    trigger_profile_verification(&state, current.clone(), blocking_changed);

    Ok(res)
}

#[tauri::command]
fn apply_monitor_settings(
    settings: MonitorSettings,
    state: State<'_, AppState>,
) -> Result<ApplyResult, String> {
    log_msg("Rust", ">> apply_monitor_settings chamado");
    let mut guard = state.driver.lock().map_err(|e| e.to_string())?;
    let driver = ensure_driver(&mut guard)?;
    let mut last_guard = state.last_applied.lock().unwrap();
    if last_guard.is_none() {
        log_msg("Rust", "apply_monitor_settings: lendo valores iniciais do hardware...");
        *last_guard = Some(read_hardware_settings_internal(driver));
    }
    let prev = last_guard.clone();
    let res = apply_diff_internal(driver, &settings, prev.as_ref());
    log_msg(
        "Rust",
        &format!(
            "<< apply_monitor_settings: {} aplicados, {} avisos",
            res.applied_count,
            res.warnings.len()
        ),
    );
    *last_guard = Some(settings.clone());
    drop(last_guard);
    drop(guard);

    let blocking_changed = prev.as_ref().map(|p| {
        p.hdr_mode != settings.hdr_mode
            || p.game_mode != settings.game_mode
            || p.eco_mode != settings.eco_mode
    }).unwrap_or(true);

    trigger_overdrive_verification(&state, settings.overdrive.clone());
    trigger_profile_verification(&state, settings.clone(), blocking_changed);

    Ok(res)
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn is_window_maximized(window: tauri::Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

const TRAY_ID: &str = "main";

fn build_tray_menu<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    show_label: &str,
    quit_label: &str,
) -> tauri::Result<tauri::menu::Menu<R>> {
    let show_item = tauri::menu::MenuItem::with_id(manager, "show", show_label, true, None::<&str>)?;
    let quit_item = tauri::menu::MenuItem::with_id(manager, "quit", quit_label, true, None::<&str>)?;
    tauri::menu::Menu::with_items(manager, &[&show_item, &quit_item])
}

/// Atualiza os rótulos do menu da bandeja com o idioma escolhido no frontend.
#[tauri::command]
fn set_tray_labels(app: tauri::AppHandle, show: String, quit: String) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "Ícone da bandeja não encontrado".to_string())?;
    let menu = build_tray_menu(&app, &show, &quit).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_auto_profile_config(
    config: AutoProfileConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log_msg(
        "AutoProfile",
        &format!(
            "Configuração atualizada: ativa={}, padrão='{}', perfis vinculados={}",
            config.enabled,
            config.default_mode_id,
            config.profiles.len()
        ),
    );
    *state.auto_config.lock().unwrap() = Some(config);
    Ok(())
}

#[tauri::command]
fn export_json_dialog(default_filename: String, contents: String) -> Result<bool, String> {
    if let Some(path) = native_dialog::pick_save_file(&default_filename) {
        std::fs::write(&path, contents).map_err(|e| format!("Falha ao salvar arquivo: {}", e))?;
        log_msg("Export", &format!("Arquivo JSON salvo com sucesso em: {}", path.display()));
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(target_os = "windows")]
mod native_dialog {
    use std::ffi::c_void;
    use std::path::PathBuf;

    type HWND = *mut c_void;
    type HINSTANCE = *mut c_void;
    type LPCWSTR = *const u16;
    type LPWSTR = *mut u16;
    type DWORD = u32;
    type WORD = u16;
    type LPARAM = isize;

    #[repr(C)]
    #[allow(non_snake_case)]
    struct OPENFILENAMEW {
        lStructSize: DWORD,
        hwndOwner: HWND,
        hInstance: HINSTANCE,
        lpstrFilter: LPCWSTR,
        lpstrCustomFilter: LPWSTR,
        nMaxCustFilter: DWORD,
        nFilterIndex: DWORD,
        lpstrFile: LPWSTR,
        nMaxFile: DWORD,
        lpstrFileTitle: LPWSTR,
        nMaxFileTitle: DWORD,
        lpstrInitialDir: LPCWSTR,
        lpstrTitle: LPCWSTR,
        Flags: DWORD,
        nFileOffset: WORD,
        nFileExtension: WORD,
        lpstrDefExt: LPCWSTR,
        lCustData: LPARAM,
        lpfnHook: *mut c_void,
        lpTemplateName: LPCWSTR,
        pvReserved: *mut c_void,
        dwReserved: DWORD,
        FlagsEx: DWORD,
    }

    #[link(name = "comdlg32")]
    unsafe extern "system" {
        fn GetSaveFileNameW(lpofn: *mut OPENFILENAMEW) -> i32;
    }

    pub fn pick_save_file(default_filename: &str) -> Option<PathBuf> {
        unsafe {
            let mut file_buf = [0u16; 1024];
            let def_name_w: Vec<u16> = default_filename.encode_utf16().collect();
            let copy_len = def_name_w.len().min(file_buf.len() - 1);
            file_buf[..copy_len].copy_from_slice(&def_name_w[..copy_len]);

            let filter = "Arquivos JSON (*.json)\0*.json\0Todos os arquivos (*.*)\0*.*\0\0"
                .encode_utf16()
                .collect::<Vec<u16>>();
            let title = "Salvar Arquivo JSON\0".encode_utf16().collect::<Vec<u16>>();
            let def_ext = "json\0".encode_utf16().collect::<Vec<u16>>();

            const OFN_OVERWRITEPROMPT: DWORD = 0x00000002;
            const OFN_PATHMUSTEXIST: DWORD = 0x00000800;
            const OFN_EXPLORER: DWORD = 0x00080000;

            let mut ofn: OPENFILENAMEW = std::mem::zeroed();
            ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as DWORD;
            ofn.lpstrFilter = filter.as_ptr();
            ofn.lpstrFile = file_buf.as_mut_ptr();
            ofn.nMaxFile = file_buf.len() as DWORD;
            ofn.lpstrTitle = title.as_ptr();
            ofn.lpstrDefExt = def_ext.as_ptr();
            ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_EXPLORER;

            if GetSaveFileNameW(&mut ofn) != 0 {
                let len = file_buf.iter().position(|&c| c == 0).unwrap_or(file_buf.len());
                let path_str = String::from_utf16_lossy(&file_buf[..len]);
                if !path_str.trim().is_empty() {
                    return Some(PathBuf::from(path_str));
                }
            }
        }
        None
    }
}

#[cfg(target_os = "linux")]
mod native_dialog {
    use std::path::PathBuf;
    use std::process::Command;

    pub fn pick_save_file(default_filename: &str) -> Option<PathBuf> {
        if let Ok(out) = Command::new("zenity")
            .args(&[
                "--file-selection",
                "--save",
                "--confirm-overwrite",
                &format!("--filename={}", default_filename),
                "--file-filter=Arquivos JSON (*.json) | *.json",
            ])
            .output()
        {
            if out.status.success() {
                let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path_str.is_empty() {
                    return Some(PathBuf::from(path_str));
                }
            }
        }
        if let Ok(out) = Command::new("kdialog")
            .args(&["--getsavefilename", default_filename, "*.json|Arquivos JSON (*.json)"])
            .output()
        {
            if out.status.success() {
                let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path_str.is_empty() {
                    return Some(PathBuf::from(path_str));
                }
            }
        }
        None
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
mod native_dialog {
    use std::path::PathBuf;
    pub fn pick_save_file(_default_filename: &str) -> Option<PathBuf> {
        None
    }
}

#[tauri::command]
fn get_running_apps() -> Vec<RunningAppInfo> {
    app_process::list_running_apps()
}

/// Normaliza um nome de executável para comparação (minúsculas, sem `.exe`),
/// permitindo vincular tanto `cs2.exe` (Windows/Proton) quanto `firefox` (Linux).
fn normalize_exe(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    lower.strip_suffix(".exe").map(str::to_string).unwrap_or(lower)
}

fn is_self_exe(name: &str) -> bool {
    matches!(
        normalize_exe(name).as_str(),
        "aoc-control-studio" | "aoc control studio" | "app"
    )
}

/// Identifica o "executável atual" usado pela automação de perfis.
#[cfg(target_os = "windows")]
fn detect_current_exe(_config: Option<&AutoProfileConfig>) -> Option<String> {
    app_process::get_foreground_exe_name()
}

/// No Linux usa a janela X11/XWayland em foco (jogos Wine/Proton/Steam). Quando o
/// foco está em uma janela Wayland nativa (sem API padrão de foco), verifica se
/// algum executável vinculado está em execução; caso contrário, considera Desktop.
#[cfg(target_os = "linux")]
fn detect_current_exe(config: Option<&AutoProfileConfig>) -> Option<String> {
    if let Some(fg) = app_process::get_foreground_exe_name() {
        return Some(fg);
    }
    let config = config?;
    let running = app_process::running_process_names();
    for profile in &config.profiles {
        for exe in &profile.exes {
            if running.contains(&normalize_exe(exe)) {
                return Some(normalize_exe(exe));
            }
        }
    }
    Some("__desktop__".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn detect_current_exe(_config: Option<&AutoProfileConfig>) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
mod win_process {
    use super::*;
    use std::ffi::c_void;

    type HWND = *mut c_void;
    type HANDLE = *mut c_void;
    type DWORD = u32;
    type BOOL = i32;
    type LPARAM = isize;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetForegroundWindow() -> HWND;
        fn GetWindowThreadProcessId(hwnd: HWND, lpdw_process_id: *mut DWORD) -> DWORD;
        fn EnumWindows(lp_enum_func: unsafe extern "system" fn(HWND, LPARAM) -> BOOL, lparam: LPARAM) -> BOOL;
        fn IsWindowVisible(hwnd: HWND) -> BOOL;
        fn GetWindowTextLengthW(hwnd: HWND) -> i32;
        fn GetWindowTextW(hwnd: HWND, lp_string: *mut u16, n_max_count: i32) -> i32;
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct PROCESSENTRY32W {
        dwSize: DWORD,
        cntUsage: DWORD,
        th32ProcessID: DWORD,
        th32DefaultHeapID: usize,
        th32ModuleID: DWORD,
        cntThreads: DWORD,
        th32ParentProcessID: DWORD,
        pcPriClassBase: i32,
        dwFlags: DWORD,
        szExeFile: [u16; 260],
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(dw_desired_access: DWORD, b_inherit_handle: BOOL, dw_process_id: DWORD) -> HANDLE;
        fn QueryFullProcessImageNameW(h_process: HANDLE, dw_flags: DWORD, lp_exe_name: *mut u16, lpdw_size: *mut DWORD) -> BOOL;
        fn CloseHandle(h_object: HANDLE) -> BOOL;
        fn CreateToolhelp32Snapshot(dw_flags: DWORD, th32_process_id: DWORD) -> HANDLE;
        fn Process32FirstW(h_snapshot: HANDLE, lppe: *mut PROCESSENTRY32W) -> BOOL;
        fn Process32NextW(h_snapshot: HANDLE, lppe: *mut PROCESSENTRY32W) -> BOOL;
        fn GetCurrentProcess() -> HANDLE;
    }

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn OpenProcessToken(ProcessHandle: HANDLE, DesiredAccess: DWORD, TokenHandle: *mut HANDLE) -> BOOL;
        fn LookupPrivilegeValueW(lpSystemName: *const u16, lpName: *const u16, lpLuid: *mut u64) -> BOOL;
        fn AdjustTokenPrivileges(
            TokenHandle: HANDLE,
            DisableAllPrivileges: BOOL,
            NewState: *const TOKEN_PRIVILEGES,
            BufferLength: DWORD,
            PreviousState: *mut std::ffi::c_void,
            ReturnLength: *mut DWORD,
        ) -> BOOL;
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct LUID_AND_ATTRIBUTES {
        Luid: u64,
        Attributes: DWORD,
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct TOKEN_PRIVILEGES {
        PrivilegeCount: DWORD,
        Privileges: [LUID_AND_ATTRIBUTES; 1],
    }

    pub fn enable_debug_privilege() {
        unsafe {
            const TOKEN_ADJUST_PRIVILEGES: DWORD = 0x0020;
            const TOKEN_QUERY: DWORD = 0x0008;
            const SE_PRIVILEGE_ENABLED: DWORD = 0x00000002;

            let mut h_token: HANDLE = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut h_token) == 0 {
                return;
            }

            let priv_name: Vec<u16> = "SeDebugPrivilege\0".encode_utf16().collect();
            let mut luid: u64 = 0;
            if LookupPrivilegeValueW(std::ptr::null(), priv_name.as_ptr(), &mut luid) != 0 {
                let tp = TOKEN_PRIVILEGES {
                    PrivilegeCount: 1,
                    Privileges: [LUID_AND_ATTRIBUTES {
                        Luid: luid,
                        Attributes: SE_PRIVILEGE_ENABLED,
                    }],
                };
                let res = AdjustTokenPrivileges(
                    h_token,
                    0,
                    &tp,
                    std::mem::size_of::<TOKEN_PRIVILEGES>() as DWORD,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
                if res != 0 {
                    log_msg("WinProcess", "Privilégio SeDebugPrivilege ativado para inspeção irrestrita de processos elevados/administrador");
                }
            }
            CloseHandle(h_token);
        }
    }

    pub fn get_foreground_exe_name() -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }
            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return None;
            }
            get_process_exe_by_pid(pid)
        }
    }

    pub fn get_process_exe_by_pid(pid: DWORD) -> Option<String> {
        unsafe {
            // Tentativa 1: OpenProcess com PROCESS_QUERY_LIMITED_INFORMATION
            const PROCESS_QUERY_LIMITED_INFORMATION: DWORD = 0x1000;
            let h_proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if !h_proc.is_null() {
                let mut buf = [0u16; 1024];
                let mut size = buf.len() as DWORD;
                let ok = QueryFullProcessImageNameW(h_proc, 0, buf.as_mut_ptr(), &mut size);
                CloseHandle(h_proc);

                if ok != 0 && size > 0 {
                    let full_path = String::from_utf16_lossy(&buf[..size as usize]);
                    let exe = std::path::Path::new(&full_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_lowercase());
                    if exe.is_some() {
                        return exe;
                    }
                }
            }

            // Tentativa 2 (Fallback para jogos/programas abertos como Administrador):
            // CreateToolhelp32Snapshot consulta a lista do kernel diretamente sem exigir permissões de abertura de handle do processo
            const TH32CS_SNAPPROCESS: DWORD = 0x00000002;
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if !snap.is_null() && snap as isize != -1 {
                let mut entry: PROCESSENTRY32W = std::mem::zeroed();
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as DWORD;
                if Process32FirstW(snap, &mut entry) != 0 {
                    loop {
                        if entry.th32ProcessID == pid {
                            CloseHandle(snap);
                            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                            let exe_str = String::from_utf16_lossy(&entry.szExeFile[..len]).trim().to_lowercase();
                            if !exe_str.is_empty() {
                                return Some(exe_str);
                            }
                            return None;
                        }
                        if Process32NextW(snap, &mut entry) == 0 {
                            break;
                        }
                    }
                }
                CloseHandle(snap);
            }
        }
        None
    }

    struct EnumContext {
        apps: Vec<RunningAppInfo>,
    }

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let ctx = &mut *(lparam as *mut EnumContext);
            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }
            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 {
                return 1;
            }
            let mut title_buf = vec![0u16; (len + 1) as usize];
            let copied = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), (len + 1) as i32);
            if copied <= 0 {
                return 1;
            }
            let title = String::from_utf16_lossy(&title_buf[..copied as usize]).trim().to_string();
            if title.is_empty() {
                return 1;
            }

            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return 1;
            }

            if let Some(exe) = get_process_exe_by_pid(pid) {
                let exe_lower = exe.to_lowercase();
                let ignore = [
                    "explorer.exe",
                    "aoc-control-studio.exe",
                    "app.exe",
                    "shellexperiencehost.exe",
                    "searchhost.exe",
                    "textinputhost.exe",
                    "applicationframehost.exe",
                    "systemsettings.exe",
                ];
                if !ignore.contains(&exe_lower.as_str()) {
                    if !ctx.apps.iter().any(|a| a.exe_name == exe_lower) {
                        ctx.apps.push(RunningAppInfo {
                            name: title,
                            exe_name: exe_lower,
                        });
                    }
                }
            }
            1
        }
    }

    pub fn list_running_apps() -> Vec<RunningAppInfo> {
        let mut ctx = EnumContext { apps: Vec::new() };
        unsafe {
            EnumWindows(enum_windows_proc, &mut ctx as *mut EnumContext as LPARAM);
        }
        ctx.apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        ctx.apps
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
mod app_process {
    use super::*;
    pub fn list_running_apps() -> Vec<RunningAppInfo> {
        Vec::new()
    }
}

fn start_auto_profile_monitor(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_applied_mode_id = String::new();
        let mut last_foreground_exe = String::new();

        loop {
            sleep(Duration::from_millis(800));

            let state = app_handle.state::<AppState>();
            let config_opt = state.auto_config.lock().unwrap().clone();

            let current_exe = detect_current_exe(config_opt.as_ref()).unwrap_or_default();
            if current_exe.is_empty() || current_exe == last_foreground_exe {
                continue;
            }
            last_foreground_exe = current_exe.clone();

            // Não aplica mudanças enquanto o usuário estiver interagindo com a própria interface do app
            if is_self_exe(&current_exe) {
                continue;
            }

            let config = match config_opt {
                Some(c) if c.enabled => c,
                _ => continue,
            };

            // Busca se o executável em foco está associado a algum perfil específico
            let current_norm = normalize_exe(&current_exe);
            let matched = config.profiles.iter().find(|p| {
                p.exes.iter().any(|e| normalize_exe(e) == current_norm)
            });

            let (target_id, target_settings) = match matched {
                Some(p) => (p.mode_id.clone(), p.settings.clone()),
                None => (config.default_mode_id.clone(), config.default_settings.clone()),
            };

            if target_id.is_empty() || target_id == last_applied_mode_id {
                continue;
            }

            log_msg(
                "AutoProfile",
                &format!(
                    "App em foco: '{}' -> alternando perfil: '{}' -> '{}'",
                    current_exe, last_applied_mode_id, target_id
                ),
            );
            last_applied_mode_id = target_id.clone();

            let mut guard = match state.driver.lock() {
                Ok(g) => g,
                Err(_) => continue,
            };
            let mut blocking_changed = true;
            if let Ok(driver) = ensure_driver(&mut guard) {
                let prev = {
                    let mut last_guard = state.last_applied.lock().unwrap();
                    if last_guard.is_none() {
                        log_msg("AutoProfile", "Lendo estado inicial do monitor...");
                        *last_guard = Some(read_hardware_settings_internal(driver));
                    }
                    last_guard.clone()
                };

                blocking_changed = prev.as_ref().map(|p| {
                    p.hdr_mode != target_settings.hdr_mode
                        || p.game_mode != target_settings.game_mode
                        || p.eco_mode != target_settings.eco_mode
                }).unwrap_or(true);

                let res = apply_diff_internal(driver, &target_settings, prev.as_ref());
                log_msg(
                    "AutoProfile",
                    &format!(
                        "Perfil '{}' aplicado: {} comandos, {} avisos",
                        target_id, res.applied_count, res.warnings.len()
                    ),
                );
                for w in &res.warnings {
                    log_msg("AutoProfile", &format!("  [Aviso] {}", w));
                }
                *state.last_applied.lock().unwrap() = Some(target_settings.clone());
            }
            drop(guard);

            trigger_overdrive_verification(&state, target_settings.overdrive.clone());
            trigger_profile_verification(&state, target_settings.clone(), blocking_changed);

            // Emite evento para que a interface atualize o card selecionado
            let _ = app_handle.emit("auto-profile-changed", target_id);
        }
    });
}

fn start_overdrive_verifier_loop(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            sleep(Duration::from_millis(1000));

            let state = app_handle.state::<AppState>();

            // 1. Verifica se há checagem pendente e se o tempo de estabilização já passou
            let check_data = {
                let guard = state.overdrive_verifier.lock().unwrap();
                match &*guard {
                    Some(v) => {
                        if Instant::now() < v.next_check {
                            None
                        } else {
                            Some((v.target.clone(), v.attempts, v.max_attempts))
                        }
                    }
                    None => None,
                }
            };

            let (target, attempts, max_attempts) = match check_data {
                Some(d) => d,
                None => continue, // Polling desligado ou aguardando próximo intervalo
            };

            let target_hw = map_overdrive_to_hw(&target);
            log_msg(
                "OverdriveVerifier",
                &format!(
                    "Verificando Overdrive no monitor (esperado: '{}' [código {}], checagem {}/{})...",
                    target,
                    target_hw,
                    attempts + 1,
                    max_attempts
                ),
            );

            // 2. Tenta obter lock do driver DDC
            let mut guard = match state.driver.lock() {
                Ok(g) => g,
                Err(_) => continue,
            };

            let driver = match ensure_driver(&mut guard) {
                Ok(d) => d,
                Err(e) => {
                    log_msg("OverdriveVerifier", &format!("Falha ao conectar driver DDC: {}", e));
                    let mut v_guard = state.overdrive_verifier.lock().unwrap();
                    if let Some(v) = v_guard.as_mut() {
                        v.attempts += 1;
                        v.next_check = Instant::now() + Duration::from_millis(2000);
                        if v.attempts >= v.max_attempts {
                            log_msg(
                                "OverdriveVerifier",
                                "Limite de tentativas atingido após erros de conexão. Desligando polling.",
                            );
                            *v_guard = None;
                        }
                    }
                    continue;
                }
            };

            // 3. Lê o Overdrive atual diretamente do hardware via DDC (TPV F8 E1 51)
            match driver.get_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_OVERDRIVE) {
                Ok((cur_code, _)) => {
                    let cur_str = map_overdrive_from_hw(cur_code);
                    if cur_code == target_hw {
                        log_msg(
                            "OverdriveVerifier",
                            &format!(
                                "OK! Overdrive confirmado em '{}' no hardware do monitor. Polling desligado com sucesso.",
                                cur_str
                            ),
                        );
                        let mut v_guard = state.overdrive_verifier.lock().unwrap();
                        *v_guard = None; // Desliga o polling até a próxima troca de perfil
                        let _ = app_handle.emit("overdrive-verified", &cur_str);
                    } else {
                        log_msg(
                            "OverdriveVerifier",
                            &format!(
                                "Divergência detectada: hardware está '{}' (código {}), mas o perfil requer '{}' (código {}). Reaplicando...",
                                cur_str, cur_code, target, target_hw
                            ),
                        );
                        match driver.set_tpv_vcp(vcp::TPV_F8, vcp::TPV_E1, vcp::EXT_OVERDRIVE, target_hw) {
                            Ok(()) => {
                                log_msg(
                                    "OverdriveVerifier",
                                    &format!("Comando Overdrive ('{}') reaplicado no monitor.", target),
                                );
                            }
                            Err(e) => {
                                log_msg(
                                    "OverdriveVerifier",
                                    &format!("Erro ao reenviar Overdrive ao monitor: {}", e),
                                );
                            }
                        }

                        let mut v_guard = state.overdrive_verifier.lock().unwrap();
                        if let Some(v) = v_guard.as_mut() {
                            v.attempts += 1;
                            v.next_check = Instant::now() + Duration::from_millis(2500);
                            if v.attempts >= v.max_attempts {
                                log_msg(
                                    "OverdriveVerifier",
                                    &format!(
                                        "Limite de {} tentativas atingido (o monitor pode estar com Overdrive travado pelo Modo de Jogo atual). Desligando polling.",
                                        v.max_attempts
                                    ),
                                );
                                *v_guard = None;
                            }
                        }
                    }
                }
                Err(e) => {
                    log_msg(
                        "OverdriveVerifier",
                        &format!("Erro na leitura DDC do Overdrive: {}. Aguardando próxima checagem.", e),
                    );
                    let mut v_guard = state.overdrive_verifier.lock().unwrap();
                    if let Some(v) = v_guard.as_mut() {
                        v.attempts += 1;
                        v.next_check = Instant::now() + Duration::from_millis(2500);
                        if v.attempts >= v.max_attempts {
                            log_msg(
                                "OverdriveVerifier",
                                "Limite de tentativas atingido após erros de leitura. Desligando polling.",
                            );
                            *v_guard = None;
                        }
                    }
                }
            }
        }
    });
}

fn start_profile_verifier_loop(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            sleep(Duration::from_millis(250));

            let state = app_handle.state::<AppState>();

            // Verifica se há checagem pendente e se o tempo de 2.5s já passou
            let check_data = {
                let mut guard = state.profile_verifier.lock().unwrap();
                match &*guard {
                    Some(pv) if Instant::now() >= pv.check_at => {
                        let t = pv.target.clone();
                        let step = pv.step;
                        let blocking = pv.blocking_mode_changed;
                        *guard = None; // Desliga imediatamente a tarefa atual
                        Some((t, step, blocking))
                    }
                    _ => None,
                }
            };

            let (target, step, mut blocking_changed) = match check_data {
                Some(d) => d,
                None => continue,
            };

            log_msg(
                "ProfileVerifier",
                &format!(
                    ">> Executando Polling {} pós-troca de perfil (2.5s após disparo, alterou_bloqueios={})...",
                    step, blocking_changed
                ),
            );

            let mut guard = match state.driver.lock() {
                Ok(g) => g,
                Err(_) => continue,
            };

            let driver = match ensure_driver(&mut guard) {
                Ok(d) => d,
                Err(e) => {
                    log_msg("ProfileVerifier", &format!("Falha ao conectar driver DDC: {}", e));
                    continue;
                }
            };

            // 1. Lê os parâmetros reais gravados no hardware do monitor
            let live = read_hardware_settings_internal(driver);

            // Se o hardware estiver divergente em HDR, Modo de Jogo ou ECO, confirma alteração de bloqueio
            if live.hdr_mode != target.hdr_mode
                || live.game_mode != target.game_mode
                || live.eco_mode != target.eco_mode
            {
                blocking_changed = true;
            }

            // 2. Se o Overdrive já estiver correto no hardware, encerra o polling de overdrive
            let mut ov_guard = state.overdrive_verifier.lock().unwrap();
            if let Some(v) = ov_guard.as_ref() {
                if map_overdrive_to_hw(&v.target) == map_overdrive_to_hw(&live.overdrive) {
                    log_msg(
                        "ProfileVerifier",
                        "Overdrive já confirmado correto no hardware; polling de overdrive encerrado.",
                    );
                    *ov_guard = None;
                }
            }
            drop(ov_guard);

            // 3. Re-aplica apenas o que estiver divergente do perfil alvo
            let res = apply_diff_internal(driver, &target, Some(&live));
            if res.applied_count > 0 {
                log_msg(
                    "ProfileVerifier",
                    &format!(
                        "<< Polling {} pós-troca concluído: corrigidos {} parâmetro(s) divergente(s) no monitor.",
                        step, res.applied_count
                    ),
                );
                for w in &res.warnings {
                    log_msg("ProfileVerifier", &format!("  [Aviso] {}", w));
                }
            } else {
                log_msg(
                    "ProfileVerifier",
                    &format!(
                        "<< Polling {} pós-troca concluído: monitor 100% condizente com o perfil alvo.",
                        step
                    ),
                );
            }

            *state.last_applied.lock().unwrap() = Some(target.clone());
            drop(guard);

            // 4. Se for o Polling 1 e alguma opção de bloqueio mestre (HDR, Modo de Jogo, Modo ECO)
            // tiver sido alterada, agenda o Polling 2 em 2.5s para confirmação final dos ajustes destravados
            if step == 1 && blocking_changed {
                log_msg(
                    "ProfileVerifier",
                    "Opção que bloqueia outras (HDR/Modo de Jogo/ECO) foi alterada. Agendando Polling 2 em 2.5s para garantia...",
                );
                let mut guard = state.profile_verifier.lock().unwrap();
                // Apenas agenda se o usuário não tiver trocado de perfil nesse meio-tempo
                if guard.is_none() {
                    *guard = Some(ProfileVerification {
                        target,
                        check_at: Instant::now() + Duration::from_millis(2500),
                        step: 2,
                        blocking_mode_changed: false,
                    });
                }
            } else {
                log_msg(
                    "ProfileVerifier",
                    &format!("Verificação pós-troca encerrada no Polling {} (sem necessidade de checagens adicionais).", step),
                );
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    log_msg("Rust", "Inicializando aplicação Tauri...");
    let initial_driver = DdcDriver::new().ok();
    log_msg(
        "Rust",
        if initial_driver.is_some() {
            "DdcDriver inicial conectado com sucesso"
        } else {
            "DdcDriver inicial não conectado (será tentado sob demanda)"
        },
    );

    tauri::Builder::default()
        .manage(AppState {
            driver: Mutex::new(initial_driver),
            last_applied: Mutex::new(None),
            auto_config: Mutex::new(None),
            overdrive_verifier: Mutex::new(None),
            profile_verifier: Mutex::new(None),
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            #[cfg(target_os = "windows")]
            win_process::enable_debug_privilege();

            start_auto_profile_monitor(app.handle().clone());
            start_overdrive_verifier_loop(app.handle().clone());
            start_profile_verifier_loop(app.handle().clone());

            // Rótulos iniciais; o frontend os substitui pelo idioma ativo via set_tray_labels
            let menu = build_tray_menu(app, "Abrir AOC Control Studio", "Sair")?;

            if let Some(icon) = app.default_window_icon().cloned() {
                let _tray = tauri::tray::TrayIconBuilder::with_id(TRAY_ID)
                    .icon(icon)
                    .tooltip("AOC Control Studio")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            frontend_log,
            get_monitor_info,
            read_hardware_settings,
            apply_changed_settings,
            apply_monitor_settings,
            update_auto_profile_config,
            get_running_apps,
            export_json_dialog,
            minimize_window,
            toggle_maximize_window,
            close_window,
            is_window_maximized,
            set_tray_labels
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
