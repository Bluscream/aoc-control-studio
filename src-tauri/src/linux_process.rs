#![cfg(target_os = "linux")]

//! Detecção de aplicativos para a automação de perfis no Linux.
//!
//! - **X11 / XWayland:** a janela em foco é obtida via `_NET_ACTIVE_WINDOW` e o
//!   processo via `_NET_WM_PID`. Isso cobre jogos Steam/Proton/Wine, que rodam
//!   em XWayland mesmo em sessões Wayland.
//! - **Wayland nativo:** não existe API padrão para descobrir a janela em foco,
//!   então o chamador pode recorrer a [`running_process_names`] para verificar se
//!   algum executável vinculado está em execução.
//!
//! Para processos Wine/Proton o nome considerado é o do executável Windows
//! (ex.: `cs2.exe`), extraído de `argv[0]` (`C:\...\cs2.exe`).

use crate::ddc::RunningAppInfo;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::sync::Mutex;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt, Window};
use x11rb::rust_connection::RustConnection;

/// Nomes do próprio aplicativo (ignorados pela automação)
pub const SELF_NAMES: &[&str] = &[
    "app", "aoc-control-studio", "aoc control studio", "webkitwebprocess", "webkitnetworkprocess",
    "xwayland",
];

/// Processos auxiliares do Wine/Proton que não são jogos
const WINE_IGNORE: &[&str] = &[
    "wineserver", "services.exe", "winedevice.exe", "plugplay.exe", "explorer.exe", "svchost.exe",
    "rpcss.exe", "conhost.exe", "start.exe", "tabtip.exe", "steam.exe", "rundll32.exe",
    "winemenubuilder.exe", "wineboot.exe", "cmd.exe", "steamwebhelper.exe", "crashpad_handler.exe",
];

/// Normaliza um nome de executável para comparação (minúsculas, sem `.exe`).
pub fn normalize(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    lower.strip_suffix(".exe").map(str::to_string).unwrap_or(lower)
}

// ---------------------------------------------------------------------------
// /proc
// ---------------------------------------------------------------------------

fn basename(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// Nome principal de um processo (minúsculas).
fn process_name(pid: u32) -> Option<String> {
    let cmdline = fs::read(format!("/proc/{}/cmdline", pid)).ok()?;
    let argv0_raw = cmdline.split(|&b| b == 0).next().unwrap_or_default();
    let mut argv0 = String::from_utf8_lossy(argv0_raw).to_string();
    // Electron/Chromium reescrevem argv como uma única string separada por espaços
    if argv0.starts_with('/') {
        if let Some((first, _)) = argv0.split_once(' ') {
            argv0 = first.to_string();
        }
    }
    let name = basename(argv0.trim()).trim().to_lowercase();
    if !name.is_empty() {
        return Some(name);
    }
    // Fallback: comm (limitado a 15 caracteres)
    let comm = fs::read_to_string(format!("/proc/{}/comm", pid)).ok()?;
    let comm = comm.trim().to_lowercase();
    if comm.is_empty() { None } else { Some(comm) }
}

fn process_comm(pid: u32) -> Option<String> {
    fs::read_to_string(format!("/proc/{}/comm", pid))
        .ok()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
}

/// PIDs de processos do usuário atual.
fn user_pids() -> Vec<u32> {
    let uid = unsafe { libc::getuid() };
    let Ok(rd) = fs::read_dir("/proc") else {
        return Vec::new();
    };
    rd.flatten()
        .filter_map(|e| {
            let pid: u32 = e.file_name().to_str()?.parse().ok()?;
            let meta = e.metadata().ok()?;
            (meta.uid() == uid).then_some(pid)
        })
        .collect()
}

/// Conjunto (normalizado) dos nomes de todos os processos do usuário em execução.
pub fn running_process_names() -> HashSet<String> {
    let mut set = HashSet::new();
    for pid in user_pids() {
        if let Some(n) = process_name(pid) {
            set.insert(normalize(&n));
        }
        if let Some(c) = process_comm(pid) {
            set.insert(normalize(&c));
        }
    }
    set
}

// ---------------------------------------------------------------------------
// X11 / XWayland
// ---------------------------------------------------------------------------

struct X11 {
    conn: RustConnection,
    root: Window,
    net_active_window: Atom,
    net_client_list: Atom,
    net_wm_pid: Atom,
    net_wm_name: Atom,
    utf8_string: Atom,
}

impl X11 {
    fn connect() -> Option<Self> {
        std::env::var_os("DISPLAY")?;
        let (conn, screen_num) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots.get(screen_num)?.root;
        let atom = |name: &str| -> Option<Atom> {
            Some(conn.intern_atom(false, name.as_bytes()).ok()?.reply().ok()?.atom)
        };
        Some(Self {
            net_active_window: atom("_NET_ACTIVE_WINDOW")?,
            net_client_list: atom("_NET_CLIENT_LIST")?,
            net_wm_pid: atom("_NET_WM_PID")?,
            net_wm_name: atom("_NET_WM_NAME")?,
            utf8_string: atom("UTF8_STRING")?,
            conn,
            root,
        })
    }

    fn get_u32s(&self, win: Window, prop: Atom, ty: AtomEnum) -> Result<Vec<u32>, ()> {
        let reply = self
            .conn
            .get_property(false, win, prop, ty, 0, 4096)
            .map_err(|_| ())?
            .reply()
            .map_err(|_| ())?;
        Ok(reply.value32().map(|it| it.collect()).unwrap_or_default())
    }

    fn window_pid(&self, win: Window) -> Option<u32> {
        self.get_u32s(win, self.net_wm_pid, AtomEnum::CARDINAL)
            .ok()?
            .first()
            .copied()
            .filter(|&p| p != 0)
    }

    fn window_title(&self, win: Window) -> String {
        let fetch = |prop: Atom, ty: Atom| -> Option<String> {
            let r = self.conn.get_property(false, win, prop, ty, 0, 1024).ok()?.reply().ok()?;
            let s = String::from_utf8_lossy(&r.value).trim().to_string();
            (!s.is_empty()).then_some(s)
        };
        fetch(self.net_wm_name, self.utf8_string)
            .or_else(|| fetch(AtomEnum::WM_NAME.into(), AtomEnum::STRING.into()))
            .unwrap_or_default()
    }
}

static X11_CONN: Mutex<Option<X11>> = Mutex::new(None);

/// Executa `f` com a conexão X11 (reconectando se necessário).
fn with_x11<R>(f: impl Fn(&X11) -> Result<R, ()>) -> Option<R> {
    let mut guard = X11_CONN.lock().ok()?;
    for _ in 0..2 {
        if guard.is_none() {
            *guard = X11::connect();
        }
        let x = guard.as_ref()?;
        match f(x) {
            Ok(r) => return Some(r),
            Err(()) => *guard = None, // Conexão caiu: tenta reconectar uma vez
        }
    }
    None
}

/// Nome do executável da janela X11/XWayland em foco. Retorna `None` quando o foco
/// está em uma janela Wayland nativa (ou não há servidor X disponível).
pub fn get_foreground_exe_name() -> Option<String> {
    with_x11(|x| {
        let active = x
            .get_u32s(x.root, x.net_active_window, AtomEnum::WINDOW)?
            .first()
            .copied()
            .unwrap_or(0);
        if active == 0 {
            return Ok(None);
        }
        Ok(x.window_pid(active).and_then(process_name))
    })
    .flatten()
}

// ---------------------------------------------------------------------------
// Lista de aplicativos abertos
// ---------------------------------------------------------------------------

/// Mapa "nome do executável" → "nome amigável" a partir dos arquivos .desktop.
fn desktop_entries() -> HashMap<String, String> {
    let mut dirs: Vec<std::path::PathBuf> = vec![
        "/usr/share/applications".into(),
        "/usr/local/share/applications".into(),
        "/var/lib/flatpak/exports/share/applications".into(),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = std::path::PathBuf::from(home);
        dirs.push(home.join(".local/share/applications"));
        dirs.push(home.join(".local/share/flatpak/exports/share/applications"));
    }

    let mut map = HashMap::new();
    for dir in dirs {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let path = e.path();
            if path.extension().and_then(|s| s.to_str()) != Some("desktop") {
                continue;
            }
            let Ok(text) = fs::read_to_string(&path) else { continue };
            let mut name = None;
            let mut exec = None;
            let mut hidden = false;
            let mut in_main = false;
            for line in text.lines() {
                let line = line.trim();
                if line.starts_with('[') {
                    in_main = line == "[Desktop Entry]";
                    continue;
                }
                if !in_main {
                    continue;
                }
                if let Some(v) = line.strip_prefix("Name=") {
                    name.get_or_insert_with(|| v.to_string());
                } else if let Some(v) = line.strip_prefix("Exec=") {
                    exec.get_or_insert_with(|| v.to_string());
                } else if matches!(line, "NoDisplay=true" | "Hidden=true" | "Terminal=true")
                    || (line.starts_with("Type=") && line != "Type=Application")
                {
                    // Ignora serviços, applets de painel e utilitários de terminal
                    hidden = true;
                }
            }
            if hidden {
                continue;
            }
            if let (Some(name), Some(exec)) = (name, exec) {
                // Ignora wrappers (env, flatpak run, sh -c...) e pega o primeiro binário real
                let bin = exec
                    .split_whitespace()
                    .find(|t| !t.contains('=') && *t != "env")
                    .map(|t| basename(t.trim_matches('"')).to_lowercase());
                if let Some(bin) = bin {
                    if !bin.is_empty() && bin != "flatpak" && bin != "sh" && bin != "bash" {
                        map.entry(bin).or_insert(name);
                    }
                }
            }
        }
    }
    map
}

pub fn list_running_apps() -> Vec<RunningAppInfo> {
    let mut apps: Vec<RunningAppInfo> = Vec::new();
    let push = |apps: &mut Vec<RunningAppInfo>, name: String, exe: String| {
        if exe.is_empty() || SELF_NAMES.contains(&exe.as_str()) || WINE_IGNORE.contains(&exe.as_str()) {
            return;
        }
        if !apps.iter().any(|a| a.exe_name == exe) {
            apps.push(RunningAppInfo { name, exe_name: exe });
        }
    };

    // 1. Janelas X11/XWayland abertas (jogos Wine/Proton, Steam etc.)
    if let Some(windows) = with_x11(|x| {
        let list = x.get_u32s(x.root, x.net_client_list, AtomEnum::WINDOW)?;
        Ok(list
            .into_iter()
            .filter_map(|w| {
                let pid = x.window_pid(w)?;
                let exe = process_name(pid)?;
                let title = x.window_title(w);
                Some((if title.is_empty() { exe.clone() } else { title }, exe))
            })
            .collect::<Vec<_>>())
    }) {
        for (title, exe) in windows {
            push(&mut apps, title, exe);
        }
    }

    // 2. Processos do usuário: executáveis Windows (.exe) e apps com atalho .desktop
    let desktop = desktop_entries();
    for pid in user_pids() {
        let Some(name) = process_name(pid) else { continue };
        if name.ends_with(".exe") {
            push(&mut apps, name.clone(), name);
            continue;
        }
        let comm = process_comm(pid).unwrap_or_default();
        // comm é truncado em 15 caracteres: só serve de fallback quando completo
        let comm_match = if comm.len() < 15 { desktop.get(&comm) } else { None };
        if let Some(friendly) = desktop.get(&name).or(comm_match) {
            push(&mut apps, friendly.clone(), name);
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}
