#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
fn setup_terminal_if_verbose() -> bool {
    let args: Vec<String> = std::env::args().collect();
    let is_verbose = args.iter().any(|a| a == "-v" || a == "--verbose" || a == "-V" || a == "/v");
    if is_verbose {
        unsafe extern "system" {
            fn AttachConsole(dwProcessId: u32) -> i32;
            fn AllocConsole() -> i32;
        }
        unsafe {
            // Tenta anexar ao terminal pai (PowerShell, CMD, Windows Terminal)
            if AttachConsole(0xFFFFFFFF) == 0 {
                // Se foi iniciado fora de um terminal, cria uma janela de console dedicada
                AllocConsole();
            }
        }
    }
    is_verbose
}

#[cfg(not(windows))]
fn setup_terminal_if_verbose() -> bool {
    let args: Vec<String> = std::env::args().collect();
    args.iter().any(|a| a == "-v" || a == "--verbose" || a == "-V" || a == "/v")
}

fn main() {
    let verbose = setup_terminal_if_verbose();
    app_lib::set_verbose(verbose);

    std::panic::set_hook(Box::new(|info| {
        let err_msg = format!("PANIC: {:?}", info);
        let _ = std::fs::write(app_lib::log_path("panic.log"), &err_msg);
        app_lib::log_msg("Panic", &err_msg);
    }));

    app_lib::run();
}
