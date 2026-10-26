use std::fs::File;
use std::io::Read;
use std::path::Path;
use tempfile::TempPath;

// @id CODE-PDF-002 @implements REQ-PDF-002
pub fn persist_pdf(temporary: TempPath, target: &Path) -> Result<(), String> {
    if !target
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
    {
        return Err("The destination must have a .pdf extension.".into());
    }
    let mut file = File::options()
        .read(true)
        .write(true)
        .open(&temporary)
        .map_err(|e| format!("Cannot open generated PDF: {e}"))?;
    let mut signature = [0; 5];
    file.read_exact(&mut signature)
        .map_err(|e| format!("Incomplete PDF: {e}"))?;
    if &signature != b"%PDF-" {
        return Err("WebView2 did not generate a valid PDF.".into());
    }
    file.sync_all()
        .map_err(|e| format!("Cannot flush PDF: {e}"))?;
    drop(file);
    temporary
        .persist(target)
        .map_err(|e| format!("Cannot save PDF; previous file was preserved: {}", e.error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::{NamedTempFile, tempdir};

    // @id TEST-PDF-002 @verifies REQ-PDF-002
    #[test]
    fn test_pdf_002() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("result.pdf");
        fs::write(&target, "previous").unwrap();
        let mut temp = NamedTempFile::new_in(dir.path()).unwrap();
        temp.write_all(b"%PDF-1.7\nrendered").unwrap();
        persist_pdf(temp.into_temp_path(), &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"%PDF-1.7\nrendered");
        let mut bad = NamedTempFile::new_in(dir.path()).unwrap();
        bad.write_all(b"not a pdf").unwrap();
        let bad_path = bad.path().to_path_buf();
        assert!(persist_pdf(bad.into_temp_path(), &target).is_err());
        assert!(!bad_path.exists());
        assert_eq!(fs::read(&target).unwrap(), b"%PDF-1.7\nrendered");
        let blocked = dir.path().join("directory.pdf");
        fs::create_dir(&blocked).unwrap();
        let mut temp = NamedTempFile::new_in(dir.path()).unwrap();
        temp.write_all(b"%PDF-1.7\nrendered").unwrap();
        let temp_path = temp.path().to_path_buf();
        assert!(persist_pdf(temp.into_temp_path(), &blocked).is_err());
        assert!(!temp_path.exists());
        assert!(blocked.is_dir());
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            let locked = File::options()
                .read(true)
                .share_mode(0)
                .open(&target)
                .unwrap();
            let mut temp = NamedTempFile::new_in(dir.path()).unwrap();
            temp.write_all(b"%PDF-1.7\nreplacement").unwrap();
            let result = persist_pdf(temp.into_temp_path(), &target);
            drop(locked);
            assert!(result.is_err());
            assert_eq!(fs::read(&target).unwrap(), b"%PDF-1.7\nrendered");
        }
    }
}
