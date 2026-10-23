use std::{ffi::OsString, path::Path, sync::Arc};

use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    Router,
};
use kessai_core::KessaiCore;
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use subtle::ConstantTimeEq;

use crate::{
    app::{AppError, Result},
    mcp::{KessaiMcp, McpOptions},
};

#[derive(Clone)]
struct SecurityState {
    token: Arc<str>,
    port: u16,
}

pub fn load_token(token_file: Option<&Path>) -> Result<String> {
    load_token_with_env(token_file, || std::env::var_os("KESSAI_MCP_TOKEN"))
}

fn load_token_with_env(
    token_file: Option<&Path>,
    env_token: impl FnOnce() -> Option<OsString>,
) -> Result<String> {
    let raw = if let Some(path) = token_file {
        read_token_file(path)?
    } else {
        env_token()
            .ok_or_else(|| {
                AppError::validation(
                    "token_file",
                    "serve --http requires --token-file or KESSAI_MCP_TOKEN",
                    "Provide an owner-only token file with --token-file /path/to/token.",
                )
            })?
            .into_string()
            .map_err(|_| AppError::Validation("KESSAI_MCP_TOKEN must be valid UTF-8".into()))?
    };
    let token = raw.trim().to_owned();
    if token.len() < 32 || token.chars().any(char::is_whitespace) {
        return Err(AppError::Validation(
            "MCP HTTP bearer token must contain at least 32 non-whitespace bytes".into(),
        ));
    }
    Ok(token)
}

#[cfg(unix)]
fn read_token_file(path: &Path) -> Result<String> {
    use std::fs::OpenOptions;
    use std::io::Read;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(|error| {
            if error.raw_os_error() == Some(libc::ELOOP) {
                AppError::Validation("MCP token file must not be a symlink".into())
            } else {
                AppError::Io(format!("failed to open MCP token file: {error}"))
            }
        })?;
    let metadata = file
        .metadata()
        .map_err(|error| AppError::Io(format!("failed to inspect MCP token file: {error}")))?;
    // SAFETY: geteuid has no preconditions and only reads the process credentials.
    validate_unix_token_metadata(&metadata, unsafe { libc::geteuid() })?;

    let mut raw = String::new();
    file.read_to_string(&mut raw).map_err(|error| {
        if error.kind() == std::io::ErrorKind::InvalidData {
            AppError::Validation("MCP token file must be valid UTF-8".into())
        } else {
            AppError::Io(format!("failed to read MCP token file: {error}"))
        }
    })?;
    Ok(raw)
}

#[cfg(unix)]
fn validate_unix_token_metadata(metadata: &std::fs::Metadata, effective_uid: u32) -> Result<()> {
    use std::os::unix::fs::MetadataExt;

    if !metadata.file_type().is_file() {
        return Err(AppError::Validation(
            "MCP token file must be a regular file".into(),
        ));
    }
    if metadata.uid() != effective_uid {
        return Err(AppError::Validation(format!(
            "MCP token file must be owned by the effective user (expected UID {effective_uid}, found UID {})",
            metadata.uid()
        )));
    }
    if metadata.mode() & 0o077 != 0 {
        return Err(AppError::Validation(
            "MCP token file must be owner-only with no group or other permissions (for example, chmod 600)"
                .into(),
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn read_token_file(_path: &Path) -> Result<String> {
    Err(AppError::Validation(
        "--token-file is not supported on Windows because ACL validation is not implemented; use KESSAI_MCP_TOKEN"
            .into(),
    ))
}

#[cfg(not(any(unix, windows)))]
fn read_token_file(_path: &Path) -> Result<String> {
    Err(AppError::Validation(
        "--token-file is not supported on this platform; use KESSAI_MCP_TOKEN".into(),
    ))
}

pub async fn serve(core: KessaiCore, port: u16, token: String, read_only: bool) -> Result<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    let address = listener.local_addr()?;
    let config = StreamableHttpServerConfig::default();
    let cancellation = config.cancellation_token.clone();
    let router = build_router(core, address.port(), token, read_only, config);
    eprintln!(
        "Kessai MCP listening on http://127.0.0.1:{}/mcp",
        address.port()
    );

    axum::serve(listener, router)
        .with_graceful_shutdown({
            let cancellation = cancellation.clone();
            async move {
                if tokio::signal::ctrl_c().await.is_ok() {
                    cancellation.cancel();
                }
            }
        })
        .await
        .map_err(|error| AppError::Io(error.to_string()))
}

fn build_router(
    core: KessaiCore,
    port: u16,
    token: String,
    read_only: bool,
    config: StreamableHttpServerConfig,
) -> Router {
    let service: StreamableHttpService<KessaiMcp, LocalSessionManager> = StreamableHttpService::new(
        move || {
            Ok(KessaiMcp::with_options(
                core.clone(),
                McpOptions { read_only },
            ))
        },
        Default::default(),
        config,
    );
    let security = SecurityState {
        token: token.into(),
        port,
    };
    Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(security, authorize))
}

async fn authorize(State(state): State<SecurityState>, request: Request, next: Next) -> Response {
    let Some(host) = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .filter(|value| {
            *value == format!("127.0.0.1:{}", state.port)
                || *value == format!("localhost:{}", state.port)
        })
    else {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    };

    if request.headers().get(header::ORIGIN).is_some_and(|origin| {
        origin
            .to_str()
            .ok()
            .is_none_or(|value| value != format!("http://{host}"))
    }) {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }

    let authorized = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|provided| bool::from(provided.as_bytes().ct_eq(state.token.as_bytes())));
    if !authorized {
        let mut response = (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
        response
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
        return response;
    }

    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use serde_json::Value;
    use tower::ServiceExt;

    const PORT: u16 = 8742;
    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    fn test_router() -> Router {
        let file = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(file.path()).unwrap();
        build_router(
            core,
            PORT,
            TOKEN.into(),
            false,
            StreamableHttpServerConfig::default(),
        )
    }

    fn request(host: &str, authorization: Option<&str>, origin: Option<&str>) -> Request<Body> {
        let mut builder = Request::builder().uri("/mcp").header(header::HOST, host);
        if let Some(authorization) = authorization {
            builder = builder.header(header::AUTHORIZATION, authorization);
        }
        if let Some(origin) = origin {
            builder = builder.header(header::ORIGIN, origin);
        }
        builder.body(Body::empty()).unwrap()
    }

    #[tokio::test]
    async fn rejects_missing_and_wrong_authorization() {
        for authorization in [None, Some("Bearer wrong")] {
            let response = test_router()
                .oneshot(request("127.0.0.1:8742", authorization, None))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            assert_eq!(response.headers()[header::WWW_AUTHENTICATE], "Bearer");
        }
    }

    #[tokio::test]
    async fn rejects_bad_host_and_origin() {
        let authorization = format!("Bearer {TOKEN}");
        let response = test_router()
            .oneshot(request("evil.example", Some(&authorization), None))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test_router()
            .oneshot(request(
                "localhost:8742",
                Some(&authorization),
                Some("http://evil.example"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let response = test_router()
            .oneshot(request(
                "127.0.0.1:8742",
                Some(&authorization),
                Some("http://localhost:8742"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    fn mcp_request(body: Value, session: Option<&str>) -> Request<Body> {
        let mut builder = Request::builder()
            .method("POST")
            .uri("/mcp")
            .header(header::HOST, "localhost:8742")
            .header(header::ORIGIN, "http://localhost:8742")
            .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "application/json, text/event-stream");
        if let Some(session) = session {
            builder = builder.header("mcp-session-id", session);
        }
        builder.body(Body::from(body.to_string())).unwrap()
    }

    async fn response_json(response: Response) -> Value {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body = String::from_utf8(bytes.to_vec()).unwrap();
        let data = body
            .lines()
            .filter_map(|line| line.strip_prefix("data:").map(str::trim))
            .find(|data| data.starts_with('{'))
            .unwrap_or(body.trim());
        serde_json::from_str(data).unwrap()
    }

    #[tokio::test]
    async fn read_only_http_hides_and_rejects_mutating_tools() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let core = KessaiCore::new(file.path()).unwrap();
        let router = build_router(
            core,
            PORT,
            TOKEN.into(),
            true,
            StreamableHttpServerConfig::default(),
        );
        let initialize = router.clone().oneshot(mcp_request(
            serde_json::json!({
                "jsonrpc":"2.0", "id":1, "method":"initialize",
                "params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"read-only-test","version":"1"}}
            }), None,
        )).await.unwrap();
        let session = initialize.headers()["mcp-session-id"]
            .to_str()
            .unwrap()
            .to_owned();
        assert_eq!(initialize.status(), StatusCode::OK);
        let initialized = router
            .clone()
            .oneshot(mcp_request(
                serde_json::json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
                Some(&session),
            ))
            .await
            .unwrap();
        assert_eq!(initialized.status(), StatusCode::ACCEPTED);
        let listed = router
            .clone()
            .oneshot(mcp_request(
                serde_json::json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}),
                Some(&session),
            ))
            .await
            .unwrap();
        let listed = response_json(listed).await;
        let tools = listed["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 12);
        assert!(tools
            .iter()
            .all(|tool| tool["annotations"]["readOnlyHint"] == true));
        let rejected = router.oneshot(mcp_request(
            serde_json::json!({
                "jsonrpc":"2.0","id":3,"method":"tools/call",
                "params":{"name":"subscriptions_delete","arguments":{"id":"missing","confirm":true}}
            }), Some(&session),
        )).await.unwrap();
        let rejected = response_json(rejected).await;
        assert_eq!(rejected["error"]["code"], -32602);
        assert_eq!(rejected["error"]["message"], "tool not found");
    }

    #[tokio::test]
    async fn authorized_initialize_and_complete_tools_list_flow_succeeds() {
        let router = test_router();
        let initialize = router
            .clone()
            .oneshot(mcp_request(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "test", "version": "1.0"}
                    }
                }),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(initialize.status(), StatusCode::OK);
        let session = initialize.headers()["mcp-session-id"]
            .to_str()
            .unwrap()
            .to_owned();
        let initialize = response_json(initialize).await;
        assert_eq!(initialize["id"], 1);
        assert_eq!(initialize["result"]["protocolVersion"], "2024-11-05");
        assert_eq!(
            initialize["result"]["serverInfo"],
            serde_json::json!({
                "name": "kessai-mcp",
                "version": env!("CARGO_PKG_VERSION"),
                "title": "Kessai subscriptions",
                "description": "Local subscription tracker: no bank or provider contact"
            })
        );
        assert_eq!(
            initialize["result"]["capabilities"],
            serde_json::json!({"tools": {}, "resources": {}, "prompts": {}})
        );

        let initialized = router
            .clone()
            .oneshot(mcp_request(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized"
                }),
                Some(&session),
            ))
            .await
            .unwrap();
        assert_eq!(initialized.status(), StatusCode::ACCEPTED);

        let listed = router
            .clone()
            .oneshot(mcp_request(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/list",
                    "params": {}
                }),
                Some(&session),
            ))
            .await
            .unwrap();
        assert_eq!(listed.status(), StatusCode::OK);
        let listed = response_json(listed).await;
        let tools = listed["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 31);
        assert!(tools
            .iter()
            .all(|tool| tool["name"] != "toggle_subscription"));
        for tool in tools {
            assert_eq!(
                tool["inputSchema"]["additionalProperties"], false,
                "{}",
                tool["name"]
            );
            assert!(tool["outputSchema"].is_object(), "{}", tool["name"]);
        }

        let called = router
            .clone()
            .oneshot(mcp_request(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {"name": "analytics_dashboard", "arguments": {}}
                }),
                Some(&session),
            ))
            .await
            .unwrap();
        assert_eq!(called.status(), StatusCode::OK);
        let called = response_json(called).await;
        assert_eq!(called["id"], 3);
        assert!(called.get("error").is_none(), "{called}");

        let resource = router
            .clone()
            .oneshot(mcp_request(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "resources/read",
                    "params": {"uri": "kessai://subscriptions"}
                }),
                Some(&session),
            ))
            .await
            .unwrap();
        assert_eq!(resource.status(), StatusCode::OK);
        assert_eq!(
            response_json(resource).await["result"],
            serde_json::json!({
                "contents": [{
                    "uri": "kessai://subscriptions",
                    "mimeType": "application/json",
                    "text": "{\"items\":[],\"next_cursor\":null,\"total\":0,\"warnings\":[]}"
                }]
            })
        );

        let prompt = router
            .oneshot(mcp_request(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 5,
                    "method": "prompts/get",
                    "params": {"name": "subscription_review"}
                }),
                Some(&session),
            ))
            .await
            .unwrap();
        assert_eq!(prompt.status(), StatusCode::OK);
        assert_eq!(
            response_json(prompt).await["result"],
            serde_json::json!({
                "description": "Review subscriptions without changing them until the user approves",
                "messages": [{
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": crate::mcp::REVIEW_PROMPT
                    }
                }]
            })
        );
    }

    #[cfg(unix)]
    fn owner_only_token_file(contents: &str) -> tempfile::NamedTempFile {
        use std::os::unix::fs::PermissionsExt;

        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), contents).unwrap();
        std::fs::set_permissions(file.path(), std::fs::Permissions::from_mode(0o600)).unwrap();
        file
    }

    #[cfg(unix)]
    fn validation_message(error: AppError) -> String {
        assert_eq!(error.code(), "validation_error");
        error.to_string()
    }

    #[cfg(unix)]
    #[test]
    fn loads_owner_only_regular_token_file_with_trailing_newline() {
        let file = owner_only_token_file(&format!("{TOKEN}\n"));
        assert_eq!(load_token(Some(file.path())).unwrap(), TOKEN);
    }

    #[test]
    fn loads_env_token_when_no_file_is_provided() {
        let token = load_token_with_env(None, || Some(OsString::from(format!("{TOKEN}\n"))));
        assert_eq!(token.unwrap(), TOKEN);
    }

    #[cfg(unix)]
    #[test]
    fn explicit_token_file_takes_precedence_over_invalid_env_token() {
        let file = owner_only_token_file(TOKEN);
        let token = load_token_with_env(Some(file.path()), || Some(OsString::from("short")));
        assert_eq!(token.unwrap(), TOKEN);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_weak_token_from_file() {
        let file = owner_only_token_file("short");
        assert_eq!(
            load_token(Some(file.path())).unwrap_err().code(),
            "validation_error"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_token_file_with_group_or_other_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let file = owner_only_token_file(TOKEN);
        std::fs::set_permissions(file.path(), std::fs::Permissions::from_mode(0o644)).unwrap();
        let message = validation_message(load_token(Some(file.path())).unwrap_err());
        assert!(message.contains("owner-only"), "{message}");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_token_file() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("token");
        let link = directory.path().join("token-link");
        std::fs::write(&target, TOKEN).unwrap();
        symlink(&target, &link).unwrap();

        let message = validation_message(load_token(Some(&link)).unwrap_err());
        assert!(message.contains("symlink"), "{message}");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_non_regular_token_file() {
        let directory = tempfile::tempdir().unwrap();
        let message = validation_message(load_token(Some(directory.path())).unwrap_err());
        assert!(message.contains("regular file"), "{message}");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_token_file_owned_by_a_different_uid() {
        use std::os::unix::fs::MetadataExt;

        let file = owner_only_token_file(TOKEN);
        let metadata = file.as_file().metadata().unwrap();
        let different_uid = metadata.uid().wrapping_add(1);
        let message =
            validation_message(validate_unix_token_metadata(&metadata, different_uid).unwrap_err());
        assert!(message.contains("effective user"), "{message}");
    }
}
