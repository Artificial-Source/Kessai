pub mod logo;
mod routes;

use std::fmt;
use std::future::Future;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;

use anyhow::{bail, Context};
use axum::body::{to_bytes, Body};
use axum::extract::{Request, State};
use axum::http::header::{
    CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, COOKIE, HOST, LOCATION, ORIGIN,
    REFERRER_POLICY, SET_COOKIE, X_CONTENT_TYPE_OPTIONS, X_FRAME_OPTIONS,
};
use axum::http::uri::Authority;
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use kessai_core::KessaiCore;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

const X_FORWARDED_HOST: &str = "x-forwarded-host";
const TAILSCALE_USER_LOGIN: &str = "tailscale-user-login";
const PERMISSIONS_POLICY: HeaderName = HeaderName::from_static("permissions-policy");
const PRIVATE_ACCESS_PATH: &str = "/__kessai/private-access";
const PRIVATE_ACCESS_COOKIE: &str = "kessai_private_access";
const PRIVATE_ACCESS_FORM_LIMIT: usize = 1024;
pub const HEALTH_PATH: &str = "/__kessai/health";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ServerMode {
    Standalone,
    PrivateHosted,
    TailscaleHosted,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AccessContext {
    pub server_mode: &'static str,
    pub connection: &'static str,
    pub tailscale_login: Option<String>,
}

impl AccessContext {
    fn standalone() -> Self {
        Self {
            server_mode: "standalone",
            connection: "local",
            tailscale_login: None,
        }
    }

    fn private(access: RequestAccess<'_>) -> Self {
        Self::from_access("private_hosted", access)
    }

    fn tailscale_hosted(access: RequestAccess<'_>) -> Self {
        Self::from_access("tailscale_hosted", access)
    }

    fn from_access(server_mode: &'static str, access: RequestAccess<'_>) -> Self {
        match access {
            RequestAccess::Direct { .. } => Self {
                server_mode,
                connection: "local",
                tailscale_login: None,
            },
            RequestAccess::TailscaleServe { identity, .. } => Self {
                server_mode,
                connection: "tailscale",
                tailscale_login: Some(identity.to_owned()),
            },
        }
    }
}

#[derive(Clone)]
pub struct ServerConfig {
    mode: ServerMode,
    dist_dir: PathBuf,
    access_key: Option<Arc<str>>,
    trust_tailscale_proxy: bool,
    allowed_hosts: Arc<[Authority]>,
}

impl fmt::Debug for ServerConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ServerConfig")
            .field("mode", &self.mode)
            .field("dist_dir", &self.dist_dir)
            .field(
                "access_key",
                &self.access_key.as_ref().map(|_| "[REDACTED]"),
            )
            .field("trust_tailscale_proxy", &self.trust_tailscale_proxy)
            .field("allowed_hosts", &self.allowed_hosts)
            .finish()
    }
}

impl ServerConfig {
    pub fn standalone(dist_dir: impl Into<PathBuf>) -> Self {
        Self {
            mode: ServerMode::Standalone,
            dist_dir: dist_dir.into(),
            access_key: None,
            trust_tailscale_proxy: false,
            allowed_hosts: Arc::default(),
        }
    }

    pub fn private_hosted(
        dist_dir: impl Into<PathBuf>,
        access_key: impl Into<String>,
    ) -> anyhow::Result<Self> {
        let access_key = access_key.into();
        if access_key.is_empty() {
            bail!("private-hosted mode requires a nonempty access key");
        }

        Ok(Self {
            mode: ServerMode::PrivateHosted,
            dist_dir: dist_dir.into(),
            access_key: Some(Arc::from(access_key)),
            trust_tailscale_proxy: false,
            allowed_hosts: Arc::default(),
        })
    }

    pub fn tailscale_hosted(dist_dir: impl Into<PathBuf>, trust_tailscale_proxy: bool) -> Self {
        Self {
            mode: ServerMode::TailscaleHosted,
            dist_dir: dist_dir.into(),
            access_key: None,
            trust_tailscale_proxy,
            allowed_hosts: Arc::default(),
        }
    }

    /// Allow additional standalone request hostnames or IP literals.
    ///
    /// Entries have no scheme or port. Loopback listeners remain loopback-only.
    pub fn with_allowed_hosts(
        mut self,
        hosts: impl IntoIterator<Item = impl AsRef<str>>,
    ) -> anyhow::Result<Self> {
        if self.mode != ServerMode::Standalone {
            bail!("allowed hosts apply only to standalone mode");
        }
        let hosts = hosts
            .into_iter()
            .map(|host| {
                let host = host.as_ref();
                let authority = parse_authority(host)
                    .map_err(|()| anyhow::anyhow!("invalid allowed host '{host}'"))?;
                if authority.as_str() != authority.host()
                    || !(authority_ip(&authority).is_some() || is_valid_hostname(authority.host()))
                {
                    bail!("allowed host '{host}' must be a hostname or IP literal without a port");
                }
                Ok(authority)
            })
            .collect::<anyhow::Result<Vec<_>>>()?;
        self.allowed_hosts = hosts.into();
        Ok(self)
    }

    pub fn mode(&self) -> ServerMode {
        self.mode
    }

    pub fn dist_dir(&self) -> &Path {
        &self.dist_dir
    }
}

pub struct AppState {
    pub core: KessaiCore,
    pub logos_dir: PathBuf,
}

/// A fully validated web server that owns its already-bound listener.
pub struct PreparedServer {
    listener: tokio::net::TcpListener,
    router: Router,
}

impl PreparedServer {
    pub fn local_addr(&self) -> std::io::Result<SocketAddr> {
        self.listener.local_addr()
    }
}

#[derive(Clone)]
struct StandaloneAccessPolicy {
    listener_ip: IpAddr,
    allowed_hosts: Arc<[Authority]>,
}

impl StandaloneAccessPolicy {
    fn allows_authority(&self, authority: &Authority) -> bool {
        if self.listener_ip.is_loopback() {
            return is_loopback_authority(authority);
        }
        authority_ip(authority) == Some(self.listener_ip)
            || self
                .allowed_hosts
                .iter()
                .any(|allowed| allowed.host().eq_ignore_ascii_case(authority.host()))
    }
}

#[derive(Clone)]
struct PrivateAccessPolicy {
    listener_port: u16,
    access_key: Arc<str>,
    session_token: Arc<str>,
}

#[derive(Clone)]
struct TailscaleAccessPolicy {
    listener_port: u16,
    allow_direct: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RequestAccess<'a> {
    Direct {
        authority: &'a str,
    },
    TailscaleServe {
        authority: &'a str,
        identity: &'a str,
    },
}

/// Build the web application for a listener at `listener_addr`.
///
/// Private-hosted mode must be configured with the actual address of its
/// pre-bound listener so direct browser authorities can be checked exactly.
pub fn build_router(
    state: Arc<AppState>,
    config: &ServerConfig,
    listener_addr: SocketAddr,
) -> anyhow::Result<Router> {
    validate_frontend_dist(config.dist_dir())?;

    let allow_import = config.mode() != ServerMode::PrivateHosted;
    let api_routes = routes::api_router(state, allow_import);
    let index_path = config.dist_dir().join("index.html");
    let spa = ServeDir::new(config.dist_dir()).fallback(ServeFile::new(index_path));

    let mut app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(spa)
        .layer(TraceLayer::new_for_http());

    if config.mode() == ServerMode::TailscaleHosted {
        app = app.route(HEALTH_PATH, get(health));
    }

    let app = match config.mode() {
        ServerMode::Standalone => {
            let policy = StandaloneAccessPolicy {
                listener_ip: listener_addr.ip(),
                allowed_hosts: config.allowed_hosts.clone(),
            };
            app.layer(middleware::from_fn_with_state(policy, standalone_access))
        }
        ServerMode::PrivateHosted => {
            if !listener_addr.ip().is_loopback() {
                bail!(
                    "private-hosted mode requires a loopback listener, but {listener_addr} is not loopback"
                );
            }
            if listener_addr.port() == 0 {
                bail!("private-hosted mode requires the actual bound listener port, not port 0");
            }

            let access_key = config
                .access_key
                .clone()
                .filter(|key| !key.is_empty())
                .context("private-hosted mode requires a nonempty access key")?;
            // The persistent bootstrap key never leaves the login form as a
            // cookie. Each prepared server owns a fresh, unpersisted session.
            let mut session_bytes = [0_u8; 32];
            getrandom::fill(&mut session_bytes)
                .context("failed to generate a Private Web Access session token")?;
            let policy = PrivateAccessPolicy {
                listener_port: listener_addr.port(),
                access_key,
                session_token: Arc::from(URL_SAFE_NO_PAD.encode(session_bytes)),
            };
            app.layer(middleware::from_fn_with_state(policy, private_access))
        }
        ServerMode::TailscaleHosted => {
            if listener_addr.port() == 0 {
                bail!("tailscale-hosted mode requires the actual bound listener port, not port 0");
            }
            if !listener_addr.ip().is_loopback() && !config.trust_tailscale_proxy {
                bail!(
                    "tailscale-hosted mode requires a loopback listener unless trusted-proxy mode is explicitly enabled"
                );
            }
            let policy = TailscaleAccessPolicy {
                listener_port: listener_addr.port(),
                allow_direct: listener_addr.ip().is_loopback(),
            };
            app.layer(middleware::from_fn_with_state(policy, tailscale_access))
        }
    };

    // This is the outermost layer so policy rejections and route responses get
    // the same browser security headers.
    Ok(app.layer(middleware::from_fn(security_headers)))
}

/// Validate and build the web application for an already-bound listener.
///
/// Callers can complete this step before reporting that the server started.
pub fn prepare(
    listener: tokio::net::TcpListener,
    state: Arc<AppState>,
    config: &ServerConfig,
) -> anyhow::Result<PreparedServer> {
    let listener_addr = listener
        .local_addr()
        .context("failed to read the bound Kessai web listener address")?;
    let router = build_router(state, config, listener_addr)?;
    Ok(PreparedServer { listener, router })
}

/// Serve a prepared server until `shutdown` resolves, then drain in-flight
/// requests before returning.
pub async fn serve_prepared<F>(server: PreparedServer, shutdown: F) -> anyhow::Result<()>
where
    F: Future<Output = ()> + Send + 'static,
{
    axum::serve(server.listener, server.router)
        .with_graceful_shutdown(shutdown)
        .await
        .context("Kessai web server failed")?;
    Ok(())
}

/// Build and serve a pre-bound listener until `shutdown` resolves.
pub async fn serve<F>(
    listener: tokio::net::TcpListener,
    state: Arc<AppState>,
    config: ServerConfig,
    shutdown: F,
) -> anyhow::Result<()>
where
    F: Future<Output = ()> + Send + 'static,
{
    let server = prepare(listener, state, &config)?;
    serve_prepared(server, shutdown).await
}

fn validate_frontend_dist(dist_dir: &Path) -> anyhow::Result<()> {
    let index_path = dist_dir.join("index.html");
    let metadata = std::fs::metadata(&index_path).with_context(|| {
        format!(
            "frontend entry point '{}' is missing; run `pnpm build` or pass the correct `--dist-dir`",
            index_path.display()
        )
    })?;

    if !metadata.is_file() {
        bail!(
            "frontend entry point '{}' is not a file; run `pnpm build` or pass the correct `--dist-dir`",
            index_path.display()
        );
    }

    Ok(())
}

async fn health() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn standalone_access(
    State(policy): State<StandaloneAccessPolicy>,
    mut request: Request,
    next: Next,
) -> Response {
    if check_standalone_access(&policy, &request).is_err() {
        return standalone_rejection(&request);
    }
    request.extensions_mut().insert(AccessContext::standalone());
    next.run(request).await
}

fn check_standalone_access(policy: &StandaloneAccessPolicy, request: &Request) -> Result<(), ()> {
    let host = single_header(request.headers(), HOST.as_str())?;
    let uri_authority = request.uri().authority();
    let authority = parse_authority(
        host.or_else(|| uri_authority.map(Authority::as_str))
            .ok_or(())?,
    )?;
    if !policy.allows_authority(&authority)
        || uri_authority.is_some_and(|uri_authority| uri_authority != &authority)
    {
        return Err(());
    }
    if matches!(
        *request.method(),
        Method::POST | Method::PUT | Method::DELETE | Method::PATCH
    ) {
        if let Some(origin) = single_header(request.headers(), ORIGIN.as_str())? {
            let (scheme, authority) = parse_origin(origin)?;
            if !matches!(scheme, "http" | "https")
                || !(is_loopback_authority(&authority) || policy.allows_authority(&authority))
            {
                return Err(());
            }
        }
    }
    Ok(())
}

async fn tailscale_access(
    State(policy): State<TailscaleAccessPolicy>,
    mut request: Request,
    next: Next,
) -> Response {
    if request.uri().path() == HEALTH_PATH
        && matches!(*request.method(), Method::GET | Method::HEAD)
    {
        return next.run(request).await;
    }

    let access_context =
        match check_hosted_access(policy.listener_port, !policy.allow_direct, &request) {
            Ok(RequestAccess::Direct { .. }) if !policy.allow_direct => {
                return tailscale_rejection(&request)
            }
            Ok(access) => AccessContext::tailscale_hosted(access),
            Err(()) => return tailscale_rejection(&request),
        };
    request.extensions_mut().insert(access_context);
    next.run(request).await
}

async fn private_access(
    State(policy): State<PrivateAccessPolicy>,
    mut request: Request,
    next: Next,
) -> Response {
    let access = match check_private_access(&policy, &request) {
        Ok(access) => access,
        Err(()) => return policy_rejection(StatusCode::FORBIDDEN),
    };
    let secure_cookie = matches!(access, RequestAccess::TailscaleServe { .. });
    let access_context = AccessContext::private(access);

    let credential = match credential_cookie(request.headers()) {
        Ok(credential) => credential,
        Err(()) => return auth_rejection(StatusCode::UNAUTHORIZED),
    };
    let authenticated = credential.is_some_and(|credential| {
        bool::from(credential.as_bytes().ct_eq(policy.session_token.as_bytes()))
    });

    if request.uri().path() == PRIVATE_ACCESS_PATH {
        return match *request.method() {
            Method::GET | Method::HEAD if authenticated => redirect_home(None),
            Method::GET => access_page(StatusCode::OK, false),
            Method::HEAD => access_page(StatusCode::OK, false),
            Method::POST => authenticate(request, &policy, secure_cookie).await,
            _ => auth_rejection(StatusCode::METHOD_NOT_ALLOWED),
        };
    }

    if !authenticated {
        return if matches!(*request.method(), Method::GET | Method::HEAD) {
            redirect_to_access_page()
        } else {
            auth_rejection(StatusCode::UNAUTHORIZED)
        };
    }

    request.extensions_mut().insert(access_context);
    next.run(request).await
}

async fn authenticate(
    request: Request,
    policy: &PrivateAccessPolicy,
    secure_cookie: bool,
) -> Response {
    let content_type = match single_header(request.headers(), CONTENT_TYPE.as_str()) {
        Ok(Some(content_type)) => content_type,
        _ => return auth_rejection(StatusCode::UNSUPPORTED_MEDIA_TYPE),
    };
    let media_type = content_type
        .split_once(';')
        .map_or(content_type, |(media_type, _)| media_type)
        .trim();
    if !media_type.eq_ignore_ascii_case("application/x-www-form-urlencoded") {
        return auth_rejection(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }

    let bytes = match to_bytes(request.into_body(), PRIVATE_ACCESS_FORM_LIMIT).await {
        Ok(bytes) => bytes,
        Err(_) => return auth_rejection(StatusCode::PAYLOAD_TOO_LARGE),
    };
    let form = match serde_urlencoded::from_bytes::<PrivateAccessForm>(&bytes) {
        Ok(form) => form,
        Err(_) => return access_page(StatusCode::UNAUTHORIZED, true),
    };
    if !bool::from(
        form.access_key
            .as_bytes()
            .ct_eq(policy.access_key.as_bytes()),
    ) {
        return access_page(StatusCode::UNAUTHORIZED, true);
    }

    let mut cookie = format!(
        "{PRIVATE_ACCESS_COOKIE}={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000",
        policy.session_token
    );
    if secure_cookie {
        cookie.push_str("; Secure");
    }
    redirect_home(Some(cookie))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PrivateAccessForm {
    access_key: String,
}

fn credential_cookie(headers: &HeaderMap) -> Result<Option<&str>, ()> {
    let mut credential = None;
    for header in headers.get_all(COOKIE).iter() {
        let header = header.to_str().map_err(|_| ())?;
        for pair in header.split(';') {
            let pair = pair.trim_start_matches([' ', '\t']);
            let Some((name, value)) = pair.split_once('=') else {
                if pair.trim_end_matches([' ', '\t']) == PRIVATE_ACCESS_COOKIE {
                    return Err(());
                }
                continue;
            };
            if name.trim_matches([' ', '\t']) == PRIVATE_ACCESS_COOKIE
                && (name != PRIVATE_ACCESS_COOKIE || credential.replace(value).is_some())
            {
                return Err(());
            }
        }
    }
    Ok(credential)
}

fn redirect_to_access_page() -> Response {
    no_store_response(
        (
            StatusCode::SEE_OTHER,
            [(LOCATION, HeaderValue::from_static(PRIVATE_ACCESS_PATH))],
            Body::empty(),
        )
            .into_response(),
    )
}

fn redirect_home(cookie: Option<String>) -> Response {
    let mut response = (
        StatusCode::SEE_OTHER,
        [(LOCATION, HeaderValue::from_static("/"))],
        Body::empty(),
    )
        .into_response();
    if let Some(cookie) = cookie {
        if let Ok(cookie) = HeaderValue::from_str(&cookie) {
            response.headers_mut().insert(SET_COOKIE, cookie);
        }
    }
    no_store_response(response)
}

fn access_page(status: StatusCode, show_error: bool) -> Response {
    let error = if show_error {
        "<p class=\"error\" role=\"alert\">The access key was not accepted.</p>"
    } else {
        ""
    };
    let html = format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Kessai Private Web Access</title><style>color-scheme:dark;*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#fafafa;font-family:system-ui,sans-serif;padding:1.5rem}}main{{width:min(100%,28rem);border:1px solid #3f3f46;background:#18181b;padding:2rem;box-shadow:8px 8px 0 #27272a}}h1{{margin:0 0 .5rem;font-size:1.5rem}}p{{color:#a1a1aa;line-height:1.5}}label{{display:block;margin:1.5rem 0 .5rem;font-weight:700}}input{{width:100%;border:1px solid #52525b;background:#09090b;color:#fafafa;padding:.75rem;font:inherit}}button{{width:100%;margin-top:1rem;border:1px solid #fafafa;background:#fafafa;color:#09090b;padding:.75rem;font:700 inherit;cursor:pointer}}.eyebrow{{margin:0 0 .75rem;color:#a3e635;font:700 .75rem ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}}.error{{color:#fca5a5}}</style></head><body><main><p class=\"eyebrow\">Private Web Access</p><h1>Open Kessai</h1><p>Enter the access key shown in Kessai desktop Settings. This browser will remember it until access is disabled and re-enabled.</p>{error}<form method=\"post\" action=\"{PRIVATE_ACCESS_PATH}\"><label for=\"access-key\">Access key</label><input id=\"access-key\" name=\"access_key\" type=\"password\" required autocomplete=\"current-password\" maxlength=\"128\" autofocus><button type=\"submit\">Continue</button></form></main></body></html>"
    );
    no_store_response((status, Html(html)).into_response())
}

fn standalone_rejection(request: &Request) -> Response {
    let path = request.uri().path();
    let is_api = path == "/api" || path.starts_with("/api/");
    if !is_api && matches!(*request.method(), Method::GET | Method::HEAD) {
        return no_store_response(
            (
                StatusCode::FORBIDDEN,
                Html("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Request blocked · Kessai</title></head><body><main><h1>Request blocked</h1><p>Use an allowed Kessai server hostname or loopback address.</p></main></body></html>"),
            )
                .into_response(),
        );
    }
    no_store_response(
        (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Request rejected by the standalone access policy"
            })),
        )
            .into_response(),
    )
}

fn tailscale_rejection(request: &Request) -> Response {
    let path = request.uri().path();
    let is_api = path == "/api" || path.starts_with("/api/");
    if !is_api && matches!(*request.method(), Method::GET | Method::HEAD) {
        let html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Tailscale access required · Kessai</title><style>color-scheme:dark;*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08090a;color:#f4f4f5;font-family:system-ui,sans-serif;padding:1.5rem}main{width:min(100%,32rem);border:1px solid #3f3f46;background:#111214;padding:2rem;box-shadow:10px 10px 0 #202225}.mark{color:#a3e635;font:800 .72rem ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}h1{margin:.8rem 0;font-size:clamp(1.8rem,5vw,2.6rem);line-height:1}p{margin:0;color:#a1a1aa;line-height:1.6}.rule{width:3rem;height:3px;margin:1.5rem 0;background:#a3e635}</style></head><body><main><div class=\"mark\">ASF / Kessai</div><div class=\"rule\"></div><h1>Tailscale access required</h1><p>Open this address through your private tailnet. Public access and Tailscale Funnel are not supported.</p></main></body></html>";
        return no_store_response((StatusCode::FORBIDDEN, Html(html)).into_response());
    }

    no_store_response(
        (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "Tailscale access required" })),
        )
            .into_response(),
    )
}

fn policy_rejection(status: StatusCode) -> Response {
    no_store_response(
        (
            status,
            Json(serde_json::json!({
                "error": "Request rejected by the Private Web Access policy"
            })),
        )
            .into_response(),
    )
}

fn auth_rejection(status: StatusCode) -> Response {
    no_store_response(
        (
            status,
            Json(serde_json::json!({
                "error": "Private Web Access authentication required"
            })),
        )
            .into_response(),
    )
}

fn no_store_response(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

fn check_private_access<'a>(
    policy: &PrivateAccessPolicy,
    request: &'a Request,
) -> Result<RequestAccess<'a>, ()> {
    check_hosted_access(policy.listener_port, false, request)
}

fn check_hosted_access(
    listener_port: u16,
    trust_proxy_loopback_host: bool,
    request: &Request,
) -> Result<RequestAccess<'_>, ()> {
    let access = classify_request(request.headers(), listener_port, trust_proxy_loopback_host)?;
    let expected_scheme = match access {
        RequestAccess::Direct { .. } => "http",
        RequestAccess::TailscaleServe { .. } => "https",
    };
    let expected_authority = match access {
        RequestAccess::Direct { authority } | RequestAccess::TailscaleServe { authority, .. } => {
            authority
        }
    };

    if let Some(scheme) = request.uri().scheme_str() {
        if scheme != expected_scheme {
            return Err(());
        }
    }

    let origin = single_header(request.headers(), ORIGIN.as_str())?;
    let origin_required = !matches!(*request.method(), Method::GET | Method::HEAD);
    match origin {
        Some(origin) => validate_origin(origin, expected_scheme, expected_authority)?,
        None if origin_required => return Err(()),
        None => {}
    }

    Ok(access)
}

fn classify_request(
    headers: &HeaderMap,
    listener_port: u16,
    trust_proxy_loopback_host: bool,
) -> Result<RequestAccess<'_>, ()> {
    let host = single_header(headers, HOST.as_str())?.ok_or(())?;
    parse_authority(host)?;

    let forwarded_host = single_header(headers, X_FORWARDED_HOST)?;
    if let Some(forwarded_host) = forwarded_host {
        parse_authority(forwarded_host)?;
    }

    let effective_authority = forwarded_host.unwrap_or(host);
    if is_direct_authority(effective_authority, listener_port) {
        if forwarded_host.is_some() || host != effective_authority {
            return Err(());
        }
        return Ok(RequestAccess::Direct {
            authority: effective_authority,
        });
    }

    let effective = parse_authority(effective_authority)?;
    if !is_valid_tailscale_authority(&effective) {
        return Err(());
    }

    // Tailscale Serve can retain the public Host or put it in one
    // X-Forwarded-Host value while targeting the loopback authority.
    if forwarded_host.is_some()
        && host != effective_authority
        && !is_direct_authority(host, listener_port)
        && !(trust_proxy_loopback_host && is_canonical_loopback_authority(host))
    {
        return Err(());
    }

    // Hosted policies accept the identity only after strict authority checks.
    // Loopback deployment keeps remote clients from forging it; local callers
    // remain trusted by the documented threat model.
    let identity = single_header(headers, TAILSCALE_USER_LOGIN)?.ok_or(())?;
    if identity.trim().is_empty() {
        return Err(());
    }

    Ok(RequestAccess::TailscaleServe {
        authority: effective_authority,
        identity,
    })
}

fn single_header<'a>(headers: &'a HeaderMap, name: &str) -> Result<Option<&'a str>, ()> {
    let mut values = headers.get_all(name).iter();
    let Some(value) = values.next() else {
        return Ok(None);
    };
    if values.next().is_some() {
        return Err(());
    }

    let value = value.to_str().map_err(|_| ())?;
    if value.contains(',') {
        return Err(());
    }
    Ok(Some(value))
}

fn parse_authority(value: &str) -> Result<Authority, ()> {
    if value.is_empty()
        || value != value.trim()
        || value.contains('@')
        || value.contains('/')
        || value.contains('?')
        || value.contains('#')
    {
        return Err(());
    }

    let authority = Authority::from_str(value).map_err(|_| ())?;
    if authority.as_str() != authority.host() && authority.port_u16().is_none() {
        return Err(());
    }
    Ok(authority)
}

fn authority_ip(authority: &Authority) -> Option<IpAddr> {
    let host = authority.host();
    host.strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .unwrap_or(host)
        .parse()
        .ok()
}

fn is_loopback_authority(authority: &Authority) -> bool {
    let host = authority.host();
    host.eq_ignore_ascii_case("localhost") || matches!(host, "127.0.0.1" | "[::1]")
}

fn is_direct_authority(authority: &str, listener_port: u16) -> bool {
    authority == format!("127.0.0.1:{listener_port}")
        || authority == format!("localhost:{listener_port}")
}

fn is_canonical_loopback_authority(authority: &str) -> bool {
    parse_authority(authority).is_ok_and(|parsed| {
        matches!(parsed.host(), "127.0.0.1" | "localhost") && parsed.port_u16().is_some()
    })
}

fn is_valid_tailscale_authority(authority: &Authority) -> bool {
    if authority.port().is_some() && authority.port_u16().is_none() {
        return false;
    }

    let hostname = authority.host();
    if !hostname.ends_with(".ts.net") || hostname.len() > 253 {
        return false;
    }

    is_valid_hostname(hostname)
}

fn is_valid_hostname(hostname: &str) -> bool {
    !hostname.is_empty()
        && hostname.len() <= 253
        && hostname.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                && label
                    .as_bytes()
                    .first()
                    .is_some_and(u8::is_ascii_alphanumeric)
                && label
                    .as_bytes()
                    .last()
                    .is_some_and(u8::is_ascii_alphanumeric)
        })
}

fn parse_origin(origin: &str) -> Result<(&str, Authority), ()> {
    let (scheme, authority) = origin.split_once("://").ok_or(())?;
    Ok((scheme, parse_authority(authority)?))
}

fn validate_origin(
    origin: &str,
    expected_scheme: &str,
    expected_authority: &str,
) -> Result<(), ()> {
    let (scheme, authority) = parse_origin(origin)?;
    if scheme != expected_scheme || authority.as_str() != expected_authority {
        return Err(());
    }
    Ok(())
}

async fn security_headers(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    headers.insert(
        CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
        ),
    );
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert(
        PERMISSIONS_POLICY,
        HeaderValue::from_static("camera=(), geolocation=(), microphone=(), payment=(), usb=()"),
    );

    response
}
