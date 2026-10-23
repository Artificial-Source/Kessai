use std::fmt;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use anyhow::{bail, Context};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use image::{DynamicImage, ImageFormat, ImageReader, Limits};

pub const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_IMAGE_DIMENSION: u32 = 4096;
pub const MAX_STORED_LOGO_BYTES: usize = 8 * 1024 * 1024;
const MAX_DECODE_ALLOC: u64 = 96 * 1024 * 1024;
const MAX_FETCHED_LOGO_STEM_CHARS: usize = 80;

#[derive(Debug)]
pub enum LogoError {
    Invalid(String),
    NotFound,
    Io(std::io::Error),
    Encoding(image::ImageError),
}

impl fmt::Display for LogoError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(message) => formatter.write_str(message),
            Self::NotFound => formatter.write_str("Logo file not found"),
            Self::Io(_) => formatter.write_str("Logo file operation failed"),
            Self::Encoding(_) => formatter.write_str("Logo image could not be saved"),
        }
    }
}

impl std::error::Error for LogoError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Encoding(error) => Some(error),
            Self::Invalid(_) | Self::NotFound => None,
        }
    }
}

/// Shared synchronous logo storage. Call from a blocking worker in async adapters.
pub struct LogoStore {
    directory: PathBuf,
}

impl LogoStore {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
        }
    }

    pub fn save_base64(&self, data: &str, subscription_id: &str) -> Result<String, LogoError> {
        let filename = Self::subscription_filename(subscription_id)?;
        let payload = base64_payload(data)?;
        if payload.len().saturating_mul(3) / 4 > MAX_IMAGE_BYTES {
            return Err(LogoError::Invalid(
                "Logo image exceeds the 5 MiB limit".into(),
            ));
        }
        let bytes = BASE64
            .decode(payload)
            .map_err(|_| LogoError::Invalid("Logo data is not valid base64".into()))?;
        self.save(&bytes, filename, 256)
    }

    pub fn save_file(
        &self,
        source_path: &Path,
        subscription_id: &str,
    ) -> Result<String, LogoError> {
        let filename = Self::subscription_filename(subscription_id)?;
        let bytes = read_image_file(source_path)
            .map_err(|error| LogoError::Invalid(format!("Logo image was rejected: {error}")))?;
        self.save(&bytes, filename, 256)
    }

    pub fn save_fetched(&self, bytes: &[u8], name: &str) -> Result<String, LogoError> {
        let stem = safe_fetched_logo_stem(name)
            .ok_or_else(|| LogoError::Invalid("Invalid service name for logo filename".into()))?;
        self.save(bytes, format!("fetched-{stem}.webp"), 128)
    }

    pub fn read_base64(&self, filename: &str) -> Result<String, LogoError> {
        let path = self.path(filename)?;
        let file = std::fs::File::open(path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                LogoError::NotFound
            } else {
                LogoError::Io(error)
            }
        })?;
        let mut bytes = Vec::new();
        file.take((MAX_STORED_LOGO_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(LogoError::Io)?;
        if bytes.len() > MAX_STORED_LOGO_BYTES {
            return Err(LogoError::Invalid(
                "Logo image exceeds the 8 MiB read limit".into(),
            ));
        }
        Ok(format!("data:image/webp;base64,{}", BASE64.encode(bytes)))
    }

    /// Deletion is idempotent; other I/O failures must not be reported as success.
    pub fn delete(&self, filename: &str) -> Result<(), LogoError> {
        match std::fs::remove_file(self.path(filename)?) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(LogoError::Io(error)),
        }
    }

    fn subscription_filename(subscription_id: &str) -> Result<String, LogoError> {
        let filename = format!("{subscription_id}.webp");
        validate_filename(&filename)
            .map_err(|_| LogoError::Invalid("Invalid subscription ID for logo filename".into()))?;
        Ok(filename)
    }

    fn path(&self, filename: &str) -> Result<PathBuf, LogoError> {
        validate_filename(filename)?;
        Ok(self.directory.join(filename))
    }

    fn save(&self, bytes: &[u8], filename: String, dimension: u32) -> Result<String, LogoError> {
        let image = decode_image(bytes)
            .map_err(|error| LogoError::Invalid(format!("Logo image was rejected: {error}")))?;
        self.save_encoded(filename, |file| {
            image
                .thumbnail(dimension, dimension)
                .write_to(file, ImageFormat::WebP)
        })
    }

    fn save_encoded(
        &self,
        filename: String,
        encode: impl FnOnce(&mut std::fs::File) -> image::ImageResult<()>,
    ) -> Result<String, LogoError> {
        let destination = self.path(&filename)?;
        std::fs::create_dir_all(&self.directory).map_err(LogoError::Io)?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(&self.directory).map_err(LogoError::Io)?;
        encode(temporary.as_file_mut()).map_err(|error| match error {
            image::ImageError::IoError(error) => LogoError::Io(error),
            error => LogoError::Encoding(error),
        })?;
        temporary
            .persist(destination)
            .map_err(|error| LogoError::Io(error.error))?;
        Ok(filename)
    }
}

fn validate_filename(filename: &str) -> Result<(), LogoError> {
    let basename = filename.split('.').next().unwrap_or_default();
    let reserved = ["CON", "PRN", "AUX", "NUL"]
        .iter()
        .any(|name| basename.eq_ignore_ascii_case(name))
        || (basename.get(..3).is_some_and(|prefix| {
            prefix.eq_ignore_ascii_case("COM") || prefix.eq_ignore_ascii_case("LPT")
        }) && matches!(
            basename.get(3..),
            Some("1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³")
        ));
    if filename
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && filename.ends_with(".webp")
        && !filename.contains("..")
        && !filename.starts_with('.')
        && !reserved
    {
        Ok(())
    } else {
        Err(LogoError::Invalid("Invalid filename".into()))
    }
}

fn base64_payload(data: &str) -> Result<&str, LogoError> {
    if !data.starts_with("data:") {
        return Ok(data);
    }
    for prefix in [
        "data:image/png;base64,",
        "data:image/jpeg;base64,",
        "data:image/webp;base64,",
        "data:image/gif;base64,",
    ] {
        if let Some(payload) = data.strip_prefix(prefix) {
            return Ok(payload);
        }
    }
    Err(LogoError::Invalid(
        "Logo image must be a PNG, JPEG, WebP, or GIF data URL".into(),
    ))
}

/// Google may redirect to its HTTPS favicon CDN. Never follow a downgrade.
pub fn logo_http_client() -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.url().scheme() != "https" {
                attempt.stop()
            } else {
                reqwest::redirect::Policy::limited(3).redirect(attempt)
            }
        }))
        .build()
}

/// Reduce a user-visible service name to a safe, bounded filename component.
pub fn safe_fetched_logo_stem(name: &str) -> Option<String> {
    let stem: String = name
        .trim()
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric() || matches!(character, '-' | '_'))
        .take(MAX_FETCHED_LOGO_STEM_CHARS)
        .collect();
    (!stem.is_empty()).then_some(stem)
}

/// Read an image selected on the local machine without allowing an unbounded read.
pub fn read_image_file(path: &Path) -> anyhow::Result<Vec<u8>> {
    let file = std::fs::File::open(path).context("could not open the selected image")?;
    let mut bytes = Vec::new();
    file.take((MAX_IMAGE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .context("could not read the selected image")?;
    validate_input_size(&bytes)?;
    Ok(bytes)
}

/// Read a remote image response without buffering more than the image byte limit.
pub async fn read_response_limited(mut response: reqwest::Response) -> anyhow::Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_IMAGE_BYTES as u64)
    {
        bail!("image exceeds the 5 MiB limit");
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .context("could not read image response")?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_IMAGE_BYTES {
            bail!("image exceeds the 5 MiB limit");
        }
        bytes.extend_from_slice(&chunk);
    }
    validate_input_size(&bytes)?;
    Ok(bytes)
}

/// Decode only the supported raster formats using strict dimension and allocation limits.
pub fn decode_image(bytes: &[u8]) -> anyhow::Result<DynamicImage> {
    validate_input_size(bytes)?;

    let format = image::guess_format(bytes).context("image format could not be identified")?;
    if !matches!(
        format,
        ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP | ImageFormat::Gif
    ) {
        bail!("image format must be PNG, JPEG, WebP, or GIF");
    }

    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);

    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    reader.decode().context("image could not be decoded")
}

fn validate_input_size(bytes: &[u8]) -> anyhow::Result<()> {
    if bytes.is_empty() {
        bail!("image is empty");
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        bail!("image exceeds the 5 MiB limit");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};

    fn png(width: u32, height: u32) -> Vec<u8> {
        let image = DynamicImage::ImageRgba8(ImageBuffer::from_pixel(
            width,
            height,
            Rgba([10, 20, 30, 255]),
        ));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        bytes.into_inner()
    }

    #[test]
    fn fetched_logo_stems_cannot_escape_the_logo_directory() {
        assert_eq!(
            safe_fetched_logo_stem(" ../../Acme Streaming/../ ").as_deref(),
            Some("acmestreaming")
        );
        assert_eq!(
            safe_fetched_logo_stem(&"a".repeat(MAX_FETCHED_LOGO_STEM_CHARS + 20))
                .unwrap()
                .chars()
                .count(),
            MAX_FETCHED_LOGO_STEM_CHARS
        );
        assert_eq!(safe_fetched_logo_stem("../.."), None);
    }

    #[test]
    fn decodes_supported_magic_and_writes_webp_thumbnail() {
        let temp = tempfile::tempdir().unwrap();
        let bytes = png(512, 256);

        let decoded = decode_image(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (512, 256));
        let filename = LogoStore::new(temp.path())
            .save_base64(&BASE64.encode(bytes), "logo")
            .unwrap();
        let saved = std::fs::read(temp.path().join(filename)).unwrap();
        assert_eq!(image::guess_format(&saved).unwrap(), ImageFormat::WebP);
        let thumbnail = decode_image(&saved).unwrap();
        assert_eq!((thumbnail.width(), thumbnail.height()), (256, 128));
    }

    #[test]
    fn failed_encoding_keeps_previous_logo_and_removes_temporary_file() {
        use std::io::Write;

        let temp = tempfile::tempdir().unwrap();
        let store = LogoStore::new(temp.path());
        let filename = store
            .save_base64(&BASE64.encode(png(8, 4)), "logo")
            .unwrap();
        let before = store.read_base64(&filename).unwrap();
        let error = store
            .save_encoded(filename.clone(), |file| {
                file.write_all(b"partial encoded image")?;
                // Readers during a write still see the complete previous logo.
                assert_eq!(store.read_base64(&filename).unwrap(), before);
                Err(std::io::Error::other("injected encoder failure").into())
            })
            .unwrap_err();
        assert!(matches!(error, LogoError::Io(_)));
        assert_eq!(store.read_base64(&filename).unwrap(), before);
        assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 1);
    }

    #[test]
    fn replacement_is_atomic_for_a_reader_during_encoding() {
        let temp = tempfile::tempdir().unwrap();
        let store = LogoStore::new(temp.path());
        let filename = store
            .save_base64(&BASE64.encode(png(8, 4)), "logo")
            .unwrap();
        let before = store.read_base64(&filename).unwrap();
        let replacement = decode_image(&png(16, 8)).unwrap();
        store
            .save_encoded(filename.clone(), |file| {
                replacement.write_to(file, ImageFormat::WebP)?;
                std::thread::scope(|scope| {
                    scope
                        .spawn(|| assert_eq!(store.read_base64(&filename).unwrap(), before))
                        .join()
                        .unwrap();
                });
                Ok(())
            })
            .unwrap();
        let after = store.read_base64(&filename).unwrap();
        assert_ne!(after, before);
        let bytes = BASE64
            .decode(after.strip_prefix("data:image/webp;base64,").unwrap())
            .unwrap();
        let decoded = decode_image(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (16, 8));
    }

    #[test]
    fn windows_reserved_basenames_are_rejected_for_all_logo_operations() {
        let temp = tempfile::tempdir().unwrap();
        let store = LogoStore::new(temp.path());
        for basename in [
            "CON", "prn", "Aux", "nul", "COM1", "com2", "COM3", "com4", "COM5", "com6", "COM7",
            "com8", "COM9", "LPT1", "lpt2", "LPT3", "lpt4", "LPT5", "lpt6", "LPT7", "lpt8", "LPT9",
            "COM¹", "com²", "COM³", "LPT¹", "lpt²", "LPT³",
        ] {
            let filename = format!("{basename}.webp");
            assert!(matches!(
                validate_filename(&filename),
                Err(LogoError::Invalid(_))
            ));
            assert!(matches!(
                store.read_base64(&filename),
                Err(LogoError::Invalid(_))
            ));
            assert!(matches!(
                store.delete(&filename),
                Err(LogoError::Invalid(_))
            ));
            assert!(matches!(
                store.save_base64(&BASE64.encode(png(1, 1)), basename),
                Err(LogoError::Invalid(_))
            ));
        }
        for filename in [
            "COM0.webp",
            "LPT10.webp",
            "console.webp",
            "名.webp",
            "a名.webp",
            "COM¹0.webp",
            "LPT³name.webp",
        ] {
            assert!(validate_filename(filename).is_ok(), "{filename}");
        }
        assert!(validate_filename("CON.extra.webp").is_err());
        assert!(validate_filename("com¹.extra.webp").is_err());
        assert!(validate_filename("lpt³.extra.webp").is_err());
    }

    #[test]
    fn rejects_empty_oversized_unsupported_and_over_dimension_images() {
        assert!(decode_image(&[]).unwrap_err().to_string().contains("empty"));
        assert!(decode_image(&vec![0; MAX_IMAGE_BYTES + 1])
            .unwrap_err()
            .to_string()
            .contains("5 MiB"));
        assert!(decode_image(b"GIF-not-really-an-image").is_err());
        let image =
            DynamicImage::ImageRgba8(ImageBuffer::from_pixel(1, 1, Rgba([10, 20, 30, 255])));
        let mut bmp = Cursor::new(Vec::new());
        image.write_to(&mut bmp, ImageFormat::Bmp).unwrap();
        assert!(decode_image(&bmp.into_inner())
            .unwrap_err()
            .to_string()
            .contains("PNG, JPEG, WebP, or GIF"));
        assert!(decode_image(&png(MAX_IMAGE_DIMENSION + 1, 1))
            .unwrap_err()
            .to_string()
            .contains("decoded"));
    }

    #[test]
    fn shared_store_saves_selected_and_fetched_files_and_validates_all_filenames() {
        let temp = tempfile::tempdir().unwrap();
        let selected = temp.path().join("selected.png");
        std::fs::write(&selected, png(8, 4)).unwrap();
        let store = LogoStore::new(temp.path().join("logos"));
        let filename = store.save_file(&selected, "subscription-1").unwrap();
        assert_eq!(filename, "subscription-1.webp");
        assert!(store
            .read_base64(&filename)
            .unwrap()
            .starts_with("data:image/webp;base64,"));
        assert_eq!(
            store.save_fetched(&png(8, 4), "../Acme Streaming").unwrap(),
            "fetched-acmestreaming.webp"
        );
        for filename in [
            "../escape.webp",
            ".hidden.webp",
            "bad.png",
            "a\\b.webp",
            "a/b.webp",
        ] {
            assert!(matches!(
                store.read_base64(filename),
                Err(LogoError::Invalid(_))
            ));
            assert!(matches!(store.delete(filename), Err(LogoError::Invalid(_))));
        }
        assert!(matches!(
            store.save_file(&selected, "../escape"),
            Err(LogoError::Invalid(_))
        ));
        store.delete("subscription-1.webp").unwrap();
        store.delete("subscription-1.webp").unwrap();
    }

    #[tokio::test]
    async fn logo_http_client_does_not_follow_non_https_redirects() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let hits = Arc::new(AtomicUsize::new(0));
        let count = hits.clone();
        let router = axum::Router::new().fallback(move || {
            let count = count.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                (
                    axum::http::StatusCode::FOUND,
                    [(axum::http::header::LOCATION, "/target")],
                )
            }
        });
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let response = logo_http_client()
            .unwrap()
            .get(format!("http://{address}/start"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::FOUND);
        assert_eq!(hits.load(Ordering::SeqCst), 1);
        server.abort();
        let _ = server.await;
    }
}
