mod routes;

use std::path::PathBuf;
use std::sync::Arc;

use axum::Router;
use clap::Parser;
use subby_core::SubbyCore;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

#[derive(Parser)]
#[command(name = "subby-web", about = "Subby web server", version)]
struct Args {
    /// Port to listen on
    #[arg(short, long, default_value = "3000")]
    port: u16,

    /// Path to SQLite database
    #[arg(long, env = "SUBBY_DB_PATH")]
    db_path: Option<PathBuf>,

    /// Path to frontend dist directory
    #[arg(long, default_value = "dist")]
    dist_dir: String,
}

pub struct AppState {
    pub core: SubbyCore,
}

fn resolve_db_path(cli_path: Option<PathBuf>) -> PathBuf {
    if let Some(path) = cli_path {
        return path;
    }

    if let Some(data_dir) = dirs::data_dir() {
        let app_dir = data_dir.join("com.asf.subby");
        std::fs::create_dir_all(&app_dir).ok();
        return app_dir.join("subby.db");
    }

    PathBuf::from("subby.db")
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let db_path = resolve_db_path(args.db_path.clone());

    // Set up log directory next to the database
    let db_dir = db_path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let logs_dir = db_dir.join("logs");
    std::fs::create_dir_all(&logs_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "subby-web.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            tracing_subscriber::EnvFilter::new("info")
                .add_directive("subby_web=info".parse().unwrap())
                .add_directive("subby_core=debug".parse().unwrap())
                .add_directive("tower_http=debug".parse().unwrap())
        });

    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;

    tracing_subscriber::registry()
        .with(env_filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false)
        )
        .init();

    tracing::info!("Opening database at: {}", db_path.display());
    tracing::info!("Logs directory: {}", logs_dir.display());

    let core = SubbyCore::new(&db_path)?;
    let state = Arc::new(AppState { core });

    let api_routes = routes::api_router(state);

    // Serve static files from dist/, fallback to index.html for SPA routing
    let index_path = format!("{}/index.html", args.dist_dir);
    let spa = ServeDir::new(&args.dist_dir)
        .not_found_service(ServeFile::new(index_path));

    let cors = CorsLayer::permissive();

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback_service(spa)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", args.port);
    tracing::info!("Starting server at http://localhost:{}", args.port);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
