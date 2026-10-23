use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::bail;
use clap::Parser;
use kessai_core::KessaiCore;
use kessai_web::{serve, AppState, ServerConfig};

#[derive(Debug, Parser)]
#[command(name = "kessai-web", about = "Kessai web server", version)]
struct Args {
    /// IP address to listen on
    #[arg(long, default_value = "127.0.0.1")]
    host: IpAddr,

    /// Additional standalone request hostname or IP literal (no scheme or port); repeatable, or comma-separated in the environment. Does not widen loopback listeners.
    #[arg(
        long,
        env = "KESSAI_WEB_ALLOWED_HOSTS",
        value_delimiter = ',',
        conflicts_with = "tailscale_only"
    )]
    allowed_host: Vec<String>,

    /// Port to listen on
    #[arg(short, long, default_value = "3000")]
    port: u16,

    /// Path to SQLite database
    #[arg(long, env = "KESSAI_DB_PATH")]
    db_path: Option<PathBuf>,

    /// Path to frontend dist directory
    #[arg(long, default_value = "dist")]
    dist_dir: PathBuf,

    /// Require Tailscale Serve identity instead of a second login. Every caller able to reach the listener can forge these headers; use only behind loopback-published Tailscale Serve with trusted local workloads.
    #[arg(long, env = "KESSAI_WEB_TAILSCALE_ONLY")]
    tailscale_only: bool,

    /// Trust Tailscale identity headers on a non-loopback listener. Every caller able to reach the listener can forge them; requires --tailscale-only and a loopback-only host publish.
    #[arg(
        long,
        env = "KESSAI_WEB_TRUST_TAILSCALE_PROXY",
        requires = "tailscale_only"
    )]
    trust_tailscale_proxy: bool,
}

fn server_config(args: &Args) -> anyhow::Result<ServerConfig> {
    if args.trust_tailscale_proxy && !args.tailscale_only {
        bail!("--trust-tailscale-proxy requires --tailscale-only");
    }
    if args.tailscale_only && !args.host.is_loopback() && !args.trust_tailscale_proxy {
        bail!(
            "--tailscale-only requires a loopback --host unless --trust-tailscale-proxy is explicitly enabled"
        );
    }

    Ok(if args.tailscale_only {
        ServerConfig::tailscale_hosted(args.dist_dir.clone(), args.trust_tailscale_proxy)
    } else {
        ServerConfig::standalone(args.dist_dir.clone()).with_allowed_hosts(&args.allowed_host)?
    })
}

fn resolve_db_path(cli_path: Option<PathBuf>) -> PathBuf {
    if let Some(path) = cli_path {
        return path;
    }

    if let Some(data_dir) = dirs::data_dir() {
        let app_dir = data_dir.join("com.asf.kessai");
        std::fs::create_dir_all(&app_dir).ok();
        return app_dir.join("kessai.db");
    }

    PathBuf::from("kessai.db")
}

fn warn_missing_allowed_hosts(args: &Args) {
    if !args.tailscale_only && !args.host.is_loopback() && args.allowed_host.is_empty() {
        tracing::warn!(
            "Non-loopback listener has no allowed hosts: requests may be rejected until \
             --allowed-host <hostname-or-IP> is configured (required for wildcard listeners)"
        );
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    // Validate the exposure mode before opening data files or binding a socket.
    let config = server_config(&args)?;
    let db_path = resolve_db_path(args.db_path.clone());

    // Set up log directory next to the database
    let db_dir = db_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    let logs_dir = db_dir.join("logs");
    std::fs::create_dir_all(&logs_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "kessai-web.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        tracing_subscriber::EnvFilter::new("info")
            .add_directive("kessai_web=info".parse().unwrap())
            .add_directive("kessai_core=debug".parse().unwrap())
            .add_directive("tower_http=debug".parse().unwrap())
    });

    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false),
        )
        .init();

    tracing::info!("Opening database at: {}", db_path.display());
    tracing::info!("Logs directory: {}", logs_dir.display());

    let logos_dir = db_dir.join("logos");
    std::fs::create_dir_all(&logos_dir).ok();
    tracing::info!("Logos directory: {}", logos_dir.display());

    let core = KessaiCore::new(&db_path)?;
    let state = Arc::new(AppState { core, logos_dir });

    if args.tailscale_only {
        tracing::warn!(
            "Tailscale-only mode trusts proxy headers: every caller able to reach {}:{} can forge identity. Use only behind loopback-published Tailscale Serve with trusted local workloads; never expose this listener to LAN/public clients.",
            args.host,
            args.port
        );
    } else if !args.host.is_loopback() {
        tracing::warn!(
            "Binding kessai-web to non-loopback address {} exposes its read/write API to reachable networks",
            args.host
        );
    }
    warn_missing_allowed_hosts(&args);

    let addr = SocketAddr::new(args.host, args.port);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let actual_addr = listener.local_addr()?;
    tracing::info!("Starting server at http://{actual_addr}");

    serve(listener, state, config, shutdown_signal()).await
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!("Failed to install shutdown signal handler: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::error::ErrorKind;
    use kessai_web::ServerMode;

    #[test]
    fn standalone_allowed_hosts_are_repeatable_and_comma_delimited() {
        let args = Args::try_parse_from([
            "kessai-web",
            "--host",
            "0.0.0.0",
            "--allowed-host",
            "kessai.home,192.168.1.20",
            "--allowed-host",
            "[2001:db8::20]",
        ])
        .unwrap();
        assert_eq!(
            args.allowed_host,
            ["kessai.home", "192.168.1.20", "[2001:db8::20]"]
        );
        assert_eq!(server_config(&args).unwrap().mode(), ServerMode::Standalone);

        use clap::CommandFactory;
        let command = Args::command();
        let argument = command
            .get_arguments()
            .find(|argument| argument.get_id() == "allowed_host")
            .unwrap();
        assert_eq!(argument.get_env().unwrap(), "KESSAI_WEB_ALLOWED_HOSTS");
        assert_eq!(argument.get_value_delimiter(), Some(','));
    }

    #[test]
    fn standalone_allowed_hosts_fail_closed_for_invalid_values_and_hosted_mode() {
        let args =
            Args::try_parse_from(["kessai-web", "--allowed-host", "https://kessai.home:3000"])
                .unwrap();
        assert!(server_config(&args).is_err());
        let error = Args::try_parse_from([
            "kessai-web",
            "--tailscale-only",
            "--allowed-host",
            "kessai.home",
        ])
        .unwrap_err();
        assert_eq!(error.kind(), ErrorKind::ArgumentConflict);
    }

    #[test]
    fn non_loopback_without_allowed_hosts_warns_about_request_rejection() {
        #[derive(Clone)]
        struct LogWriter(Arc<std::sync::Mutex<Vec<u8>>>);
        impl std::io::Write for LogWriter {
            fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
                self.0.lock().unwrap().extend_from_slice(bytes);
                Ok(bytes.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        for (arguments, expected) in [
            (vec!["kessai-web", "--host", "0.0.0.0"], true),
            (vec!["kessai-web", "--host", "192.168.1.20"], true),
            (vec!["kessai-web"], false),
            (
                vec![
                    "kessai-web",
                    "--host",
                    "0.0.0.0",
                    "--allowed-host",
                    "kessai.home",
                ],
                false,
            ),
        ] {
            let args = Args::try_parse_from(arguments).unwrap();
            let log = Arc::new(std::sync::Mutex::new(Vec::new()));
            let writer = LogWriter(log.clone());
            let subscriber = tracing_subscriber::fmt()
                .without_time()
                .with_ansi(false)
                .with_max_level(tracing::Level::WARN)
                .with_writer(move || writer.clone())
                .finish();
            tracing::subscriber::with_default(subscriber, || warn_missing_allowed_hosts(&args));
            let text = String::from_utf8(log.lock().unwrap().clone()).unwrap();
            assert_eq!(text.contains("--allowed-host"), expected, "{text}");
            if expected {
                assert!(text.contains("WARN"));
                assert!(text.contains("rejected"));
            }
        }
    }

    #[test]
    fn parses_tailscale_flags_and_environment_names() {
        let args = Args::try_parse_from([
            "kessai-web",
            "--tailscale-only",
            "--trust-tailscale-proxy",
            "--host",
            "0.0.0.0",
        ])
        .unwrap();
        assert!(args.tailscale_only);
        assert!(args.trust_tailscale_proxy);
        assert_eq!(
            server_config(&args).unwrap().mode(),
            ServerMode::TailscaleHosted
        );
    }

    #[test]
    fn trust_flag_requires_tailscale_mode() {
        let error = Args::try_parse_from(["kessai-web", "--trust-tailscale-proxy"]).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::MissingRequiredArgument);
    }

    #[test]
    fn tailscale_non_loopback_configuration_fails_closed_without_trust() {
        let args =
            Args::try_parse_from(["kessai-web", "--tailscale-only", "--host", "0.0.0.0"]).unwrap();
        let error = server_config(&args).unwrap_err().to_string();
        assert!(error.contains("requires a loopback"));

        let standalone = Args::try_parse_from(["kessai-web"]).unwrap();
        assert_eq!(
            server_config(&standalone).unwrap().mode(),
            ServerMode::Standalone
        );
    }
}
