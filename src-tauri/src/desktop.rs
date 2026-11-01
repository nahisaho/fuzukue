use crate::{
    document::{Image, OpenResult, Operation, Session},
    pdf::persist_pdf,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex, atomic::AtomicBool},
};
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tempfile::Builder;
use tokio::sync::oneshot;
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{ICoreWebView2_7, ICoreWebView2Environment6},
    PrintToPdfCompletedHandler,
};
use windows::core::{HSTRING, Interface};

#[derive(Default)]
struct AppState {
    session: Arc<Mutex<Session>>,
    busy: Arc<AtomicBool>,
}

type PdfSender = Arc<Mutex<Option<oneshot::Sender<Result<(), String>>>>>;

fn complete_pdf(sender: &PdfSender, outcome: Result<(), String>) {
    let (mut slot, outcome) = match sender.lock() {
        Ok(slot) => (slot, outcome),
        Err(error) => {
            eprintln!("PDF completion state was poisoned: {error}");
            (
                error.into_inner(),
                Err("PDF completion state is unavailable.".into()),
            )
        }
    };
    if let Some(sender) = slot.take() {
        if sender.send(outcome).is_err() {
            eprintln!("PDF request ended before native completion.");
        }
    } else {
        eprintln!("Ignoring duplicate native PDF completion.");
    }
}

#[tauri::command]
async fn open_documents(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    paths: Option<Vec<String>>,
) -> Result<OpenResult, String> {
    let operation = Operation::acquire(&state.busy)?;
    let session = Arc::clone(&state.session);
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let paths = match paths {
            Some(paths) => paths.into_iter().map(PathBuf::from).collect::<Vec<_>>(),
            None => {
                let selected = app
                    .dialog()
                    .file()
                    .add_filter("Markdown", &["md", "markdown"])
                    .set_title("Markdownファイルを開く")
                    .blocking_pick_files();
                match selected {
                    Some(files) => files
                        .into_iter()
                        .map(|file| {
                            file.into_path()
                                .map_err(|e| format!("Invalid file path: {e}"))
                        })
                        .collect::<Result<Vec<_>, _>>()?,
                    None => vec![],
                }
            }
        };
        let result = session
            .lock()
            .map_err(|e| format!("Document state is unavailable: {e}"))?
            .open_many(&paths);
        Ok(result)
    })
    .await
    .map_err(|e| format!("Open operation failed: {e}"))?
}

// @id CODE-TABS-NATIVE @implements REQ-TABS-003 REQ-TABS-004
#[tauri::command]
fn activate_document(state: State<'_, AppState>, document_id: u64) -> Result<(), String> {
    let _operation = Operation::acquire(&state.busy)?;
    state
        .session
        .lock()
        .map_err(|e| format!("Document state is unavailable: {e}"))?
        .activate(document_id)
        .map(|_| ())
}

#[tauri::command]
fn close_document(state: State<'_, AppState>, document_id: u64) -> Result<(), String> {
    let _operation = Operation::acquire(&state.busy)?;
    state
        .session
        .lock()
        .map_err(|e| format!("Document state is unavailable: {e}"))?
        .close(document_id)
}

#[tauri::command]
async fn reload_document(
    state: State<'_, AppState>,
    document_id: u64,
) -> Result<crate::document::Document, String> {
    let operation = Operation::acquire(&state.busy)?;
    let session = Arc::clone(&state.session);
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        session
            .lock()
            .map_err(|e| format!("Document state is unavailable: {e}"))?
            .reload(document_id)
    })
    .await
    .map_err(|e| format!("Reload operation failed: {e}"))?
}

#[tauri::command]
async fn read_image(
    state: State<'_, AppState>,
    document_id: u64,
    reference: String,
) -> Result<Image, String> {
    let session = Arc::clone(&state.session);
    tauri::async_runtime::spawn_blocking(move || {
        session
            .lock()
            .map_err(|e| format!("Document state is unavailable: {e}"))?
            .image(document_id, &reference)
    })
    .await
    .map_err(|e| format!("Image operation failed: {e}"))?
}

// @id CODE-PDF-NATIVE @implements REQ-PDF-002 REQ-PDF-003
#[tauri::command]
async fn export_pdf(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    document_id: u64,
) -> Result<Option<String>, String> {
    let _operation = Operation::acquire(&state.busy)?;
    let document = state
        .session
        .lock()
        .map_err(|e| format!("Document state is unavailable: {e}"))?
        .current
        .clone()
        .filter(|doc| doc.id == document_id)
        .ok_or("The document changed; try exporting again.")?;
    let suggested = PathBuf::from(&document.name)
        .with_extension("pdf")
        .to_string_lossy()
        .into_owned();
    let target = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name(suggested)
            .set_title("PDFとして保存")
            .blocking_save_file()
            .map(|file| {
                file.into_path()
                    .map_err(|e| format!("Invalid destination: {e}"))
            })
            .transpose()
    })
    .await
    .map_err(|e| format!("Save dialog failed: {e}"))??;
    let Some(mut target) = target else {
        return Ok(None);
    };
    if target.extension().is_none() {
        target.set_extension("pdf");
    }
    if !target
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
    {
        return Err("保存先の拡張子は .pdf にしてください。".into());
    }
    let temporary = Builder::new()
        .prefix(".fuzukue-")
        .suffix(".pdf")
        .tempfile_in(
            target
                .parent()
                .ok_or("Destination has no parent directory.")?,
        )
        .map_err(|e| format!("Cannot create temporary PDF: {e}"))?
        .into_temp_path();
    let print_path = temporary.to_string_lossy().into_owned();
    let (sender, receiver) = oneshot::channel::<Result<(), String>>();
    let sender = Arc::new(Mutex::new(Some(sender)));
    window
        .with_webview(move |webview| {
            let completion = Arc::clone(&sender);
            let result = (|| -> windows::core::Result<()> {
                // COM handles are created and used exclusively on the webview's UI thread.
                unsafe {
                    let view: ICoreWebView2_7 = webview.controller().CoreWebView2()?.cast()?;
                    let environment: ICoreWebView2Environment6 = webview.environment().cast()?;
                    let settings = environment.CreatePrintSettings()?;
                    settings.SetPageWidth(210.0 / 25.4)?;
                    settings.SetPageHeight(297.0 / 25.4)?;
                    settings.SetMarginTop(16.0 / 25.4)?;
                    settings.SetMarginBottom(16.0 / 25.4)?;
                    settings.SetMarginLeft(16.0 / 25.4)?;
                    settings.SetMarginRight(16.0 / 25.4)?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    let callback =
                        PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
                            let outcome = result
                                .map_err(|e| format!("WebView2 PDF capture failed: {e}"))
                                .and_then(|()| {
                                    if success {
                                        Ok(())
                                    } else {
                                        Err("WebView2 could not create the PDF.".into())
                                    }
                                });
                            complete_pdf(&completion, outcome);
                            Ok(())
                        }));
                    view.PrintToPdf(&HSTRING::from(print_path), &settings, &callback)?;
                }
                Ok(())
            })();
            if let Err(error) = result {
                complete_pdf(
                    &sender,
                    Err(format!("WebView2 PDF API unavailable: {error}")),
                );
            }
        })
        .map_err(|e| format!("Cannot access WebView2: {e}"))?;
    // Do not time out and restore CSS while WebView2 may still be capturing.
    receiver
        .await
        .map_err(|e| format!("PDF completion channel closed: {e}"))??;
    persist_pdf(temporary, &target)?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| format!("Invalid link: {e}"))?;
    if !["https", "http"].contains(&parsed.scheme())
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Only HTTP(S) links without credentials may open in the browser.".into());
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| format!("Cannot open browser: {e}"))
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let _operation = Operation::acquire(&state.busy)?;
    app.exit(0);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_documents,
            reload_document,
            activate_document,
            close_document,
            read_image,
            export_pdf,
            open_external,
            exit_app
        ])
        .setup(|app| {
            let dev_url = app.config().build.dev_url.clone();
            let config = app
                .config()
                .app
                .windows
                .first()
                .ok_or("Missing main window config")?;
            tauri::WebviewWindowBuilder::from_config(app, config)?
                .on_navigation(move |url| {
                    let local = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"));
                    let dev = crate::navigation::allows_dev_navigation(
                        cfg!(debug_assertions),
                        dev_url.as_ref(),
                        url,
                    );
                    local || dev
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fuzukue desktop startup failed");
}
