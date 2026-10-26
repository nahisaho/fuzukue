#[cfg(windows)]
pub mod desktop;

pub mod document;
pub mod pdf;

#[cfg(any(windows, test))]
mod navigation;
