#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    fuzukue::desktop::run();
    #[cfg(not(windows))]
    {
        eprintln!("Fuzukue desktop requires Windows 10/11 and WebView2.");
        std::process::exit(1);
    }
}
