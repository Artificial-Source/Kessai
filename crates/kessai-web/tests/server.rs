use std::io::Cursor;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::header::{
    ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, COOKIE,
    HOST, LOCATION, ORIGIN, REFERRER_POLICY, SET_COOKIE, X_CONTENT_TYPE_OPTIONS, X_FRAME_OPTIONS,
};
use axum::http::{HeaderName, HeaderValue, Method, Request, StatusCode};
use axum::response::Response;
use axum::Router;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use http_body_util::BodyExt;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use kessai_core::KessaiCore;
use kessai_web::{build_router, prepare, serve_prepared, AppState, ServerConfig, ServerMode};
use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::sync::oneshot;
use tower::ServiceExt;

const TEST_PORT: u16 = 31_337;
const INDEX_HTML: &str = "<!doctype html><title>Kessai test app</title>";
const TAILSCALE_HOST: &str = "kessai.example-tailnet.ts.net";
const TEST_ACCESS_KEY: &str = "test-private-access-key";
const ACCESS_PATH: &str = "/__kessai/private-access";
const ACCESS_COOKIE: &str = "kessai_private_access";

struct TestApp {
    _temp: TempDir,
    router: Router,
    logos_dir: PathBuf,
}

fn test_app(mode: ServerMode) -> TestApp {
    test_app_at(mode, IpAddr::V4(Ipv4Addr::LOCALHOST), &[])
}

fn test_app_at(mode: ServerMode, listener_ip: IpAddr, allowed_hosts: &[&str]) -> TestApp {
    let temp = tempfile::tempdir().expect("create temp directory");
    let dist_dir = temp.path().join("dist");
    let logos_dir = temp.path().join("logos");
    std::fs::create_dir_all(&dist_dir).expect("create dist directory");
    std::fs::create_dir_all(&logos_dir).expect("create logos directory");
    std::fs::write(dist_dir.join("index.html"), INDEX_HTML).expect("write index.html");

    let core = KessaiCore::new(&temp.path().join("kessai.db")).expect("create test database");
    let state = Arc::new(AppState {
        core,
        logos_dir: logos_dir.clone(),
    });
    let config = match mode {
        ServerMode::Standalone => ServerConfig::standalone(dist_dir)
            .with_allowed_hosts(allowed_hosts.iter().copied())
            .expect("standalone config"),
        ServerMode::PrivateHosted => {
            ServerConfig::private_hosted(dist_dir, TEST_ACCESS_KEY).expect("private config")
        }
        ServerMode::TailscaleHosted => ServerConfig::tailscale_hosted(dist_dir, false),
    };
    let listener_addr = SocketAddr::new(listener_ip, TEST_PORT);
    let router = build_router(state, &config, listener_addr).expect("build test router");

    TestApp {
        _temp: temp,
        router,
        logos_dir,
    }
}

fn request(method: Method, path: &str, host: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header(HOST, host)
        .body(Body::empty())
        .expect("build request")
}

async fn private_session_cookie(router: &Router) -> String {
    let response = send(
        router,
        form_request(&direct_host(), &direct_origin(), TEST_ACCESS_KEY),
    )
    .await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    response
        .headers()
        .get(SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned()
}

async fn authorized(router: &Router, mut request: Request<Body>) -> Request<Body> {
    request.headers_mut().insert(
        COOKIE,
        HeaderValue::from_str(&private_session_cookie(router).await).expect("credential cookie"),
    );
    request
}

fn tailscale(mut request: Request<Body>) -> Request<Body> {
    request.headers_mut().insert(
        HeaderName::from_static("tailscale-user-login"),
        HeaderValue::from_static("alice@example.com"),
    );
    request
}

fn form_request(host: &str, origin: &str, access_key: &str) -> Request<Body> {
    Request::builder()
        .method(Method::POST)
        .uri(ACCESS_PATH)
        .header(HOST, host)
        .header(ORIGIN, origin)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(Body::from(format!("access_key={access_key}")))
        .expect("build form request")
}

fn json_request(
    method: Method,
    path: &str,
    host: &str,
    origin: &str,
    body: Value,
) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header(HOST, host)
        .header(ORIGIN, origin)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .expect("build JSON request")
}

async fn send(router: &Router, request: Request<Body>) -> Response {
    router
        .clone()
        .oneshot(request)
        .await
        .expect("router response")
}

async fn body_json(response: Response) -> Value {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("collect response body")
        .to_bytes();
    serde_json::from_slice(&bytes).expect("JSON response body")
}

async fn body_text(response: Response) -> String {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("collect response body")
        .to_bytes();
    String::from_utf8(bytes.to_vec()).expect("UTF-8 response body")
}

fn direct_host() -> String {
    format!("127.0.0.1:{TEST_PORT}")
}

fn localhost_host() -> String {
    format!("localhost:{TEST_PORT}")
}

fn direct_origin() -> String {
    format!("http://127.0.0.1:{TEST_PORT}")
}

fn tiny_png(width: u32, height: u32) -> Vec<u8> {
    let image = DynamicImage::ImageRgba8(ImageBuffer::from_pixel(
        width,
        height,
        Rgba([32, 180, 90, 255]),
    ));
    let mut bytes = Cursor::new(Vec::new());
    image.write_to(&mut bytes, ImageFormat::Png).unwrap();
    bytes.into_inner()
}

async fn assert_policy_forbidden(response: Response) {
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(response.headers().get(CACHE_CONTROL).unwrap(), "no-store");
    assert_eq!(
        response.headers().get(CONTENT_TYPE).unwrap(),
        "application/json"
    );
    assert_eq!(
        body_json(response).await,
        json!({ "error": "Request rejected by the Private Web Access policy" })
    );
}

async fn create_test_subscription(router: &Router) -> Value {
    let response = send(
        router,
        json_request(
            Method::POST,
            "/api/subscriptions",
            "localhost:3000",
            "http://localhost:1430",
            json!({
                "name": "Access policy regression",
                "amount": 10,
                "currency": "USD",
                "billing_cycle": "monthly",
                "next_payment_date": "2026-11-01"
            }),
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    body_json(response).await
}

#[tokio::test]
async fn standalone_loopback_rejects_rebinding_hosts_before_reads_and_mutations() {
    let app = test_app(ServerMode::Standalone);
    let subscription = create_test_subscription(&app.router).await;
    let path = format!(
        "/api/subscriptions/{}",
        subscription["id"].as_str().unwrap()
    );
    let toggle = format!("{path}/toggle");

    for (method, path) in [
        (Method::GET, "/api/export"),
        (Method::POST, toggle.as_str()),
    ] {
        let response = send(&app.router, request(method, path, "attacker.example:3000")).await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(response.headers().get(CACHE_CONTROL).unwrap(), "no-store");
        assert_eq!(
            response.headers().get(CONTENT_TYPE).unwrap(),
            "application/json"
        );
        assert!(body_json(response).await["error"].is_string());
    }

    let unchanged = send(&app.router, request(Method::GET, &path, "localhost:3000")).await;
    assert_eq!(body_json(unchanged).await, subscription);

    for host in [
        "localhost:3000",
        "127.0.0.1:3000",
        "[::1]:3000",
        "localhost",
    ] {
        let response = send(&app.router, request(Method::GET, "/api/export", host)).await;
        assert_eq!(response.status(), StatusCode::OK, "host {host}");
    }
}
#[tokio::test]
async fn standalone_mutations_reject_foreign_origins_without_changing_data() {
    let app = test_app(ServerMode::Standalone);
    let subscription = create_test_subscription(&app.router).await;
    let path = format!(
        "/api/subscriptions/{}",
        subscription["id"].as_str().unwrap()
    );
    let toggle = format!("{path}/toggle");

    for method in [Method::POST, Method::PUT, Method::DELETE, Method::PATCH] {
        let mut mutation = request(method, &toggle, "localhost:3000");
        mutation
            .headers_mut()
            .insert(ORIGIN, HeaderValue::from_static("http://attacker.example"));
        assert_eq!(
            send(&app.router, mutation).await.status(),
            StatusCode::FORBIDDEN
        );
    }
    let unchanged = send(&app.router, request(Method::GET, &path, "localhost:3000")).await;
    assert_eq!(body_json(unchanged).await, subscription);

    for origin in [Some("http://localhost:1430"), None] {
        let mut mutation = request(Method::POST, &toggle, "localhost:3000");
        if let Some(origin) = origin {
            mutation
                .headers_mut()
                .insert(ORIGIN, HeaderValue::from_static(origin));
        }
        let response = send(&app.router, mutation).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(body_json(response).await["is_active"].is_boolean());
    }
}

#[tokio::test]
async fn standalone_non_loopback_accepts_only_bound_ip_and_explicit_hosts() {
    for listener_ip in ["192.168.1.20", "0.0.0.0", "2001:db8::20", "::"] {
        let listener_ip: IpAddr = listener_ip.parse().unwrap();
        let app = test_app_at(
            ServerMode::Standalone,
            listener_ip,
            &["kessai.home", "192.168.1.30", "[2001:db8::30]"],
        );
        let bound_host = match listener_ip {
            IpAddr::V4(ip) => format!("{ip}:3000"),
            IpAddr::V6(ip) => format!("[{ip}]:3000"),
        };
        for host in [
            bound_host.as_str(),
            "kessai.home:3000",
            "KESSAI.HOME",
            "192.168.1.30:8482",
            "[2001:db8::30]:8482",
        ] {
            let response = send(&app.router, request(Method::GET, "/api/export", host)).await;
            assert_eq!(
                response.status(),
                StatusCode::OK,
                "bind {listener_ip}, host {host}"
            );
        }
        for host in [
            "attacker.example:3000",
            "192.168.1.40:3000",
            "localhost:3000",
        ] {
            let response = send(&app.router, request(Method::GET, "/api/export", host)).await;
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "host {host}");
        }
        for origin in [
            format!("http://{bound_host}"),
            "https://kessai.home:8443".to_owned(),
            "http://localhost:1430".to_owned(),
        ] {
            let response = send(
                &app.router,
                json_request(
                    Method::PUT,
                    "/api/settings",
                    "kessai.home",
                    &origin,
                    json!({}),
                ),
            )
            .await;
            assert_eq!(response.status(), StatusCode::OK, "origin {origin}");
        }
        let response = send(
            &app.router,
            json_request(
                Method::PUT,
                "/api/settings",
                "kessai.home",
                "http://attacker.example",
                json!({}),
            ),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}

#[tokio::test]
async fn standalone_rejects_malformed_duplicate_and_conflicting_authorities_and_origins() {
    let app = test_app_at(
        ServerMode::Standalone,
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        &["attacker.example"],
    );
    for host in [
        "attacker.example",
        "localhost.attacker.example:3000",
        "127.0.0.1.attacker.example:3000",
        "user@localhost:3000",
        "localhost:invalid",
        "localhost:65536",
        "localhost:",
        "localhost:3000/path",
        "localhost:3000,localhost:3000",
    ] {
        assert_eq!(
            send(&app.router, request(Method::GET, "/api/export", host))
                .await
                .status(),
            StatusCode::FORBIDDEN,
            "host {host}"
        );
    }
    let mut missing = request(Method::GET, "/api/export", "localhost");
    missing.headers_mut().remove(HOST);
    assert_eq!(
        send(&app.router, missing).await.status(),
        StatusCode::FORBIDDEN
    );

    let mut duplicate = request(Method::GET, "/api/export", "localhost");
    duplicate
        .headers_mut()
        .append(HOST, HeaderValue::from_static("localhost"));
    assert_eq!(
        send(&app.router, duplicate).await.status(),
        StatusCode::FORBIDDEN
    );

    let mut conflicting = request(
        Method::GET,
        "http://attacker.example/api/export",
        "localhost",
    );
    conflicting.headers_mut().insert(
        HeaderName::from_static("x-forwarded-host"),
        HeaderValue::from_static("localhost"),
    );
    assert_eq!(
        send(&app.router, conflicting).await.status(),
        StatusCode::FORBIDDEN
    );

    let mut absolute_uri = request(
        Method::GET,
        "http://localhost:3000/api/export",
        "localhost:3000",
    );
    absolute_uri.headers_mut().remove(HOST);
    assert_eq!(
        send(&app.router, absolute_uri).await.status(),
        StatusCode::OK
    );

    for origin in [
        "null",
        "http://localhost.attacker.example",
        "http://user@localhost",
        "http://localhost:invalid",
        "http://localhost:65536",
        "http://localhost/",
        "http://localhost?query",
        "http://localhost#fragment",
        "http://localhost, http://localhost",
        "file://localhost",
        "https://attacker.example",
    ] {
        let response = send(
            &app.router,
            json_request(Method::PUT, "/api/settings", "localhost", origin, json!({})),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "origin {origin}");
    }
    let mut duplicate = json_request(
        Method::PUT,
        "/api/settings",
        "localhost",
        "http://localhost",
        json!({}),
    );
    duplicate
        .headers_mut()
        .append(ORIGIN, HeaderValue::from_static("http://localhost"));
    assert_eq!(
        send(&app.router, duplicate).await.status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn standalone_rejections_use_html_for_pages_and_json_for_api() {
    let app = test_app(ServerMode::Standalone);
    for method in [Method::GET, Method::HEAD] {
        let response = send(&app.router, request(method, "/", "attacker.example")).await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(response.headers().get(CACHE_CONTROL).unwrap(), "no-store");
        assert_eq!(
            response.headers().get(CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        assert!(response.headers().contains_key(CONTENT_SECURITY_POLICY));
    }
    let response = send(
        &app.router,
        request(Method::GET, "/api/export", "attacker.example"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        body_json(response).await,
        json!({ "error": "Request rejected by the standalone access policy" })
    );
}

#[test]
fn standalone_allowed_hosts_require_hostnames_or_ip_literals_without_ports() {
    for host in [
        "",
        "https://kessai.home",
        "kessai.home:3000",
        "*.home",
        "kessai.home/path",
        "user@kessai.home",
        "kessai.home,attacker.example",
        "-kessai.home",
        "kessai..home",
        "[not-ipv6]",
    ] {
        assert!(
            ServerConfig::standalone("dist")
                .with_allowed_hosts([host])
                .is_err(),
            "host {host}"
        );
    }
    assert!(ServerConfig::standalone("dist")
        .with_allowed_hosts(["localhost", "127.0.0.1", "[::1]", "kessai.home"])
        .is_ok());
}

#[test]
fn private_hosted_config_requires_a_nonempty_key_and_redacts_it_from_debug() {
    let temp = tempfile::tempdir().unwrap();
    assert!(ServerConfig::private_hosted(temp.path(), "").is_err());

    let config = ServerConfig::private_hosted(temp.path(), TEST_ACCESS_KEY).unwrap();
    let debug = format!("{config:?}");
    assert!(debug.contains("[REDACTED]"));
    assert!(!debug.contains(TEST_ACCESS_KEY));
}

#[tokio::test]
async fn unauthenticated_direct_and_tailscale_gets_redirect_to_the_access_page() {
    let app = test_app(ServerMode::PrivateHosted);

    let direct = send(&app.router, request(Method::GET, "/", &direct_host())).await;
    assert_eq!(direct.status(), StatusCode::SEE_OTHER);
    assert_eq!(direct.headers().get(LOCATION).unwrap(), ACCESS_PATH);
    assert_eq!(direct.headers().get(CACHE_CONTROL).unwrap(), "no-store");
    assert!(body_text(direct).await.is_empty());

    let tailscale_response = send(
        &app.router,
        tailscale(request(Method::GET, "/api/export", TAILSCALE_HOST)),
    )
    .await;
    assert_eq!(tailscale_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        tailscale_response.headers().get(LOCATION).unwrap(),
        ACCESS_PATH
    );
    assert!(body_text(tailscale_response).await.is_empty());
}

#[tokio::test]
async fn wrong_key_returns_the_same_no_store_form_with_a_generic_error() {
    let app = test_app(ServerMode::PrivateHosted);
    let response = send(
        &app.router,
        form_request(&direct_host(), &direct_origin(), "wrong-key"),
    )
    .await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(response.headers().get(CACHE_CONTROL).unwrap(), "no-store");
    assert_eq!(
        response.headers().get(CONTENT_TYPE).unwrap(),
        "text/html; charset=utf-8"
    );
    let body = body_text(response).await;
    assert!(body.contains("The access key was not accepted."));
    assert!(body.contains("Kessai"));
    assert!(!body.contains("wrong-key"));
    assert!(!body.contains(TEST_ACCESS_KEY));
}

#[tokio::test]
async fn successful_auth_sets_host_only_cookie_and_redirects() {
    let app = test_app(ServerMode::PrivateHosted);

    let direct = send(
        &app.router,
        form_request(&direct_host(), &direct_origin(), TEST_ACCESS_KEY),
    )
    .await;
    assert_eq!(direct.status(), StatusCode::SEE_OTHER);
    assert_eq!(direct.headers().get(LOCATION).unwrap(), "/");
    let direct_cookie = direct.headers().get(SET_COOKIE).unwrap().to_str().unwrap();
    let (cookie_name, session_token) = direct_cookie
        .split(';')
        .next()
        .unwrap()
        .split_once('=')
        .unwrap();
    assert_eq!(cookie_name, ACCESS_COOKIE);
    assert!(!session_token.is_empty());
    assert_ne!(session_token, TEST_ACCESS_KEY);
    assert!(!direct_cookie.contains(TEST_ACCESS_KEY));
    assert!(direct_cookie.contains("Path=/"));
    assert!(direct_cookie.contains("HttpOnly"));
    assert!(direct_cookie.contains("SameSite=Strict"));
    assert!(direct_cookie.contains("Max-Age=31536000"));
    assert!(!direct_cookie.contains("Domain="));
    assert!(!direct_cookie.contains("Secure"));

    let tailscale_request = tailscale(form_request(
        TAILSCALE_HOST,
        &format!("https://{TAILSCALE_HOST}"),
        TEST_ACCESS_KEY,
    ));
    let tailscale_response = send(&app.router, tailscale_request).await;
    assert_eq!(tailscale_response.status(), StatusCode::SEE_OTHER);
    assert!(tailscale_response
        .headers()
        .get(SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .contains("Secure"));
}
#[tokio::test]
async fn private_session_cannot_be_replayed_after_a_server_restart_or_used_as_the_key() {
    let app = test_app(ServerMode::PrivateHosted);
    let login = send(
        &app.router,
        form_request(&direct_host(), &direct_origin(), TEST_ACCESS_KEY),
    )
    .await;
    assert_eq!(login.status(), StatusCode::SEE_OTHER);
    let cookie = login
        .headers()
        .get(SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap();
    let session_token = cookie.split_once('=').unwrap().1;
    let fresh = test_app(ServerMode::PrivateHosted);
    for (router, expected_status) in [
        (&app.router, StatusCode::OK),
        (&fresh.router, StatusCode::SEE_OTHER),
    ] {
        for path in ["/api/settings", "/"] {
            let mut replay = request(Method::GET, path, &direct_host());
            replay
                .headers_mut()
                .insert(COOKIE, HeaderValue::from_str(cookie).unwrap());
            let response = send(router, replay).await;
            assert_eq!(response.status(), expected_status);
        }
    }
    let wrong_bootstrap = send(
        &fresh.router,
        form_request(&direct_host(), &direct_origin(), session_token),
    )
    .await;
    assert_eq!(wrong_bootstrap.status(), StatusCode::UNAUTHORIZED);

    let mut master_key_cookie = request(Method::GET, "/api/settings", &direct_host());
    master_key_cookie.headers_mut().insert(
        COOKIE,
        HeaderValue::from_str(&format!("{ACCESS_COOKIE}={TEST_ACCESS_KEY}")).unwrap(),
    );
    assert_eq!(
        send(&app.router, master_key_cookie).await.status(),
        StatusCode::SEE_OTHER
    );

    let fresh_login = send(
        &fresh.router,
        form_request(&direct_host(), &direct_origin(), TEST_ACCESS_KEY),
    )
    .await;
    assert_eq!(fresh_login.status(), StatusCode::SEE_OTHER);
    let fresh_cookie = fresh_login
        .headers()
        .get(SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap();
    assert_ne!(cookie, fresh_cookie);
}

#[tokio::test]
async fn authenticated_cookie_allows_api_and_static_content() {
    let app = test_app(ServerMode::PrivateHosted);

    let api = send(
        &app.router,
        authorized(
            &app.router,
            request(Method::GET, "/api/settings", &direct_host()),
        )
        .await,
    )
    .await;
    assert_eq!(api.status(), StatusCode::OK);

    let static_response = send(
        &app.router,
        authorized(&app.router, request(Method::GET, "/", &direct_host())).await,
    )
    .await;
    assert_eq!(static_response.status(), StatusCode::OK);
    assert_eq!(body_text(static_response).await, INDEX_HTML);
}

#[tokio::test]
async fn duplicate_or_nonexact_credential_cookies_are_rejected() {
    let app = test_app(ServerMode::PrivateHosted);
    let cookie = private_session_cookie(&app.router).await;
    let session_token = cookie.split_once('=').unwrap().1;
    let duplicate = Request::builder()
        .method(Method::GET)
        .uri("/api/settings")
        .header(HOST, direct_host())
        .header(COOKIE, format!("{cookie}; {cookie}"))
        .body(Body::empty())
        .unwrap();
    let duplicate_response = send(&app.router, duplicate).await;
    assert_eq!(duplicate_response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        duplicate_response.headers().get(CACHE_CONTROL).unwrap(),
        "no-store"
    );

    for token in [
        format!("prefix{session_token}"),
        format!("{session_token}suffix"),
        format!(" {session_token}"),
        format!("{session_token} "),
    ] {
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/settings")
            .header(HOST, direct_host())
            .header(COOKIE, format!("{ACCESS_COOKIE}={token}"))
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            send(&app.router, request).await.status(),
            StatusCode::SEE_OTHER
        );
    }
}

#[tokio::test]
async fn funnel_is_blocked_before_the_access_form() {
    let app = test_app(ServerMode::PrivateHosted);
    let response = send(
        &app.router,
        request(Method::GET, ACCESS_PATH, TAILSCALE_HOST),
    )
    .await;

    assert_policy_forbidden(response).await;
}

#[tokio::test]
async fn private_auth_post_still_requires_exact_origin() {
    let app = test_app(ServerMode::PrivateHosted);
    let response = send(
        &app.router,
        form_request(
            &direct_host(),
            &format!("http://localhost:{TEST_PORT}"),
            TEST_ACCESS_KEY,
        ),
    )
    .await;
    assert_policy_forbidden(response).await;
}

#[tokio::test]
async fn private_direct_get_and_head_accept_only_canonical_local_authorities() {
    let app = test_app(ServerMode::PrivateHosted);

    for host in [direct_host(), localhost_host()] {
        let response = send(
            &app.router,
            authorized(&app.router, request(Method::GET, "/api/settings", &host)).await,
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK, "host {host}");
    }

    let response = send(
        &app.router,
        authorized(
            &app.router,
            request(Method::HEAD, "/api/settings", &direct_host()),
        )
        .await,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn private_direct_mutation_requires_an_exact_http_origin() {
    let app = test_app(ServerMode::PrivateHosted);
    let host = direct_host();

    let response = send(
        &app.router,
        authorized(
            &app.router,
            json_request(
                Method::PUT,
                "/api/settings",
                &host,
                &direct_origin(),
                json!({}),
            ),
        )
        .await,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let missing_origin = Request::builder()
        .method(Method::PUT)
        .uri("/api/settings")
        .header(HOST, &host)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from("{}"))
        .unwrap();
    assert_policy_forbidden(send(&app.router, missing_origin).await).await;

    let mismatched = json_request(
        Method::PUT,
        "/api/settings",
        &host,
        &format!("http://localhost:{TEST_PORT}"),
        json!({}),
    );
    assert_policy_forbidden(send(&app.router, mismatched).await).await;
}

#[tokio::test]
async fn private_rejects_arbitrary_and_dns_rebinding_hosts() {
    let app = test_app(ServerMode::PrivateHosted);

    for host in [
        format!("192.168.1.20:{TEST_PORT}"),
        format!("127.0.0.1.attacker.example:{TEST_PORT}"),
        format!("localhost.attacker.example:{TEST_PORT}"),
    ] {
        let response = send(&app.router, request(Method::GET, "/api/settings", &host)).await;
        assert_policy_forbidden(response).await;
    }
}

#[tokio::test]
async fn private_rejects_origins_with_the_wrong_scheme() {
    let app = test_app(ServerMode::PrivateHosted);

    let direct = json_request(
        Method::PUT,
        "/api/settings",
        &direct_host(),
        &format!("https://127.0.0.1:{TEST_PORT}"),
        json!({}),
    );
    assert_policy_forbidden(send(&app.router, direct).await).await;

    let mut tailscale = json_request(
        Method::PUT,
        "/api/settings",
        TAILSCALE_HOST,
        &format!("http://{TAILSCALE_HOST}"),
        json!({}),
    );
    tailscale.headers_mut().insert(
        HeaderName::from_static("tailscale-user-login"),
        HeaderValue::from_static("alice@example.com"),
    );
    assert_policy_forbidden(send(&app.router, tailscale).await).await;
}

#[tokio::test]
async fn private_rejects_malformed_comma_separated_and_duplicate_forwarded_hosts() {
    let app = test_app(ServerMode::PrivateHosted);
    let forwarded_name = HeaderName::from_static("x-forwarded-host");

    for forwarded_host in [
        "not a valid authority",
        "kessai.example-tailnet.ts.net/path",
        "one.example.ts.net, two.example.ts.net",
    ] {
        let mut request = request(Method::GET, "/api/settings", &direct_host());
        request.headers_mut().insert(
            forwarded_name.clone(),
            HeaderValue::from_str(forwarded_host).unwrap(),
        );
        let response = send(&app.router, request).await;
        assert_policy_forbidden(response).await;
    }

    let mut duplicate = request(Method::GET, "/api/settings", &direct_host());
    duplicate.headers_mut().append(
        forwarded_name.clone(),
        HeaderValue::from_static(TAILSCALE_HOST),
    );
    duplicate
        .headers_mut()
        .append(forwarded_name, HeaderValue::from_static(TAILSCALE_HOST));
    assert_policy_forbidden(send(&app.router, duplicate).await).await;
}

#[tokio::test]
async fn private_accepts_tailscale_serve_hosts_with_identity() {
    let app = test_app(ServerMode::PrivateHosted);
    let identity_name = HeaderName::from_static("tailscale-user-login");

    let mut public_host = authorized(
        &app.router,
        request(Method::GET, "/api/settings", TAILSCALE_HOST),
    )
    .await;
    public_host.headers_mut().insert(
        identity_name.clone(),
        HeaderValue::from_static("alice@example.com"),
    );
    assert_eq!(
        send(&app.router, public_host).await.status(),
        StatusCode::OK
    );

    let mut forwarded = authorized(
        &app.router,
        request(Method::GET, "/api/settings", &direct_host()),
    )
    .await;
    forwarded.headers_mut().insert(
        HeaderName::from_static("x-forwarded-host"),
        HeaderValue::from_static(TAILSCALE_HOST),
    );
    forwarded.headers_mut().insert(
        identity_name.clone(),
        HeaderValue::from_static("alice@example.com"),
    );
    assert_eq!(send(&app.router, forwarded).await.status(), StatusCode::OK);

    let mut mutation = authorized(
        &app.router,
        json_request(
            Method::PUT,
            "/api/settings",
            &direct_host(),
            &format!("https://{TAILSCALE_HOST}"),
            json!({}),
        ),
    )
    .await;
    mutation.headers_mut().insert(
        HeaderName::from_static("x-forwarded-host"),
        HeaderValue::from_static(TAILSCALE_HOST),
    );
    mutation
        .headers_mut()
        .insert(identity_name, HeaderValue::from_static("alice@example.com"));
    assert_eq!(send(&app.router, mutation).await.status(), StatusCode::OK);
}

#[tokio::test]
async fn private_rejects_tailscale_hosts_without_nonempty_identity() {
    let app = test_app(ServerMode::PrivateHosted);

    let missing = request(Method::GET, "/api/settings", TAILSCALE_HOST);
    assert_policy_forbidden(send(&app.router, missing).await).await;

    let mut empty = request(Method::GET, "/api/settings", TAILSCALE_HOST);
    empty.headers_mut().insert(
        HeaderName::from_static("tailscale-user-login"),
        HeaderValue::from_static("   "),
    );
    assert_policy_forbidden(send(&app.router, empty).await).await;
}

#[tokio::test]
async fn private_rejects_invalid_tailscale_like_hosts() {
    let app = test_app(ServerMode::PrivateHosted);
    let identity_name = HeaderName::from_static("tailscale-user-login");

    for host in [
        "ts.net",
        ".ts.net",
        "kessai.ts.net.attacker.example",
        "-kessai.example.ts.net",
        "kessai..example.ts.net",
        "alice@kessai.example.ts.net",
    ] {
        let mut request = request(Method::GET, "/api/settings", host);
        request.headers_mut().insert(
            identity_name.clone(),
            HeaderValue::from_static("alice@example.com"),
        );
        assert_policy_forbidden(send(&app.router, request).await).await;
    }
}

#[tokio::test]
async fn standalone_and_private_responses_have_security_headers_and_no_cors_grant() {
    let private = test_app(ServerMode::PrivateHosted);
    let standalone = test_app(ServerMode::Standalone);
    let responses = [
        send(
            &private.router,
            authorized(
                &private.router,
                request(Method::GET, "/api/settings", &direct_host()),
            )
            .await,
        )
        .await,
        send(
            &private.router,
            request(Method::GET, "/api/settings", "attacker.example"),
        )
        .await,
        send(
            &standalone.router,
            request(Method::GET, "/api/settings", "localhost"),
        )
        .await,
    ];

    assert_eq!(responses[0].status(), StatusCode::OK);
    assert_eq!(responses[1].status(), StatusCode::FORBIDDEN);
    assert_eq!(responses[2].status(), StatusCode::OK);

    for response in responses {
        assert!(response.headers().contains_key(CONTENT_SECURITY_POLICY));
        assert_eq!(
            response.headers().get(X_CONTENT_TYPE_OPTIONS).unwrap(),
            "nosniff"
        );
        assert_eq!(response.headers().get(X_FRAME_OPTIONS).unwrap(), "DENY");
        assert_eq!(
            response.headers().get(REFERRER_POLICY).unwrap(),
            "no-referrer"
        );
        assert!(response.headers().contains_key("permissions-policy"));
        assert!(!response.headers().contains_key(ACCESS_CONTROL_ALLOW_ORIGIN));
    }
}

#[tokio::test]
async fn unknown_api_paths_return_json_404_instead_of_the_spa() {
    let app = test_app(ServerMode::Standalone);
    let response = send(
        &app.router,
        request(Method::GET, "/api/does-not-exist", "localhost"),
    )
    .await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        response.headers().get(CONTENT_TYPE).unwrap(),
        "application/json"
    );
    assert_eq!(
        body_json(response).await,
        json!({ "error": "API route not found" })
    );
}

#[tokio::test]
async fn private_hosted_import_is_prohibited_but_export_remains_available() {
    let app = test_app(ServerMode::PrivateHosted);

    let response = send(
        &app.router,
        authorized(
            &app.router,
            json_request(
                Method::POST,
                "/api/import",
                &direct_host(),
                &direct_origin(),
                json!({}),
            ),
        )
        .await,
    )
    .await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body = body_json(response).await;
    assert!(body["error"]
        .as_str()
        .unwrap()
        .contains("Stop Private Web Access"));
    assert!(body["error"].as_str().unwrap().contains("desktop app"));

    let export = send(
        &app.router,
        authorized(
            &app.router,
            request(Method::GET, "/api/export", &direct_host()),
        )
        .await,
    )
    .await;
    assert_eq!(export.status(), StatusCode::OK);
}

#[tokio::test]
async fn standalone_import_remains_routed() {
    let app = test_app(ServerMode::Standalone);
    let export = send(
        &app.router,
        request(Method::GET, "/api/export", "localhost"),
    )
    .await;
    assert_eq!(export.status(), StatusCode::OK);
    let backup = body_json(export).await;

    let import = Request::builder()
        .method(Method::POST)
        .uri("/api/import")
        .header(HOST, "localhost")
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "data": backup, "clear_existing": true }).to_string(),
        ))
        .unwrap();
    let response = send(&app.router, import).await;
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn import_accepts_valid_backups_over_two_mib_and_rejects_over_twenty_five_mib() {
    let app = test_app(ServerMode::Standalone);
    let subscription = create_test_subscription(&app.router).await;
    let mut backup = body_json(
        send(
            &app.router,
            request(Method::GET, "/api/export", "localhost"),
        )
        .await,
    )
    .await;
    backup["payments"] = Value::Array(
        (0..5000)
            .map(|index| {
                json!({
                    "id": format!("large-payment-{index}"),
                    "subscription_id": subscription["id"],
                    "amount": 10.0,
                    "paid_at": "2026-10-01T09:00:00Z",
                    "due_date": "2026-10-01",
                    "status": "paid",
                    "notes": "n".repeat(400),
                    "created_at": "2026-10-01T09:00:00Z",
                })
            })
            .collect(),
    );
    let payload = json!({ "data": backup, "clear_existing": true }).to_string();
    assert!(payload.len() > 2 * 1024 * 1024);
    assert!(payload.len() < 25 * 1024 * 1024);
    let response = send(
        &app.router,
        Request::builder()
            .method(Method::POST)
            .uri("/api/import")
            .header(HOST, "localhost")
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(payload))
            .unwrap(),
    )
    .await;
    let status = response.status();
    let result = body_json(response).await;
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["success"], true);
    let exported = body_json(
        send(
            &app.router,
            request(Method::GET, "/api/export", "localhost"),
        )
        .await,
    )
    .await;
    assert_eq!(exported["payments"].as_array().unwrap().len(), 5000);

    let oversized = Request::builder()
        .method(Method::POST)
        .uri("/api/import")
        .header(HOST, "localhost")
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(" ".repeat(25 * 1024 * 1024 + 1)))
        .unwrap();
    let response = send(&app.router, oversized).await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn spa_deep_links_fall_back_to_index_html() {
    let app = test_app(ServerMode::Standalone);
    let response = send(
        &app.router,
        request(Method::GET, "/subscriptions/example", "localhost"),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_text(response).await, INDEX_HTML);
}

#[test]
fn router_validation_reports_how_to_build_a_missing_frontend() {
    let temp = tempfile::tempdir().unwrap();
    let core = KessaiCore::new(&temp.path().join("kessai.db")).unwrap();
    let state = Arc::new(AppState {
        core,
        logos_dir: temp.path().join("logos"),
    });
    let config = ServerConfig::standalone(temp.path().join("missing-dist"));
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), TEST_PORT);

    let error = build_router(state, &config, address)
        .unwrap_err()
        .to_string();
    assert!(error.contains("index.html"));
    assert!(error.contains("pnpm build"));
    assert!(error.contains("--dist-dir"));
}

#[test]
fn private_hosted_router_rejects_non_loopback_policy_configuration() {
    let temp = tempfile::tempdir().unwrap();
    let dist_dir = temp.path().join("dist");
    std::fs::create_dir_all(&dist_dir).unwrap();
    std::fs::write(dist_dir.join("index.html"), INDEX_HTML).unwrap();
    let state = Arc::new(AppState {
        core: KessaiCore::new(&temp.path().join("kessai.db")).unwrap(),
        logos_dir: temp.path().join("logos"),
    });
    let config = ServerConfig::private_hosted(dist_dir, TEST_ACCESS_KEY).unwrap();
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), TEST_PORT);

    let error = build_router(state, &config, address)
        .unwrap_err()
        .to_string();
    assert!(error.contains("requires a loopback listener"));
}

#[tokio::test]
async fn prepared_server_uses_the_prebound_listener_port_and_shuts_down_gracefully() {
    let temp = tempfile::tempdir().unwrap();
    let dist_dir = temp.path().join("dist");
    let logos_dir = temp.path().join("logos");
    std::fs::create_dir_all(&dist_dir).unwrap();
    std::fs::create_dir_all(&logos_dir).unwrap();
    std::fs::write(dist_dir.join("index.html"), INDEX_HTML).unwrap();
    let state = Arc::new(AppState {
        core: KessaiCore::new(&temp.path().join("kessai.db")).unwrap(),
        logos_dir,
    });
    let config = ServerConfig::private_hosted(dist_dir, TEST_ACCESS_KEY).unwrap();
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();
    let prepared = prepare(listener, state, &config).unwrap();
    assert_eq!(prepared.local_addr().unwrap(), address);
    let (shutdown_tx, shutdown_rx) = oneshot::channel();

    let server = tokio::spawn(serve_prepared(prepared, async move {
        let _ = shutdown_rx.await;
    }));

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let login = client
        .post(format!("http://{address}{ACCESS_PATH}"))
        .header(ORIGIN, format!("http://{address}"))
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(format!("access_key={TEST_ACCESS_KEY}"))
        .send()
        .await
        .unwrap();
    assert_eq!(login.status(), StatusCode::SEE_OTHER);
    let cookie = login
        .headers()
        .get(SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap();
    let response = client
        .get(format!("http://{address}/api/settings"))
        .header(COOKIE, cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().contains_key(CONTENT_SECURITY_POLICY));

    shutdown_tx.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(2), server)
        .await
        .expect("server stopped before timeout")
        .expect("server task did not panic")
        .expect("server returned successfully");
}

#[tokio::test]
async fn access_status_reports_all_authenticated_server_modes() {
    let standalone = test_app(ServerMode::Standalone);
    let response = send(
        &standalone.router,
        request(Method::GET, "/api/access/status", "localhost"),
    )
    .await;
    assert_eq!(
        body_json(response).await,
        json!({
            "server_mode": "standalone",
            "connection": "local",
            "tailscale_login": null
        })
    );

    let private = test_app(ServerMode::PrivateHosted);
    let response = send(
        &private.router,
        authorized(
            &private.router,
            tailscale(request(Method::GET, "/api/access/status", TAILSCALE_HOST)),
        )
        .await,
    )
    .await;
    assert_eq!(
        body_json(response).await,
        json!({
            "server_mode": "private_hosted",
            "connection": "tailscale",
            "tailscale_login": "alice@example.com"
        })
    );

    let hosted = test_app(ServerMode::TailscaleHosted);
    let response = send(
        &hosted.router,
        tailscale(request(Method::GET, "/api/access/status", TAILSCALE_HOST)),
    )
    .await;
    assert_eq!(
        body_json(response).await,
        json!({
            "server_mode": "tailscale_hosted",
            "connection": "tailscale",
            "tailscale_login": "alice@example.com"
        })
    );
}

#[tokio::test]
async fn tailscale_hosted_allows_valid_identity_without_cookie_and_canonical_local_access() {
    let app = test_app(ServerMode::TailscaleHosted);

    let remote = send(
        &app.router,
        tailscale(request(Method::GET, "/api/settings", TAILSCALE_HOST)),
    )
    .await;
    assert_eq!(remote.status(), StatusCode::OK);
    assert!(!remote.headers().contains_key(SET_COOKIE));

    let local = send(
        &app.router,
        request(Method::GET, "/api/access/status", &direct_host()),
    )
    .await;
    assert_eq!(local.status(), StatusCode::OK);
    assert_eq!(body_json(local).await["connection"], "local");
}

#[tokio::test]
async fn tailscale_hosted_denies_funnel_empty_and_duplicate_identity() {
    let app = test_app(ServerMode::TailscaleHosted);
    for request in [
        Request::builder()
            .method(Method::GET)
            .uri("/api/settings")
            .body(Body::empty())
            .unwrap(),
        request(Method::GET, "/api/settings", TAILSCALE_HOST),
        {
            let mut request = request(Method::GET, "/api/settings", TAILSCALE_HOST);
            request.headers_mut().insert(
                HeaderName::from_static("tailscale-user-login"),
                HeaderValue::from_static("   "),
            );
            request
        },
        {
            let mut request = request(Method::GET, "/api/settings", TAILSCALE_HOST);
            request.headers_mut().append(
                HeaderName::from_static("tailscale-user-login"),
                HeaderValue::from_static("alice@example.com"),
            );
            request.headers_mut().append(
                HeaderName::from_static("tailscale-user-login"),
                HeaderValue::from_static("alice@example.com"),
            );
            request
        },
    ] {
        let response = send(&app.router, request).await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(response.headers().get(CACHE_CONTROL).unwrap(), "no-store");
        assert_eq!(
            body_json(response).await,
            json!({ "error": "Tailscale access required" })
        );
    }
}

#[tokio::test]
async fn tailscale_hosted_rejection_is_polished_html_for_pages_and_json_for_api() {
    let app = test_app(ServerMode::TailscaleHosted);
    for method in [Method::GET, Method::HEAD] {
        let response = send(
            &app.router,
            request(method.clone(), "/settings", TAILSCALE_HOST),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(response.headers().get(CACHE_CONTROL).unwrap(), "no-store");
        assert_eq!(
            response.headers().get(CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
        if method == Method::GET {
            let body = body_text(response).await;
            assert!(body.contains("ASF / Kessai"));
            assert!(body.contains("Tailscale access required"));
        }
    }

    let response = send(
        &app.router,
        request(Method::GET, "/api/settings", TAILSCALE_HOST),
    )
    .await;
    assert_eq!(
        response.headers().get(CONTENT_TYPE).unwrap(),
        "application/json"
    );
    assert_eq!(
        body_json(response).await,
        json!({ "error": "Tailscale access required" })
    );
}

#[tokio::test]
async fn tailscale_hosted_reuses_strict_authority_and_origin_validation() {
    let app = test_app(ServerMode::TailscaleHosted);
    let forwarded_name = HeaderName::from_static("x-forwarded-host");

    for host in [
        "bad host",
        "kessai.ts.net.attacker.example",
        "one.ts.net, two.ts.net",
    ] {
        let mut malformed = request(Method::GET, "/api/settings", host);
        malformed.headers_mut().insert(
            HeaderName::from_static("tailscale-user-login"),
            HeaderValue::from_static("alice@example.com"),
        );
        assert_eq!(
            send(&app.router, malformed).await.status(),
            StatusCode::FORBIDDEN
        );
    }

    let mut duplicate_forwarded = request(Method::GET, "/api/settings", &direct_host());
    duplicate_forwarded.headers_mut().append(
        forwarded_name.clone(),
        HeaderValue::from_static(TAILSCALE_HOST),
    );
    duplicate_forwarded
        .headers_mut()
        .append(forwarded_name, HeaderValue::from_static(TAILSCALE_HOST));
    duplicate_forwarded = tailscale(duplicate_forwarded);
    assert_eq!(
        send(&app.router, duplicate_forwarded).await.status(),
        StatusCode::FORBIDDEN
    );

    let valid = tailscale(json_request(
        Method::PUT,
        "/api/settings",
        TAILSCALE_HOST,
        &format!("https://{TAILSCALE_HOST}"),
        json!({}),
    ));
    assert_eq!(send(&app.router, valid).await.status(), StatusCode::OK);

    for origin in [
        format!("http://{TAILSCALE_HOST}"),
        format!("https://{TAILSCALE_HOST}.attacker.example"),
    ] {
        let invalid = tailscale(json_request(
            Method::PUT,
            "/api/settings",
            TAILSCALE_HOST,
            &origin,
            json!({}),
        ));
        assert_eq!(
            send(&app.router, invalid).await.status(),
            StatusCode::FORBIDDEN
        );
    }

    let missing_origin = tailscale(
        Request::builder()
            .method(Method::PUT)
            .uri("/api/settings")
            .header(HOST, TAILSCALE_HOST)
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from("{}"))
            .unwrap(),
    );
    assert_eq!(
        send(&app.router, missing_origin).await.status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn tailscale_hosted_health_is_exact_no_data_and_skips_identity() {
    let app = test_app(ServerMode::TailscaleHosted);
    for method in [Method::GET, Method::HEAD] {
        let response = send(
            &app.router,
            request(method, "/__kessai/health", "container-health.invalid"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert!(response.headers().contains_key(CONTENT_SECURITY_POLICY));
        assert!(body_text(response).await.is_empty());
    }

    let near_match = send(
        &app.router,
        request(Method::GET, "/__kessai/health/extra", TAILSCALE_HOST),
    )
    .await;
    assert_eq!(near_match.status(), StatusCode::FORBIDDEN);
    let post = send(
        &app.router,
        request(Method::POST, "/__kessai/health", TAILSCALE_HOST),
    )
    .await;
    assert_eq!(post.status(), StatusCode::FORBIDDEN);
}

#[test]
fn tailscale_hosted_non_loopback_config_requires_explicit_proxy_trust() {
    let temp = tempfile::tempdir().unwrap();
    let dist_dir = temp.path().join("dist");
    std::fs::create_dir_all(&dist_dir).unwrap();
    std::fs::write(dist_dir.join("index.html"), INDEX_HTML).unwrap();
    let state = || {
        Arc::new(AppState {
            core: KessaiCore::new(&temp.path().join("matrix.db")).unwrap(),
            logos_dir: temp.path().join("logos"),
        })
    };
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), TEST_PORT);

    let closed = ServerConfig::tailscale_hosted(&dist_dir, false);
    let error = build_router(state(), &closed, address)
        .unwrap_err()
        .to_string();
    assert!(error.contains("trusted-proxy mode"));

    let trusted = ServerConfig::tailscale_hosted(&dist_dir, true);
    assert!(build_router(state(), &trusted, address).is_ok());
}

#[tokio::test]
async fn non_loopback_trusted_proxy_rejects_direct_and_accepts_tailscale_form() {
    let temp = tempfile::tempdir().unwrap();
    let dist_dir = temp.path().join("dist");
    std::fs::create_dir_all(&dist_dir).unwrap();
    std::fs::write(dist_dir.join("index.html"), INDEX_HTML).unwrap();
    let state = Arc::new(AppState {
        core: KessaiCore::new(&temp.path().join("kessai.db")).unwrap(),
        logos_dir: temp.path().join("logos"),
    });
    let config = ServerConfig::tailscale_hosted(dist_dir, true);
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), TEST_PORT);
    let router = build_router(state, &config, address).unwrap();

    let direct = send(
        &router,
        request(Method::GET, "/api/settings", &direct_host()),
    )
    .await;
    assert_eq!(direct.status(), StatusCode::FORBIDDEN);

    let hosted = send(
        &router,
        tailscale(request(Method::GET, "/api/settings", TAILSCALE_HOST)),
    )
    .await;
    assert_eq!(hosted.status(), StatusCode::OK);

    let mut forwarded = tailscale(request(Method::GET, "/api/settings", "127.0.0.1:8482"));
    forwarded.headers_mut().insert(
        HeaderName::from_static("x-forwarded-host"),
        HeaderValue::from_static(TAILSCALE_HOST),
    );
    assert_eq!(send(&router, forwarded).await.status(), StatusCode::OK);
}

#[tokio::test]
async fn tailscale_hosted_import_remains_available() {
    let app = test_app(ServerMode::TailscaleHosted);
    let backup = body_json(
        send(
            &app.router,
            tailscale(request(Method::GET, "/api/export", TAILSCALE_HOST)),
        )
        .await,
    )
    .await;
    let import = tailscale(json_request(
        Method::POST,
        "/api/import",
        TAILSCALE_HOST,
        &format!("https://{TAILSCALE_HOST}"),
        json!({ "data": backup, "clear_existing": true }),
    ));
    assert_eq!(send(&app.router, import).await.status(), StatusCode::OK);
}

#[tokio::test]
async fn web_logo_save_get_and_file_persistence_use_hardened_webp() {
    let app = test_app(ServerMode::Standalone);
    let body = json!({
        "data": format!("data:image/png;base64,{}", BASE64.encode(tiny_png(2, 2))),
        "subscription_id": "subscription-1"
    });
    let response = send(
        &app.router,
        json_request(
            Method::POST,
            "/api/logos/save",
            "localhost",
            "http://localhost",
            body,
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_json(response).await, json!("subscription-1.webp"));

    let file = std::fs::read(app.logos_dir.join("subscription-1.webp")).unwrap();
    assert_eq!(image::guess_format(&file).unwrap(), ImageFormat::WebP);

    let response = send(
        &app.router,
        request(Method::GET, "/api/logos/subscription-1.webp", "localhost"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let data_url = body_json(response).await.as_str().unwrap().to_owned();
    assert!(data_url.starts_with("data:image/webp;base64,"));
    assert!(!data_url.contains(&app.logos_dir.display().to_string()));
}

#[tokio::test]
async fn web_logo_save_rejects_invalid_data_format_id_size_and_dimensions() {
    let app = test_app(ServerMode::Standalone);
    let cases = [
        json!({ "data": "%%%", "subscription_id": "valid-id" }),
        json!({ "data": BASE64.encode(b"not an image"), "subscription_id": "valid-id" }),
        json!({ "data": format!("data:image/svg+xml;base64,{}", BASE64.encode(b"<svg/>")), "subscription_id": "valid-id" }),
        json!({ "data": BASE64.encode(tiny_png(1, 1)), "subscription_id": "../escape" }),
        json!({ "data": BASE64.encode(vec![0_u8; 5 * 1024 * 1024 + 1]), "subscription_id": "too-large" }),
        json!({ "data": BASE64.encode(tiny_png(4097, 1)), "subscription_id": "too-wide" }),
    ];

    for body in cases {
        let response = send(
            &app.router,
            json_request(
                Method::POST,
                "/api/logos/save",
                "localhost",
                "http://localhost",
                body,
            ),
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let error = body_json(response).await["error"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(!error.contains(&app.logos_dir.display().to_string()));
    }

    let oversized_body = json!({
        "data": "A".repeat(7 * 1024 * 1024),
        "subscription_id": "body-too-large"
    });
    let response = send(
        &app.router,
        json_request(
            Method::POST,
            "/api/logos/save",
            "localhost",
            "http://localhost",
            oversized_body,
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert!(body_json(response).await["error"].is_string());
}

#[tokio::test]
async fn core_validation_not_found_and_conflict_errors_have_typed_json_statuses() {
    let app = test_app(ServerMode::Standalone);
    let invalid = send(
        &app.router,
        json_request(
            Method::PUT,
            "/api/settings",
            "localhost",
            "http://localhost",
            json!({ "monthly_budget": -1 }),
        ),
    )
    .await;
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
    assert!(body_json(invalid).await["error"].is_string());

    let missing = send(
        &app.router,
        request(Method::GET, "/api/subscriptions/missing", "localhost"),
    )
    .await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    assert!(body_json(missing).await["error"].is_string());

    for expected in [StatusCode::CREATED, StatusCode::CONFLICT] {
        let response = send(
            &app.router,
            json_request(
                Method::POST,
                "/api/categories",
                "localhost",
                "http://localhost",
                json!({ "name": "Duplicate category", "color": "#123456", "icon": "tag" }),
            ),
        )
        .await;
        assert_eq!(response.status(), expected);
        if expected == StatusCode::CONFLICT {
            assert!(body_json(response).await["error"].is_string());
        }
    }
}

#[tokio::test]
async fn extractor_failures_preserve_status_and_use_the_json_error_envelope() {
    let app = test_app(ServerMode::Standalone);
    let malformed_json = Request::builder()
        .method(Method::PUT)
        .uri("/api/settings")
        .header(HOST, "localhost")
        .header(ORIGIN, "http://localhost")
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from("{"))
        .unwrap();
    let wrong_type = json_request(
        Method::PUT,
        "/api/settings",
        "localhost",
        "http://localhost",
        json!({ "monthly_budget": "not a number" }),
    );
    for (request, expected) in [
        (malformed_json, StatusCode::BAD_REQUEST),
        (wrong_type, StatusCode::UNPROCESSABLE_ENTITY),
        (
            request(
                Method::GET,
                "/api/payments/calendar/not-a-year/10",
                "localhost",
            ),
            StatusCode::BAD_REQUEST,
        ),
        (
            request(
                Method::GET,
                "/api/price-history/recent?days=invalid",
                "localhost",
            ),
            StatusCode::BAD_REQUEST,
        ),
        (
            request(Method::PUT, "/api/settings", "localhost"),
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
        ),
    ] {
        let response = send(&app.router, request).await;
        assert_eq!(response.status(), expected);
        assert!(body_json(response).await["error"].is_string());
    }
}

#[tokio::test]
async fn subscription_put_records_exactly_one_price_history_change() {
    let app = test_app(ServerMode::Standalone);
    let subscription = create_test_subscription(&app.router).await;
    let id = subscription["id"].as_str().unwrap();
    let response = send(
        &app.router,
        json_request(
            Method::PUT,
            &format!("/api/subscriptions/{id}"),
            "localhost",
            "http://localhost",
            json!({ "amount": 25 }),
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let history = body_json(
        send(
            &app.router,
            request(
                Method::GET,
                &format!("/api/price-history/{id}"),
                "localhost",
            ),
        )
        .await,
    )
    .await;
    assert_eq!(history.as_array().unwrap().len(), 1);
    assert_eq!(history[0]["old_amount"], 10.0);
    assert_eq!(history[0]["new_amount"], 25.0);
}

#[tokio::test]
async fn calendar_route_includes_recorded_payments_and_validates_the_month() {
    let app = test_app(ServerMode::Standalone);
    let subscription = create_test_subscription(&app.router).await;
    let id = subscription["id"].as_str().unwrap();
    let paid = send(
        &app.router,
        json_request(
            Method::POST,
            "/api/payments/mark-paid",
            "localhost",
            "http://localhost",
            json!({ "subscription_id": id, "due_date": "2026-10-01", "amount": 8 }),
        ),
    )
    .await;
    assert_eq!(paid.status(), StatusCode::CREATED);
    let payment = body_json(paid).await;

    let calendar = send(
        &app.router,
        request(Method::GET, "/api/payments/calendar/2026/10", "localhost"),
    )
    .await;
    assert_eq!(calendar.status(), StatusCode::OK);
    let occurrences = body_json(calendar).await;
    let recorded = occurrences
        .as_array()
        .unwrap()
        .iter()
        .find(|occurrence| occurrence["payment"]["id"] == payment["id"])
        .expect("recorded payment occurrence");
    assert_eq!(recorded["subscription_id"], id);
    assert_eq!(recorded["due_date"], "2026-10-01");
    assert_eq!(recorded["projected_amount"], 10.0);
    assert_eq!(recorded["payment"]["amount"], 8.0);
    assert_eq!(recorded["payment"]["status"], "paid");

    let ledger = send(
        &app.router,
        request(Method::GET, "/api/payments/2026/10", "localhost"),
    )
    .await;
    assert_eq!(ledger.status(), StatusCode::OK);
    assert_eq!(body_json(ledger).await[0]["id"], payment["id"]);

    let invalid = send(
        &app.router,
        request(Method::GET, "/api/payments/calendar/2026/13", "localhost"),
    )
    .await;
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
    assert!(body_json(invalid).await["error"].is_string());
}

#[tokio::test(flavor = "current_thread")]
async fn a_sqlite_lock_wait_does_not_stall_concurrent_settings_reads() {
    let app = test_app(ServerMode::Standalone);
    let pool = kessai_core::db::create_pool(&app._temp.path().join("kessai.db")).unwrap();
    let connection = pool.get().unwrap();
    connection.execute_batch("BEGIN IMMEDIATE").unwrap();
    let release = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        connection.execute_batch("ROLLBACK").unwrap();
    });
    let started = std::time::Instant::now();
    let slow = send(
        &app.router,
        json_request(
            Method::PUT,
            "/api/settings",
            "localhost",
            "http://localhost",
            json!({ "monthly_budget": 100 }),
        ),
    );
    let fast = async {
        tokio::time::sleep(Duration::from_millis(10)).await;
        let response = send(
            &app.router,
            request(Method::GET, "/api/settings", "localhost"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            started.elapsed() < Duration::from_millis(100),
            "settings read took {:?}",
            started.elapsed()
        );
    };
    let (written, ()) = tokio::join!(slow, fast);
    assert_eq!(written.status(), StatusCode::OK);
    release.join().unwrap();
}

#[tokio::test]
async fn logo_storage_distinguishes_missing_files_and_real_io_failures_and_caps_reads() {
    let app = test_app(ServerMode::Standalone);
    let missing_delete = send(
        &app.router,
        request(Method::DELETE, "/api/logos/missing.webp", "localhost"),
    )
    .await;
    assert_eq!(missing_delete.status(), StatusCode::NO_CONTENT);
    let missing_read = send(
        &app.router,
        request(Method::GET, "/api/logos/missing.webp", "localhost"),
    )
    .await;
    assert_eq!(missing_read.status(), StatusCode::NOT_FOUND);
    assert!(body_json(missing_read).await["error"].is_string());

    std::fs::create_dir(app.logos_dir.join("directory.webp")).unwrap();
    let io_failure = send(
        &app.router,
        request(Method::DELETE, "/api/logos/directory.webp", "localhost"),
    )
    .await;
    assert_eq!(io_failure.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert!(body_json(io_failure).await["error"].is_string());

    let oversized = std::fs::File::create(app.logos_dir.join("oversized.webp")).unwrap();
    oversized
        .set_len(kessai_web::logo::MAX_STORED_LOGO_BYTES as u64 + 1)
        .unwrap();
    let capped = send(
        &app.router,
        request(Method::GET, "/api/logos/oversized.webp", "localhost"),
    )
    .await;
    assert_eq!(capped.status(), StatusCode::BAD_REQUEST);
    assert!(body_json(capped).await["error"]
        .as_str()
        .unwrap()
        .contains("8 MiB"));
}

#[tokio::test]
async fn deleting_a_default_category_is_a_conflict() {
    let app = test_app(ServerMode::Standalone);
    let response = send(
        &app.router,
        request(Method::DELETE, "/api/categories/cat-streaming", "localhost"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert!(body_json(response).await["error"].is_string());
}

fn with_release_session(mut request: Request<Body>, cookie: Option<&str>) -> Request<Body> {
    if let Some(cookie) = cookie {
        request
            .headers_mut()
            .insert(COOKIE, HeaderValue::from_str(cookie).unwrap());
    }
    request
}

#[tokio::test]
async fn release_http_boundaries_hold_in_standalone_and_private_hosted_modes() {
    for mode in [ServerMode::Standalone, ServerMode::PrivateHosted] {
        let app = test_app(mode);
        let cookie = if mode == ServerMode::PrivateHosted {
            Some(private_session_cookie(&app.router).await)
        } else {
            None
        };
        for path in [
            "/api/payments/calendar/abc/02",
            "/api/payments/calendar/2026/0",
            "/api/payments/calendar/2026/-1",
            "/api/payments/2026/0",
            "/api/payments/2026/13/details",
            "/api/price-history/recent?days=-5",
            "/api/subscriptions/needs-review?days=-5",
            "/api/analytics/monthly?months=100000",
            "/api/analytics/categories?months=100000",
        ] {
            let response = send(
                &app.router,
                with_release_session(
                    request(Method::GET, path, &direct_host()),
                    cookie.as_deref(),
                ),
            )
            .await;
            assert_eq!(
                response.status(),
                StatusCode::BAD_REQUEST,
                "{mode:?} {path}"
            );
            assert!(body_json(response).await["error"].is_string());
        }
        for path in ["/api/payments/calendar/2026/02", "/api/payments/2026/02"] {
            let response = send(
                &app.router,
                with_release_session(
                    request(Method::GET, path, &direct_host()),
                    cookie.as_deref(),
                ),
            )
            .await;
            assert_eq!(response.status(), StatusCode::OK, "{path}");
            assert!(body_json(response).await.is_array());
        }
        let oversized = json_request(
            Method::PUT,
            "/api/settings",
            &direct_host(),
            &direct_origin(),
            json!({"unknown": "x".repeat(2 * 1024 * 1024)}),
        );
        let response = send(
            &app.router,
            with_release_session(oversized, cookie.as_deref()),
        )
        .await;
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
        assert!(body_json(response).await["error"].is_string());
        for (content_type, body, expected) in [
            ("application/json", "{", StatusCode::BAD_REQUEST),
            ("text/plain", "{}", StatusCode::UNSUPPORTED_MEDIA_TYPE),
        ] {
            let req = Request::builder()
                .method(Method::PUT)
                .uri("/api/settings")
                .header(HOST, direct_host())
                .header(ORIGIN, direct_origin())
                .header(CONTENT_TYPE, content_type)
                .body(Body::from(body))
                .unwrap();
            let response = send(&app.router, with_release_session(req, cookie.as_deref())).await;
            assert_eq!(response.status(), expected);
            assert!(body_json(response).await["error"].is_string());
        }
        let head = send(
            &app.router,
            with_release_session(
                request(Method::HEAD, "/api/settings", &direct_host()),
                cookie.as_deref(),
            ),
        )
        .await;
        assert_eq!(head.status(), StatusCode::OK);
        assert!(body_text(head).await.is_empty());
        let mut options_request = request(Method::OPTIONS, "/api/settings", &direct_host());
        options_request
            .headers_mut()
            .insert(ORIGIN, HeaderValue::from_str(&direct_origin()).unwrap());
        let options = send(
            &app.router,
            with_release_session(options_request, cookie.as_deref()),
        )
        .await;
        assert_eq!(options.status(), StatusCode::METHOD_NOT_ALLOWED);
    }
}

/// Unknown patch keys are tolerated for additive client compatibility. Missing
/// nullable keys preserve values; explicit null clears them end-to-end.
#[tokio::test]
async fn release_http_nullable_patches_preserve_missing_and_clear_explicit_null() {
    for mode in [ServerMode::Standalone, ServerMode::PrivateHosted] {
        let app = test_app(mode);
        let cookie = if mode == ServerMode::PrivateHosted {
            Some(private_session_cookie(&app.router).await)
        } else {
            None
        };
        let sub = send(&app.router, with_release_session(json_request(
            Method::POST, "/api/subscriptions", &direct_host(), &direct_origin(),
            json!({"name":"Nullable","amount":0,"currency":"USD","billing_cycle":"monthly"}),
        ), cookie.as_deref())).await;
        assert_eq!(sub.status(), StatusCode::CREATED);
        let sub = body_json(sub).await;
        let card = send(
            &app.router,
            with_release_session(
                json_request(
                    Method::POST,
                    "/api/cards",
                    &direct_host(),
                    &direct_origin(),
                    json!({"name":"QA card","card_type":"credit","credit_limit":50}),
                ),
                cookie.as_deref(),
            ),
        )
        .await;
        assert_eq!(card.status(), StatusCode::CREATED);
        let card = body_json(card).await;
        let payment = send(&app.router, with_release_session(json_request(
            Method::POST, "/api/payments", &direct_host(), &direct_origin(),
            json!({"subscription_id":sub["id"],"amount":0,"due_date":"2026-02-01","paid_at":"2026-02-01T00:00:00Z","notes":"keep"}),
        ), cookie.as_deref())).await;
        assert_eq!(payment.status(), StatusCode::CREATED);
        let payment = body_json(payment).await;
        for (path, field, value) in [
            ("/api/settings".to_string(), "monthly_budget", json!(50.0)),
            (
                format!("/api/cards/{}", card["id"].as_str().unwrap()),
                "credit_limit",
                json!(50.0),
            ),
            (
                format!("/api/payments/{}", payment["id"].as_str().unwrap()),
                "notes",
                json!("keep"),
            ),
        ] {
            for (patch, expected) in [
                (json!({field: value}), value.clone()),
                (json!({"future_compatible_field": true}), value.clone()),
                (json!({field: null}), Value::Null),
            ] {
                let response = send(
                    &app.router,
                    with_release_session(
                        json_request(Method::PUT, &path, &direct_host(), &direct_origin(), patch),
                        cookie.as_deref(),
                    ),
                )
                .await;
                assert_eq!(response.status(), StatusCode::OK, "{path}");
                assert_eq!(body_json(response).await[field], expected, "{path}");
            }
        }
        for (path, field) in [
            ("/api/settings", "monthly_budget"),
            ("/api/cards", "credit_limit"),
            ("/api/payments", "notes"),
        ] {
            let persisted = body_json(
                send(
                    &app.router,
                    with_release_session(
                        request(Method::GET, path, &direct_host()),
                        cookie.as_deref(),
                    ),
                )
                .await,
            )
            .await;
            let row = if persisted.is_array() {
                &persisted[0]
            } else {
                &persisted
            };
            assert!(row[field].is_null(), "{path}");
        }
        let path = format!("/api/subscriptions/{}", sub["id"].as_str().unwrap());
        for expected in [StatusCode::NO_CONTENT, StatusCode::NOT_FOUND] {
            let response = send(
                &app.router,
                with_release_session(
                    json_request(
                        Method::DELETE,
                        &path,
                        &direct_host(),
                        &direct_origin(),
                        json!({}),
                    ),
                    cookie.as_deref(),
                ),
            )
            .await;
            assert_eq!(response.status(), expected);
        }
    }
}

#[tokio::test]
async fn release_ten_concurrent_subscription_puts_commit_complete_field_pairs() {
    for mode in [ServerMode::Standalone, ServerMode::PrivateHosted] {
        let app = test_app(mode);
        let cookie = if mode == ServerMode::PrivateHosted {
            Some(private_session_cookie(&app.router).await)
        } else {
            None
        };
        let response = send(&app.router, with_release_session(json_request(
            Method::POST, "/api/subscriptions", &direct_host(), &direct_origin(),
            json!({"name":"Concurrent","amount":10,"currency":"USD","billing_cycle":"monthly"}),
        ), cookie.as_deref())).await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let sub = body_json(response).await;
        let path = format!("/api/subscriptions/{}", sub["id"].as_str().unwrap());
        let mut requests = tokio::task::JoinSet::new();
        let barrier = Arc::new(tokio::sync::Barrier::new(11));
        for index in 0..10 {
            let router = app.router.clone();
            let req = with_release_session(
                json_request(
                    Method::PUT,
                    &path,
                    &direct_host(),
                    &direct_origin(),
                    json!({"amount":100+index, "notes":format!("writer-{index}"), "unknown":true}),
                ),
                cookie.as_deref(),
            );
            let barrier = barrier.clone();
            requests.spawn(async move {
                barrier.wait().await;
                let response = send(&router, req).await;
                assert_eq!(response.status(), StatusCode::OK);
                let row = body_json(response).await;
                assert_eq!(row["amount"], json!(100.0 + f64::from(index)));
                assert_eq!(row["notes"], format!("writer-{index}"));
            });
        }
        barrier.wait().await;
        while let Some(result) = requests.join_next().await {
            result.unwrap();
        }
        let final_row = body_json(
            send(
                &app.router,
                with_release_session(
                    request(Method::GET, &path, &direct_host()),
                    cookie.as_deref(),
                ),
            )
            .await,
        )
        .await;
        let index = final_row["amount"].as_f64().unwrap() as i32 - 100;
        assert!((0..10).contains(&index));
        assert_eq!(final_row["notes"], format!("writer-{index}"));
    }
}

#[tokio::test]
async fn release_one_pixel_logo_and_traversal_paths_have_explicit_outcomes() {
    for mode in [ServerMode::Standalone, ServerMode::PrivateHosted] {
        let app = test_app(mode);
        let cookie = if mode == ServerMode::PrivateHosted {
            Some(private_session_cookie(&app.router).await)
        } else {
            None
        };
        let response = send(
            &app.router,
            with_release_session(
                json_request(
                    Method::POST,
                    "/api/logos/save",
                    &direct_host(),
                    &direct_origin(),
                    json!({"subscription_id":"one-pixel","data":BASE64.encode(tiny_png(1,1))}),
                ),
                cookie.as_deref(),
            ),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(body_json(response).await, "one-pixel.webp");
        for data in [
            BASE64.encode(tiny_png(4097, 1)),
            BASE64.encode(b"not an image"),
            format!("data:image/svg+xml;base64,{}", BASE64.encode(b"<svg/>")),
        ] {
            let response = send(
                &app.router,
                with_release_session(
                    json_request(
                        Method::POST,
                        "/api/logos/save",
                        &direct_host(),
                        &direct_origin(),
                        json!({"subscription_id":"invalid","data":data}),
                    ),
                    cookie.as_deref(),
                ),
            )
            .await;
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            assert!(body_json(response).await["error"].is_string());
        }
        for path in [
            "/api/logos/..%2fescape.webp",
            "/api/logos/%2e%2e.webp",
            "/api/logos/.hidden.webp",
            "/api/logos/escape%5cfile.webp",
        ] {
            let response = send(
                &app.router,
                with_release_session(
                    request(Method::GET, path, &direct_host()),
                    cookie.as_deref(),
                ),
            )
            .await;
            assert!(
                response.status().is_client_error(),
                "{path}: {}",
                response.status()
            );
        }
    }
}

#[cfg(unix)]
#[tokio::test]
async fn release_unwritable_logo_directory_returns_json_500_without_panicking() {
    use std::os::unix::fs::PermissionsExt;
    for mode in [ServerMode::Standalone, ServerMode::PrivateHosted] {
        let app = test_app(mode);
        let cookie = if mode == ServerMode::PrivateHosted {
            Some(private_session_cookie(&app.router).await)
        } else {
            None
        };
        std::fs::set_permissions(&app.logos_dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        let response = send(
            &app.router,
            with_release_session(
                json_request(
                    Method::POST,
                    "/api/logos/save",
                    &direct_host(),
                    &direct_origin(),
                    json!({"subscription_id":"blocked","data":BASE64.encode(tiny_png(1,1))}),
                ),
                cookie.as_deref(),
            ),
        )
        .await;
        std::fs::set_permissions(&app.logos_dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            body_json(response).await,
            json!({"error":"Logo file operation failed"})
        );
    }
}
