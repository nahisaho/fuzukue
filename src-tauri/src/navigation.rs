use url::Url;

// @id CODE-DEV-NAVIGATION @implements REQ-DEV-003
pub(crate) fn allows_dev_navigation(
    debug: bool,
    configured: Option<&Url>,
    candidate: &Url,
) -> bool {
    debug
        && configured.is_some_and(|configured| {
            configured.scheme() == "http"
                && configured.host_str() == Some("127.0.0.1")
                && configured.origin() == candidate.origin()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    // @id TEST-DEV-003 @verifies REQ-DEV-003
    #[test]
    fn test_dev_003() {
        let configured = Url::parse("http://127.0.0.1:23456/").unwrap();
        for candidate in ["http://127.0.0.1:23456/", "http://127.0.0.1:23456/#heading"] {
            let candidate = Url::parse(candidate).unwrap();
            assert!(allows_dev_navigation(true, Some(&configured), &candidate));
            assert!(!allows_dev_navigation(false, Some(&configured), &candidate));
            assert!(!allows_dev_navigation(true, None, &candidate));
        }
        for candidate in [
            "http://127.0.0.1:5173/",
            "https://127.0.0.1:23456/",
            "http://localhost:23456/",
            "http://example.com:23456/",
        ] {
            assert!(!allows_dev_navigation(
                true,
                Some(&configured),
                &Url::parse(candidate).unwrap()
            ));
        }
        for configured in [
            "http://example.com/",
            "https://127.0.0.1:23456/",
            "http://[::1]:23456/",
        ] {
            let configured = Url::parse(configured).unwrap();
            assert!(!allows_dev_navigation(true, Some(&configured), &configured));
        }
    }
}
