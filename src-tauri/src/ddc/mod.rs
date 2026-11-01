pub mod windows;
pub mod linux;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSettings {
    // Imagem
    pub brightness: u32,
    pub contrast: u32,
    pub gamma: String,
    pub eco_mode: String,
    pub dcr: bool,

    // Cores
    pub color_temp: String,
    pub r: u32,
    pub g: u32,
    pub b: u32,
    pub game_color: u32,
    pub low_blue: String,

    // Desempenho
    pub game_mode: String,
    pub overdrive: String,
    pub shadow_control: u32,
    pub adaptive_sync: bool,

    // Recursos
    pub crosshair: bool,
    pub frame_counter: String,
    pub hdr_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: String,
    pub connection: String,
    pub ddc_supported: bool,
    pub hdr_supported: bool,
    pub hdr_enabled: bool,
    pub adaptive_sync_supported: bool,
    pub adaptive_sync_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub applied_count: u32,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAppMapping {
    pub mode_id: String,
    pub exes: Vec<String>,
    pub settings: MonitorSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoProfileConfig {
    pub enabled: bool,
    pub default_mode_id: String,
    pub default_settings: MonitorSettings,
    pub profiles: Vec<ProfileAppMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningAppInfo {
    pub name: String,
    pub exe_name: String,
}

/// Códigos VCP Padrão MCCS e AOC/TPV Estendidos (F8 E1 xx) verificados no AOC 24G2S
#[allow(dead_code)]
pub mod vcp {
    // Standard MCCS VCPs ([0x01, op] / [0x03, op, hi, lo])
    pub const BRIGHTNESS: u8 = 0x10;
    pub const CONTRAST: u8 = 0x12;
    pub const COLOR_PRESET: u8 = 0x14; // 1: sRGB, 5: Warm, 6: Normal, 8: Cool, 11: UserRGB
    pub const RED_GAIN: u8 = 0x16;
    pub const GREEN_GAIN: u8 = 0x18;
    pub const BLUE_GAIN: u8 = 0x1A;
    pub const GAME_MODE: u8 = 0xDC; // 0: Off, 11: FPS, 12: RTS, 13: Racing, 14: Gamer1, 15: Gamer2, 16: Gamer3

    // Prefixo AOC / TPV Extended DDC/CI ([0x01, 0xF8, 0xE1, op] / [0x03, 0xF8, 0xE1, op, hi, lo])
    pub const TPV_F8: u8 = 0xF8;
    pub const TPV_E1: u8 = 0xE1;

    pub const EXT_ECO_MODE: u8 = 0x11;       // 0: Standard, 1: Text, 2: Internet, 3: Game, 4: Movie, 5: Sports, 6: Reading
    pub const EXT_GAMMA: u8 = 0x12;          // 0: Gamma 1, 1: Gamma 2, 2: Gamma 3
    pub const EXT_DCR: u8 = 0x13;            // 0: Off, 1: On
    pub const EXT_OVERDRIVE: u8 = 0x51;      // 0: Off, 1: Weak, 2: Medium, 3: Strong, 4: Boost
    pub const EXT_HDR_MODE: u8 = 0x52;       // 0: Off, 1: HDR Picture, 2: HDR Movie, 3: HDR Game
    pub const EXT_GAME_COLOR: u8 = 0x57;     // 0..20 (padrão 10)
    pub const EXT_SHADOW_CONTROL: u8 = 0x58; // 0..100 em passos de 10 (padrão 50)
    pub const EXT_LOW_BLUE: u8 = 0x59;       // 0: Off, 1: Multimedia, 2: Internet, 3: Office, 4: Reading
    pub const EXT_DIAL_POINT: u8 = 0x5A;     // 0: Off, 1: On (Mira na tela)
    pub const EXT_FRAME_COUNTER: u8 = 0x5B;  // 0: Off, 1: Sup.Dir, 2: Inf.Dir, 3: Inf.Esq, 4: Sup.Esq

    // AOC Geração E2 A0 (caso usado em monitores AOC mais novos)
    pub const TPV_E2: u8 = 0xE2;
    pub const TPV_A0: u8 = 0xA0;
    pub const EXT_E2A0_ADAPTIVE_SYNC: u8 = 0x40;
}
