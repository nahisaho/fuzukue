use base64::{Engine, engine::general_purpose::STANDARD};
use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub const MAX_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: u64,
    pub path: String,
    pub name: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    pub mime: String,
    pub data: String,
}

#[derive(Debug, Serialize)]
pub struct OpenResult {
    pub documents: Vec<Document>,
    pub errors: Vec<OpenError>,
}

#[derive(Debug, Serialize)]
pub struct OpenError {
    pub path: String,
    pub message: String,
}

#[derive(Default)]
pub struct Session {
    pub current: Option<Document>,
    documents: Vec<Document>,
    generation: u64,
}

impl Session {
    // @id CODE-TABS-004 @implements REQ-TABS-004
    pub fn close(&mut self, id: u64) -> Result<(), String> {
        let index = self
            .documents
            .iter()
            .position(|doc| doc.id == id)
            .ok_or("The document is no longer open.")?;
        self.documents.remove(index);
        if self.current.as_ref().is_some_and(|doc| doc.id == id) {
            self.current = self
                .documents
                .get(index)
                .or_else(|| self.documents.last())
                .cloned();
        }
        Ok(())
    }

    pub fn activate(&mut self, id: u64) -> Result<Document, String> {
        let document = self
            .documents
            .iter()
            .find(|doc| doc.id == id)
            .ok_or("The document is no longer open.")?
            .clone();
        self.current = Some(document.clone());
        Ok(document)
    }

    pub fn reload(&mut self, id: u64) -> Result<Document, String> {
        if !self.current.as_ref().is_some_and(|doc| doc.id == id) {
            return Err("The selected document changed; try reloading again.".into());
        }
        let document = self
            .documents
            .iter_mut()
            .find(|doc| doc.id == id)
            .ok_or("The document is no longer open.")?;
        let text = read_text(Path::new(&document.path))?;
        document.text = text;
        let document = document.clone();
        self.current = Some(document.clone());
        Ok(document)
    }

    // @id CODE-TABS-002 @implements REQ-TABS-002
    pub fn open_many(&mut self, paths: &[std::path::PathBuf]) -> OpenResult {
        let mut result = OpenResult {
            documents: vec![],
            errors: vec![],
        };
        for path in paths {
            match self.open(path) {
                Ok(document) => result.documents.push(document),
                Err(message) => result.errors.push(OpenError {
                    path: path.to_string_lossy().into_owned(),
                    message,
                }),
            }
        }
        result
    }

    // @id CODE-FILES-001 @implements REQ-FILES-001 REQ-FILES-002 REQ-TABS-001
    pub fn open(&mut self, path: &Path) -> Result<Document, String> {
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !["md", "markdown"]
            .iter()
            .any(|ext| extension.eq_ignore_ascii_case(ext))
        {
            return Err("Select a .md or .markdown file.".into());
        }
        let path = path
            .canonicalize()
            .map_err(|e| format!("Cannot open document: {e}"))?;
        if let Some(document) = self
            .documents
            .iter()
            .find(|doc| Path::new(&doc.path) == path)
        {
            let document = document.clone();
            self.current = Some(document.clone());
            return Ok(document);
        }
        if self.documents.len() >= 20 {
            return Err("A maximum of 20 documents can be open. Close a tab first.".into());
        }
        let text = read_text(&path)?;
        let id = self
            .generation
            .checked_add(1)
            .ok_or("Document generation limit reached.")?;
        let document = Document {
            id,
            name: path
                .file_name()
                .ok_or("Document has no filename.")?
                .to_string_lossy()
                .into_owned(),
            path: path.to_string_lossy().into_owned(),
            text,
        };
        self.generation = id;
        self.documents.push(document.clone());
        self.current = Some(document.clone());
        Ok(document)
    }

    // @id CODE-IMAGES-001 @implements REQ-IMAGES-001 REQ-IMAGES-002
    pub fn image(&self, id: u64, reference: &str) -> Result<Image, String> {
        let document = self
            .documents
            .iter()
            .find(|doc| doc.id == id)
            .ok_or("The document is no longer open; reopen it to load images.")?;
        let reference = reference.split(['#', '?']).next().unwrap_or("");
        let decoded = percent_decode_str(reference)
            .decode_utf8()
            .map_err(|e| format!("Invalid UTF-8 image path: {e}"))?;
        let relative = decoded.replace('\\', "/");
        if relative.is_empty()
            || relative.starts_with('/')
            || relative.contains(':')
            || relative.contains('\0')
        {
            return Err("Only relative local PNG/SVG image paths are allowed.".into());
        }
        let parent = Path::new(&document.path)
            .parent()
            .ok_or("Document has no parent directory.")?;
        let path = parent
            .join(relative)
            .canonicalize()
            .map_err(|e| format!("Cannot open image: {e}"))?;
        if !path.starts_with(parent) {
            return Err("Image path is outside the document directory.".into());
        }
        let bytes = read_bounded(&path)?;
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        let mime = if extension.eq_ignore_ascii_case("png")
            && bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        {
            "image/png"
        } else if extension.eq_ignore_ascii_case("svg") {
            std::str::from_utf8(&bytes).map_err(|e| format!("SVG must be UTF-8: {e}"))?;
            "image/svg+xml"
        } else {
            return Err(
                "Only PNG images with a valid signature and UTF-8 SVG images are supported.".into(),
            );
        };
        Ok(Image {
            mime: mime.into(),
            data: STANDARD.encode(bytes),
        })
    }
}

fn read_text(path: &Path) -> Result<String, String> {
    let text = String::from_utf8(read_bounded(path)?)
        .map_err(|e| format!("Document must be UTF-8: {e}"))?;
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned())
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    let metadata = file
        .metadata()
        .map_err(|e| format!("Cannot inspect file: {e}"))?;
    if !metadata.is_file() {
        return Err("The selected path is not a regular file.".into());
    }
    if metadata.len() > MAX_BYTES {
        return Err("File exceeds the 16 MiB limit.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read file: {e}"))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("File exceeds the 16 MiB limit.".into());
    }
    Ok(bytes)
}

pub struct Operation(Arc<AtomicBool>);
impl Operation {
    // @id CODE-FILES-003 @implements REQ-FILES-003
    pub fn acquire(busy: &Arc<AtomicBool>) -> Result<Self, String> {
        busy.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Another operation is in progress. Please wait.".to_owned())?;
        Ok(Self(Arc::clone(busy)))
    }
}
impl Drop for Operation {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::STANDARD};
    use std::fs;
    use tempfile::tempdir;

    // @id TEST-TABS-001 @verifies REQ-TABS-001
    #[test]
    fn test_tabs_001() {
        let dir = tempdir().unwrap();
        let mut session = Session::default();
        let mut ids = Vec::new();
        for i in 0..20 {
            let path = dir.path().join(format!("{i}.md"));
            fs::write(&path, format!("# {i}")).unwrap();
            ids.push(session.open(&path).unwrap().id);
        }
        let duplicate = session.open(&dir.path().join("0.md")).unwrap();
        assert_eq!(duplicate.id, ids[0], "duplicate must reuse the open tab");
        let extra = dir.path().join("extra.md");
        fs::write(&extra, "# extra").unwrap();
        assert!(session.open(&extra).unwrap_err().contains("20"));
        assert_eq!(session.current.as_ref().unwrap().id, ids[0]);
        session.close(ids[0]).unwrap();
        let reopened = session.open(&dir.path().join("0.md")).unwrap();
        assert!(reopened.id > *ids.last().unwrap());
        assert!(session.activate(ids[0]).is_err());
    }

    // @id TEST-TABS-002 @verifies REQ-TABS-002
    #[test]
    fn test_tabs_002() {
        let dir = tempdir().unwrap();
        let good = dir.path().join("good.md");
        let other = dir.path().join("other.markdown");
        let invalid = dir.path().join("bad.md");
        fs::write(&good, "# good").unwrap();
        fs::write(&other, "# other").unwrap();
        fs::write(&invalid, [0xff]).unwrap();
        let mut session = Session::default();
        let result =
            session.open_many(&[good.clone(), invalid.clone(), other.clone(), good.clone()]);
        assert_eq!(result.documents.len(), 3);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].path, invalid.to_string_lossy());
        assert!(result.errors[0].message.contains("UTF-8"));
        assert_eq!(result.documents[0].id, result.documents[2].id);
        let active = session.current.as_ref().unwrap().id;
        assert_eq!(active, result.documents[0].id);
        assert!(session.open_many(&[]).documents.is_empty());
        assert_eq!(session.current.as_ref().unwrap().id, active);
        assert_eq!(session.open_many(&[invalid]).errors.len(), 1);
        assert_eq!(session.current.as_ref().unwrap().id, active);
        let paths: Vec<_> = (0..20)
            .map(|i| {
                let path = dir.path().join(format!("more-{i}.md"));
                fs::write(&path, "").unwrap();
                path
            })
            .collect();
        let result = session.open_many(&paths);
        assert_eq!(result.documents.len(), 18);
        assert_eq!(result.errors.len(), 2);
        assert!(
            result
                .errors
                .iter()
                .all(|error| error.message.contains("20"))
        );
    }

    // @id TEST-TABS-004 @verifies REQ-TABS-004
    #[test]
    fn test_tabs_004() {
        let root = tempdir().unwrap();
        let mut session = Session::default();
        let mut docs = Vec::new();
        for name in ["a", "b"] {
            let dir = root.path().join(name);
            fs::create_dir(&dir).unwrap();
            fs::write(dir.join("read.md"), format!("# {name}")).unwrap();
            fs::write(dir.join("plot.svg"), format!("<svg>{name}</svg>")).unwrap();
            docs.push(session.open(&dir.join("read.md")).unwrap());
        }
        let a = session.image(docs[0].id, "plot.svg");
        assert!(
            a.is_ok(),
            "an inactive but open document retains its own image scope"
        );
        assert_eq!(STANDARD.decode(a.unwrap().data).unwrap(), b"<svg>a</svg>");
        assert_eq!(
            STANDARD
                .decode(session.image(docs[1].id, "plot.svg").unwrap().data)
                .unwrap(),
            b"<svg>b</svg>"
        );
        session.activate(docs[0].id).unwrap();
        assert_eq!(session.current.as_ref().unwrap().id, docs[0].id);
        session.close(docs[0].id).unwrap();
        assert!(session.image(docs[0].id, "plot.svg").is_err());
        assert_eq!(session.current.as_ref().unwrap().id, docs[1].id);
        assert!(session.close(docs[0].id).is_err());
        session.close(docs[1].id).unwrap();
        assert!(session.current.is_none());
    }

    // @id TEST-FILES-001 @verifies REQ-FILES-001
    #[test]
    fn test_files_001() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("読みもの.MD");
        fs::write(&path, "\u{feff}# Hello 日本語").unwrap();
        let doc = Session::default().open(&path).unwrap();
        assert_eq!(doc.text, "# Hello 日本語");
        assert_eq!(doc.name, "読みもの.MD");
        assert_eq!(doc.path, path.canonicalize().unwrap().to_string_lossy());
        assert!(doc.id > 0);
    }

    // @id TEST-FILES-002 @verifies REQ-FILES-002
    #[test]
    fn test_files_002() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("ok.md");
        fs::write(&path, "# keep").unwrap();
        let mut session = Session::default();
        let doc = session.open(&path).unwrap();
        let big = dir.path().join("big.md");
        fs::File::create(&big)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        let invalid = dir.path().join("invalid.md");
        fs::write(&invalid, [0xff]).unwrap();
        let other = dir.path().join("not.txt");
        fs::write(&other, "text").unwrap();
        for bad in [big, invalid, other, dir.path().join("missing.md")] {
            assert!(session.open(&bad).is_err(), "{bad:?}");
            assert_eq!(session.current.as_ref().unwrap().id, doc.id);
        }
        let empty = dir.path().join("empty.markdown");
        fs::write(&empty, "").unwrap();
        assert_eq!(session.open(&empty).unwrap().text, "");
    }

    #[test]
    fn reload_updates_only_active_tab_and_preserves_state_on_read_failure() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("read.md");
        let image = dir.path().join("plot.svg");
        fs::write(&path, "# Before").unwrap();
        fs::write(&image, "<svg/>").unwrap();
        let mut session = Session::default();
        let before = session.open(&path).unwrap();
        let other_path = dir.path().join("other.md");
        fs::write(&other_path, "# Other").unwrap();
        let other = session.open(&other_path).unwrap();
        assert!(session.reload(before.id).is_err());
        session.activate(before.id).unwrap();
        fs::write(&path, "# After\n\n![Plot](plot.svg)").unwrap();
        fs::write(&image, "<svg><rect/></svg>").unwrap();
        assert_eq!(session.open(&path).unwrap().text, "# Before");
        let after = session.reload(before.id).unwrap();
        assert_eq!(after.text, "# After\n\n![Plot](plot.svg)");
        assert_eq!(after.path, before.path);
        assert_eq!(after.id, before.id);
        assert_eq!(session.documents.len(), 2);
        assert_eq!(
            STANDARD
                .decode(session.image(after.id, "plot.svg").unwrap().data)
                .unwrap(),
            b"<svg><rect/></svg>"
        );
        fs::remove_file(&path).unwrap();
        assert!(session.reload(after.id).is_err());
        assert_eq!(session.current.as_ref().unwrap().id, after.id);
        assert_eq!(session.current.as_ref().unwrap().text, after.text);
        fs::write(&path, [0xff]).unwrap();
        assert!(session.reload(after.id).unwrap_err().contains("UTF-8"));
        assert_eq!(session.current.as_ref().unwrap().text, after.text);
        fs::File::create(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(session.reload(after.id).unwrap_err().contains("16 MiB"));
        fs::write(&path, "\u{feff}# Recovered").unwrap();
        assert_eq!(session.reload(after.id).unwrap().text, "# Recovered");
        assert_eq!(session.activate(other.id).unwrap().text, "# Other");
        session.close(after.id).unwrap();
        assert!(session.reload(after.id).is_err());
    }

    #[test]
    fn backend_operation_rejects_concurrency_and_releases_on_drop() {
        let busy = Arc::new(AtomicBool::new(false));
        let first = Operation::acquire(&busy).unwrap();
        assert!(Operation::acquire(&busy).is_err());
        drop(first);
        assert!(Operation::acquire(&busy).is_ok());
    }

    // @id TEST-IMAGES-001 @verifies REQ-IMAGES-001
    #[test]
    fn test_images_001() {
        let dir = tempdir().unwrap();
        let md = dir.path().join("read.md");
        fs::write(&md, "![pic](図%20像.png)").unwrap();
        let png = b"\x89PNG\r\n\x1a\nfixture";
        fs::write(dir.path().join("図 像.png"), png).unwrap();
        fs::write(
            dir.path().join("plot.SVG"),
            "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
        )
        .unwrap();
        let mut session = Session::default();
        let doc = session.open(&md).unwrap();
        let image = session.image(doc.id, "%E5%9B%B3%20%E5%83%8F.png").unwrap();
        assert_eq!(image.mime, "image/png");
        assert_eq!(STANDARD.decode(image.data).unwrap(), png);
        assert_eq!(
            session.image(doc.id, "plot.SVG#view").unwrap().mime,
            "image/svg+xml"
        );
        let big = dir.path().join("big.png");
        fs::File::create(big)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(session.image(doc.id, "big.png").is_err());
    }

    // @id TEST-IMAGES-002 @verifies REQ-IMAGES-002
    #[test]
    fn test_images_002() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("docs");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("read.md"), "").unwrap();
        fs::write(dir.path().join("secret.png"), b"\x89PNG\r\n\x1a\nsecret").unwrap();
        fs::write(root.join("fake.png"), "not png").unwrap();
        fs::write(root.join("bad.jpg"), "jpeg").unwrap();
        let mut session = Session::default();
        let doc = session.open(&root.join("read.md")).unwrap();
        for reference in [
            "../secret.png",
            "%2e%2e/secret.png",
            "/secret.png",
            "C:\\secret.png",
            "\\\\server\\share.png",
            "https://example.com/a.png",
            "file:///secret.png",
            "data:image/png;base64,eA==",
            "missing.png",
            "fake.png",
            "bad.jpg",
            "%FF.png",
        ] {
            assert!(session.image(doc.id, reference).is_err(), "{reference}");
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(dir.path().join("secret.png"), root.join("escape.png"))
                .unwrap();
            assert!(session.image(doc.id, "escape.png").is_err());
        }
        assert_eq!(session.open(&root.join("read.md")).unwrap().id, doc.id);
        assert!(session.close(doc.id).is_ok());
        assert!(
            session
                .image(doc.id, "fake.png")
                .unwrap_err()
                .contains("document")
        );
    }
}
