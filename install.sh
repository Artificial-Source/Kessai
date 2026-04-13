#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Kessai Installer
# ============================================================================
# Installs Kessai locally to your home directory. No sudo needed for the app
# itself — only for installing system build dependencies (when building from
# source).
#
# Default: Downloads pre-built binary from GitHub Releases (fast, ~10s)
# Fallback: Builds from source if no release available (slower, ~2min)
#
# Files installed:
#   ~/.local/bin/kessai                              (unified launcher)
#   ~/.local/bin/kessai-desktop                      (desktop app)
#   ~/.local/bin/kessai-mcp                          (CLI + MCP server, source installs)
#   ~/.local/bin/kessai-web                          (web server, source installs)
#   ~/.local/share/applications/kessai.desktop       (desktop entry)
#   ~/.local/share/icons/hicolor/128x128/apps/kessai.png  (icon)
#
# To uninstall: ./uninstall.sh
# ============================================================================

VERSION="2.0.0"
GITHUB_REPO="Artificial-Source-Foundation/Kessai"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

print_step() { echo -e "${CYAN}${BOLD}>>${NC} $1"; }
print_success() { echo -e "${GREEN}${BOLD}OK${NC} $1"; }
print_warning() { echo -e "${YELLOW}${BOLD}!!${NC} $1"; }
print_error() { echo -e "${RED}${BOLD}XX${NC} $1"; }
print_dry() { echo -e "${MAGENTA}${BOLD}DRY${NC} $1"; }
print_info() { echo -e "  ${DIM}$1${NC}"; }

print_rule() {
    echo -e "${DIM}────────────────────────────────────────────────────────────${NC}"
}

print_card() {
    local color="$1"
    local title="$2"
    local subtitle="${3:-}"
    local title_pad=$((56 - ${#title}))
    local subtitle_pad=$((56 - ${#subtitle}))

    (( title_pad < 0 )) && title_pad=0
    (( subtitle_pad < 0 )) && subtitle_pad=0

    echo ""
    echo -e "${color}${BOLD}┌──────────────────────────────────────────────────────────┐${NC}"
    printf "%b%s%b\n" "${color}${BOLD}│ ${NC}${BOLD}" "${title}" "${color}${BOLD}$(printf '%*s' "$title_pad" '')│${NC}"
    if [[ -n "$subtitle" ]]; then
        printf "%b%s%b\n" "${color}${BOLD}│ ${NC}${DIM}" "${subtitle}" "${color}${BOLD}$(printf '%*s' "$subtitle_pad" '')│${NC}"
    fi
    echo -e "${color}${BOLD}└──────────────────────────────────────────────────────────┘${NC}"
}

# ============================================================================
# Progress bar
# ============================================================================
BAR_WIDTH=40
PROGRESS_PCT=0
PROGRESS_PHASE=0

phase_name() {
    case "${1:-}" in
        0|1) printf 'Setup' ;;
        2) printf 'Frontend' ;;
        3) printf 'Rust' ;;
        4) printf 'Bundle' ;;
        5) printf 'Install' ;;
        *) printf 'Working' ;;
    esac
}

draw_progress() {
    local pct=$1
    local status="${2:-}"
    local phase="${3:-$PROGRESS_PHASE}"
    if [[ $pct -gt 100 ]]; then pct=100; fi
    PROGRESS_PCT=$pct
    PROGRESS_PHASE=$phase
    local filled=$((pct * BAR_WIDTH / 100))
    local empty=$((BAR_WIDTH - filled))
    local label
    label="$(phase_name "$phase")"

    local bar=""
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=0; i<empty; i++)); do bar+="░"; done

    if [[ ${#status} -gt 40 ]]; then
        status="${status:0:37}..."
    fi

    printf "\r  ${DIM}[%s]${NC} ${CYAN}%s${NC} ${DIM}%3d%%${NC}  %s\033[K" "$label" "$bar" "$pct" "$status" >&2
}

# Trap ctrl-c to clean up and NOT show success
cleanup() {
    jobs -p 2>/dev/null | xargs kill 2>/dev/null || true
    printf "\r\033[K" >&2
    echo ""
    echo ""
    print_error "Installation cancelled."
    rm -f "${TEMP_DIR:-/tmp/kessai-install-$$}"/* 2>/dev/null
    rmdir "${TEMP_DIR:-/tmp/kessai-install-$$}" 2>/dev/null
    rm -f "${BUILD_LOG:-}" "${STATUS_FILE:-}" "${STATUS_FILE:-}.step" "${PROGRESS_FILE:-}" "${COMPILE_FILE:-}" 2>/dev/null
    exit 130
}
trap cleanup INT TERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default options
DRY_RUN=false
FROM_SOURCE=false

# ============================================================================
# Help
# ============================================================================
show_help() {
    cat << EOF
${BOLD}Kessai Installer${NC} v${VERSION}

${BOLD}USAGE:${NC}
    ./install.sh [OPTIONS]

${BOLD}OPTIONS:${NC}
    -h, --help          Show this help message
    -n, --dry-run       Show what would be done without making changes
    -s, --from-source   Build from source instead of downloading pre-built binary

${BOLD}EXAMPLES:${NC}
    ./install.sh                  # Download & install pre-built binary (fast)
    ./install.sh --from-source    # Build from source (requires pnpm + rust)
    ./install.sh --dry-run        # Preview what would happen

${BOLD}WHAT THIS SCRIPT DOES:${NC}
    Default (pre-built):
      1. Downloads the latest release from GitHub
      2. Extracts the desktop app to ~/.local/bin/kessai-desktop
      3. Installs a unified ~/.local/bin/kessai launcher
      4. Creates desktop menu entry + icon

    From source (--from-source):
      1. Checks for build tools (pnpm, cargo/rust)
      2. Installs missing Tauri build dependencies (one-time, needs sudo)
      3. Builds the app with 'pnpm tauri build'
      4. Copies the desktop app to ~/.local/bin/kessai-desktop
      5. Copies kessai-mcp and kessai-web to ~/.local/bin/
      6. Installs a unified ~/.local/bin/kessai launcher
      7. Creates desktop menu entry + icon

${BOLD}SUPPORTED DISTROS:${NC}
    Ubuntu, Debian, Pop!_OS, Linux Mint (apt)
    Fedora, RHEL, CentOS, Nobara (dnf)

${BOLD}FILES CREATED:${NC}
    Desktop app (all in \$HOME, no sudo):
      ~/.local/bin/kessai
      ~/.local/bin/kessai-desktop
      ~/.local/bin/kessai-mcp
      ~/.local/bin/kessai-web
      ~/.local/share/applications/kessai.desktop
      ~/.local/share/icons/hicolor/128x128/apps/kessai.png

${BOLD}TO UNINSTALL:${NC}
    ./uninstall.sh

EOF
}

# ============================================================================
# Parse arguments
# ============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -s|--from-source)
            FROM_SOURCE=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Run './install.sh --help' for usage."
            exit 1
            ;;
    esac
done

# ============================================================================
# Detect distro & architecture
# ============================================================================
detect_distro() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "$ID"
    else
        echo "unknown"
    fi
}

DISTRO=$(detect_distro)
ARCH=$(uname -m)

# ============================================================================
# Confirm prompt
# ============================================================================
confirm() {
    local prompt="$1"
    local reply
    echo -ne "${YELLOW}?${NC} ${prompt} ${DIM}[Y/n]${NC} "
    read -r reply
    [[ -z "$reply" || "$reply" =~ ^[Yy]$ ]]
}

# ============================================================================
# Banner
# ============================================================================
print_card "${CYAN}" "KESSAI" "Know where your money flows"
if [[ "$FROM_SOURCE" == "true" ]]; then
    print_info "Mode: source install with desktop + CLI + MCP + web"
else
    print_info "Mode: release install with desktop launcher"
fi
print_rule

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "Dry run only. No files will be changed."
    print_rule
fi

# ============================================================================
# Pre-built binary download (default fast path)
# ============================================================================
BINARY_PATH=""
ICON_SRC=""
BUILD_LOG=""
STATUS_FILE=""
PROGRESS_FILE=""
COMPILE_FILE=""

try_download_binary() {
    # Determine the right asset name for this platform
    local asset_name=""
    case "$ARCH" in
        x86_64)  asset_name="Kessai_amd64.AppImage" ;;
        aarch64) asset_name="Kessai_aarch64.AppImage" ;;
        *)
            print_warning "No pre-built binary for architecture: $ARCH"
            return 1
            ;;
    esac

    # Need curl or wget
    local downloader=""
    if command -v curl &>/dev/null; then
        downloader="curl"
    elif command -v wget &>/dev/null; then
        downloader="wget"
    else
        print_warning "Neither curl nor wget found, cannot download"
        return 1
    fi

    draw_progress 5 "Fetching latest release info..."

    # Get the latest release tag from GitHub API
    local api_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    local release_json=""
    if [[ "$downloader" == "curl" ]]; then
        release_json=$(curl -sL "$api_url" 2>/dev/null) || return 1
    else
        release_json=$(wget -qO- "$api_url" 2>/dev/null) || return 1
    fi

    # Extract tag name and asset download URL
    local tag_name
    tag_name=$(echo "$release_json" | grep -oP '"tag_name"\s*:\s*"\K[^"]+' 2>/dev/null) || return 1
    if [[ -z "$tag_name" ]]; then
        return 1
    fi

    draw_progress 10 "Found release ${tag_name}"

    # Find the matching asset URL — match by name pattern (version-agnostic)
    local download_url
    # Try AppImage first (portable, no extraction needed)
    download_url=$(echo "$release_json" | grep -oP '"browser_download_url"\s*:\s*"\K[^"]*'"${ARCH/x86_64/amd64}"'\.AppImage(?=")' 2>/dev/null | head -1) || true

    # If no AppImage, try .tar.gz
    if [[ -z "$download_url" ]]; then
        download_url=$(echo "$release_json" | grep -oP '"browser_download_url"\s*:\s*"\K[^"]*'"${ARCH/x86_64/amd64}"'\.tar\.gz(?=")' 2>/dev/null | head -1) || true
    fi

    # If no .tar.gz, try .deb
    if [[ -z "$download_url" ]]; then
        download_url=$(echo "$release_json" | grep -oP '"browser_download_url"\s*:\s*"\K[^"]*'"${ARCH/x86_64/amd64}"'\.deb(?=")' 2>/dev/null | head -1) || true
    fi

    if [[ -z "$download_url" ]]; then
        print_warning "No matching binary found in release ${tag_name}"
        return 1
    fi

    local filename
    filename=$(basename "$download_url")
    draw_progress 15 "Downloading ${filename}..."

    # Download to temp directory
    TEMP_DIR=$(mktemp -d)
    local download_path="${TEMP_DIR}/${filename}"

    if [[ "$downloader" == "curl" ]]; then
        # Use curl with progress, parse for our bar
        curl -L --progress-bar "$download_url" -o "$download_path" 2>&1 | while IFS= read -r line; do
            # curl progress-bar outputs ### patterns
            if [[ "$line" =~ ([0-9]+)\.[0-9]% ]]; then
                local dl_pct=${BASH_REMATCH[1]}
                # Map download 0-100 to our 15-85 range
                local mapped=$((15 + dl_pct * 70 / 100))
                draw_progress "$mapped" "Downloading ${filename}..."
            fi
        done
    else
        wget --progress=dot:mega "$download_url" -O "$download_path" 2>&1 | while IFS= read -r line; do
            if [[ "$line" =~ ([0-9]+)% ]]; then
                local dl_pct=${BASH_REMATCH[1]}
                local mapped=$((15 + dl_pct * 70 / 100))
                draw_progress "$mapped" "Downloading ${filename}..."
            fi
        done
    fi

    if [[ ! -f "$download_path" || ! -s "$download_path" ]]; then
        rm -rf "$TEMP_DIR"
        return 1
    fi

    draw_progress 85 "Extracting..."

    # Handle different formats
    if [[ "$filename" == *.AppImage ]]; then
        chmod +x "$download_path"
        BINARY_PATH="$download_path"
        BINARY_IS_APPIMAGE=true
    elif [[ "$filename" == *.tar.gz ]]; then
        tar -xzf "$download_path" -C "$TEMP_DIR" 2>/dev/null || return 1
        # Find the binary
        local found_bin
        found_bin=$(find "$TEMP_DIR" \( -name "kessai" -o -name "Kessai" \) -type f -perm -u+x 2>/dev/null | head -1) || true
        if [[ -z "$found_bin" ]]; then
            found_bin=$(find "$TEMP_DIR" -name "kessai" -type f 2>/dev/null | head -1) || true
        fi
        if [[ -z "$found_bin" ]]; then
            rm -rf "$TEMP_DIR"
            return 1
        fi
        BINARY_PATH="$found_bin"
        BINARY_IS_APPIMAGE=false
    elif [[ "$filename" == *.deb ]]; then
        # Extract binary from .deb without installing
        local deb_extract="${TEMP_DIR}/deb_extract"
        mkdir -p "$deb_extract"
        dpkg-deb -x "$download_path" "$deb_extract" 2>/dev/null || return 1
        local found_bin
        found_bin=$(find "$deb_extract" -name "kessai" -type f 2>/dev/null | head -1) || true
        if [[ -z "$found_bin" ]]; then
            rm -rf "$TEMP_DIR"
            return 1
        fi
        BINARY_PATH="$found_bin"
        BINARY_IS_APPIMAGE=false
        # Also try to grab the icon from the deb
        local found_icon
        found_icon=$(find "$deb_extract" -name "*.png" -path "*/128*" 2>/dev/null | head -1) || true
        if [[ -n "$found_icon" ]]; then
            ICON_SRC="$found_icon"
        fi
    fi

    draw_progress 90 "Binary ready"
    return 0
}

if [[ "$FROM_SOURCE" == "false" ]]; then
    draw_progress 0 "Checking for pre-built release..."

    if [[ "$DRY_RUN" == "true" ]]; then
        printf "\r\033[K" >&2
        print_dry "Would download latest release from GitHub"
        print_dry "Would install desktop app to ~/.local/bin/kessai-desktop"
        print_dry "Would install ~/.local/bin/kessai launcher"
    else
        if try_download_binary; then
            printf "\r\033[K" >&2
            print_success "Downloaded pre-built binary"
        else
            printf "\r\033[K" >&2
            print_warning "No pre-built release available, falling back to build from source..."
            echo ""
            FROM_SOURCE=true
        fi
    fi
fi

# ============================================================================
# Source build path (--from-source or fallback)
# ============================================================================
if [[ "$FROM_SOURCE" == "true" && -z "$BINARY_PATH" ]]; then

    # ── Check prerequisites ────────────────────────────────────────────────
    draw_progress 0 "Checking prerequisites..."

    # Source cargo env if rustup is installed but cargo isn't in PATH yet
    if ! command -v cargo &> /dev/null && [[ -f "$HOME/.cargo/env" ]]; then
        source "$HOME/.cargo/env"
    fi

    MISSING_DEPS=()
    if ! command -v pnpm &> /dev/null; then MISSING_DEPS+=("pnpm"); fi
    if ! command -v cargo &> /dev/null; then MISSING_DEPS+=("rust/cargo"); fi

    if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
        printf "\r\033[K" >&2
        print_error "Missing dependencies: ${MISSING_DEPS[*]}"
        echo ""
        echo "Install them with:"
        echo "  pnpm: npm install -g pnpm"
        echo "  rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi

    # Check for Tauri Linux build dependencies
    if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" || "$DISTRO" == "pop" || "$DISTRO" == "linuxmint" ]]; then
        if dpkg -s libayatana-appindicator3-dev &>/dev/null; then
            APPINDICATOR_PKG=""
        elif dpkg -s libappindicator3-dev &>/dev/null; then
            APPINDICATOR_PKG=""
        elif dpkg -s libayatana-appindicator3-1 &>/dev/null; then
            APPINDICATOR_PKG="libayatana-appindicator3-dev"
        else
            APPINDICATOR_PKG="libayatana-appindicator3-dev"
        fi
        TAURI_DEPS="libwebkit2gtk-4.1-dev librsvg2-dev patchelf"
        [[ -n "$APPINDICATOR_PKG" ]] && TAURI_DEPS="$TAURI_DEPS $APPINDICATOR_PKG"
        MISSING_TAURI_DEPS=()
        for dep in $TAURI_DEPS; do
            if ! dpkg -s "$dep" &>/dev/null; then
                MISSING_TAURI_DEPS+=("$dep")
            fi
        done
        if [[ ${#MISSING_TAURI_DEPS[@]} -gt 0 ]]; then
            printf "\r\033[K" >&2
            print_warning "Missing Tauri build libraries: ${MISSING_TAURI_DEPS[*]}"
            print_info "These are system libraries needed to compile Tauri apps."
            print_info "This is the ONLY step that needs sudo (one-time install)."
            echo ""
            if [[ "$DRY_RUN" == "true" ]]; then
                print_dry "Would run: sudo apt update && sudo apt install -y ${MISSING_TAURI_DEPS[*]}"
            else
                if confirm "Install them now? (requires sudo)"; then
                    sudo apt update && sudo apt install -y "${MISSING_TAURI_DEPS[@]}"
                    print_success "Build libraries installed"
                else
                    print_info "Install manually: sudo apt install -y ${MISSING_TAURI_DEPS[*]}"
                    exit 1
                fi
            fi
            echo ""
        fi
    elif [[ "$DISTRO" == "fedora" || "$DISTRO" == "rhel" || "$DISTRO" == "centos" || "$DISTRO" == "nobara" ]]; then
        TAURI_DEPS="webkit2gtk4.1-devel librsvg2-devel patchelf libappindicator-gtk3-devel gtk3-devel openssl-devel"
        MISSING_TAURI_DEPS=()
        for dep in $TAURI_DEPS; do
            if ! rpm -q "$dep" &>/dev/null; then
                MISSING_TAURI_DEPS+=("$dep")
            fi
        done
        if [[ ${#MISSING_TAURI_DEPS[@]} -gt 0 ]]; then
            printf "\r\033[K" >&2
            print_warning "Missing Tauri build libraries: ${MISSING_TAURI_DEPS[*]}"
            print_info "These are system libraries needed to compile Tauri apps."
            print_info "This is the ONLY step that needs sudo (one-time install)."
            echo ""
            if [[ "$DRY_RUN" == "true" ]]; then
                print_dry "Would run: sudo dnf install -y ${MISSING_TAURI_DEPS[*]}"
            else
                if confirm "Install them now? (requires sudo)"; then
                    sudo dnf install -y "${MISSING_TAURI_DEPS[@]}"
                    print_success "Build libraries installed"
                else
                    print_info "Install manually: sudo dnf install -y ${MISSING_TAURI_DEPS[*]}"
                    exit 1
                fi
            fi
            echo ""
        fi
    fi

    printf "\r\033[K" >&2
    print_success "Prerequisites OK"

    # ── Install pnpm dependencies ──────────────────────────────────────────
    if [[ "$DRY_RUN" == "true" ]]; then
        print_dry "Would run: pnpm install"
    else
        draw_progress 3 "Installing Node.js dependencies..."
        cd "$SCRIPT_DIR"
        pnpm install --silent 2>&1 | while IFS= read -r _line; do true; done
        printf "\r\033[K" >&2
    fi
    print_success "Dependencies ready"
    echo ""

    # ── Build Kessai ────────────────────────────────────────────────────────
    if [[ "$DRY_RUN" == "true" ]]; then
        print_dry "Would run: pnpm tauri build"
    else
        cd "$SCRIPT_DIR"
        BUILD_LOG=$(mktemp)
        STATUS_FILE=$(mktemp)
        PROGRESS_FILE=$(mktemp)
        COMPILE_FILE=$(mktemp)
        rm -f "$SCRIPT_DIR/target/release/kessai"
        echo "0" > "$PROGRESS_FILE"
        echo "0" > "$COMPILE_FILE"
        echo "starting..." > "$STATUS_FILE"
        echo "2" > "${STATUS_FILE}.step"

        ESTIMATED_CRATES=680

        # Background progress bar renderer
        (
            while [[ -f "$STATUS_FILE" ]]; do
                status=$(cat "$STATUS_FILE" 2>/dev/null || echo "building...")
                inner=$(cat "$PROGRESS_FILE" 2>/dev/null || echo "0")
                local_step=$(cat "${STATUS_FILE}.step" 2>/dev/null || echo "2")
                case $local_step in
                    2) completed_w=5 ; step_w=5 ;;   # frontend
                    3) completed_w=10; step_w=80 ;;   # rust compile
                    4) completed_w=90; step_w=5 ;;    # bundling
                    *) completed_w=0 ; step_w=5 ;;
                esac
                inner_frac=$((step_w * inner / 100))
                pct=$(( (completed_w + inner_frac) * 100 / 100 ))
                [[ $pct -gt 100 ]] && pct=100
                filled=$((pct * BAR_WIDTH / 100))
                empty=$((BAR_WIDTH - filled))
                bar=""
                for ((i=0; i<filled; i++)); do bar+="█"; done
                for ((i=0; i<empty; i++)); do bar+="░"; done
                display="$status"
                label="$(phase_name "$local_step")"
                if [[ ${#display} -gt 40 ]]; then display="${display:0:37}..."; fi
                printf "\r  \033[2m[%s]\033[0m \033[0;36m%s\033[0m \033[2m%3d%%\033[0m  %s\033[K" "$label" "$bar" "$pct" "$display" >&2
                sleep 0.15
            done
        ) &
        SPINNER_PID=$!

        if ! pnpm tauri build 2>&1 | while IFS= read -r line; do
            echo "$line" >> "$BUILD_LOG"
            if [[ "$line" =~ transforming ]]; then
                echo "2" > "${STATUS_FILE}.step"
                echo "50" > "$PROGRESS_FILE"
                echo "Vite: transforming modules..." > "$STATUS_FILE"
            elif [[ "$line" =~ "rendering chunks" ]]; then
                echo "80" > "$PROGRESS_FILE"
                echo "Vite: rendering chunks..." > "$STATUS_FILE"
            elif [[ "$line" =~ "built in" ]]; then
                echo "100" > "$PROGRESS_FILE"
                echo "Frontend built" > "$STATUS_FILE"
            elif [[ "$line" =~ Compiling[[:space:]]+([^ ]+) ]]; then
                echo "3" > "${STATUS_FILE}.step"
                count=$(cat "$COMPILE_FILE" 2>/dev/null || echo "0")
                count=$((count + 1))
                echo "$count" > "$COMPILE_FILE"
                pct=$((count * 100 / ESTIMATED_CRATES))
                [[ $pct -gt 99 ]] && pct=99
                echo "$pct" > "$PROGRESS_FILE"
                echo "Compiling ${BASH_REMATCH[1]}..." > "$STATUS_FILE"
            elif [[ "$line" =~ Finished.*release ]]; then
                echo "4" > "${STATUS_FILE}.step"
                echo "0" > "$PROGRESS_FILE"
                echo "Creating packages..." > "$STATUS_FILE"
            elif [[ "$line" =~ Bundling[[:space:]]+(.+)\( ]]; then
                echo "4" > "${STATUS_FILE}.step"
                echo "50" > "$PROGRESS_FILE"
                echo "Bundling ${BASH_REMATCH[1]}" > "$STATUS_FILE"
            elif [[ "$line" =~ "Finished".*"bundles" ]]; then
                echo "100" > "$PROGRESS_FILE"
                echo "Bundles complete" > "$STATUS_FILE"
            fi
        done; then
            rm -f "$STATUS_FILE" "${STATUS_FILE}.step" "$PROGRESS_FILE" "$COMPILE_FILE"
            wait "$SPINNER_PID" 2>/dev/null || true
            printf "\r\033[K" >&2
            echo ""
            print_error "Build failed! Last 20 lines:"
            tail -20 "$BUILD_LOG"
            rm -f "$BUILD_LOG"
            exit 1
        fi

        rm -f "$STATUS_FILE" "${STATUS_FILE}.step" "$PROGRESS_FILE" "$COMPILE_FILE"
        wait "$SPINNER_PID" 2>/dev/null || true
        printf "\r\033[K" >&2

        if [[ ! -f "$SCRIPT_DIR/target/release/kessai" ]]; then
            echo ""
            print_error "Build failed! Last 20 lines:"
            tail -20 "$BUILD_LOG"
            rm -f "$BUILD_LOG"
            exit 1
        fi
        rm -f "$BUILD_LOG"
        draw_progress 92 "Building Kessai CLI tools..." 3
        cargo build --release -p kessai-mcp -p kessai-web 2>&1 | while IFS= read -r _line; do true; done

        bundled_appimage=$(find "$SCRIPT_DIR/src-tauri/target/release/bundle" -name "*.AppImage" -type f 2>/dev/null | head -1) || true
        if [[ -n "$bundled_appimage" ]]; then
            BINARY_PATH="$bundled_appimage"
            BINARY_IS_APPIMAGE=true
        else
            BINARY_PATH="$SCRIPT_DIR/target/release/kessai"
            BINARY_IS_APPIMAGE=false
        fi
    fi

    print_success "Build complete"
fi

# ============================================================================
# Install to ~/.local
# ============================================================================
# Icon source: prefer transparent desktop asset, then fall back to Tauri icon.
if [[ -z "$ICON_SRC" && -f "$SCRIPT_DIR/public/icon-transparent.png" ]]; then
    ICON_SRC="$SCRIPT_DIR/public/icon-transparent.png"
elif [[ -z "$ICON_SRC" && -f "$SCRIPT_DIR/src-tauri/icons/128x128.png" ]]; then
    ICON_SRC="$SCRIPT_DIR/src-tauri/icons/128x128.png"
fi

echo ""
print_step "Installing to ~/.local (no sudo needed)..."

if [[ "$DRY_RUN" == "true" ]]; then
    print_dry "Would copy desktop app to ~/.local/bin/kessai-desktop"
    print_dry "Would install ~/.local/bin/kessai launcher"
    if [[ "$FROM_SOURCE" == "true" ]]; then
        print_dry "Would copy kessai-mcp and kessai-web to ~/.local/bin/"
    fi
    print_dry "Would create desktop entry"
    print_dry "Would install icon"
else
    draw_progress 92 "Installing binaries..." 5

    mkdir -p "$HOME/.local/bin"
    if [[ "${BINARY_IS_APPIMAGE:-false}" == "true" ]]; then
        cp "$BINARY_PATH" "$HOME/.local/bin/kessai-desktop"
    else
        cp "$BINARY_PATH" "$HOME/.local/bin/kessai-desktop"
    fi
    chmod +x "$HOME/.local/bin/kessai-desktop"

    cp "$SCRIPT_DIR/scripts/kessai" "$HOME/.local/bin/kessai"
    chmod +x "$HOME/.local/bin/kessai"

    if [[ "$FROM_SOURCE" == "true" ]]; then
        cp "$SCRIPT_DIR/target/release/kessai-mcp" "$HOME/.local/bin/kessai-mcp"
        cp "$SCRIPT_DIR/target/release/kessai-web" "$HOME/.local/bin/kessai-web"
        chmod +x "$HOME/.local/bin/kessai-mcp" "$HOME/.local/bin/kessai-web"
    fi

    draw_progress 95 "Installing icon..." 5

    # Icon
    ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
    mkdir -p "$ICON_DIR"
    if [[ -n "$ICON_SRC" && -f "$ICON_SRC" ]]; then
        cp "$ICON_SRC" "$ICON_DIR/kessai.png"
    fi

    draw_progress 97 "Creating desktop entry..." 5

    # Desktop entry
    mkdir -p "$HOME/.local/share/applications"
    rm -f "$HOME/.local/share/applications/Kessai.desktop"
    cat > "$HOME/.local/share/applications/kessai.desktop" << EOF
[Desktop Entry]
Name=Kessai
Comment=Know where your money flows
Exec=$HOME/.local/bin/kessai
Icon=kessai
Terminal=false
Type=Application
Categories=Finance;Office;
EOF

    # Update icon cache if available
    if command -v gtk-update-icon-cache &>/dev/null; then
        gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
    fi

    draw_progress 100 "Done!" 5
    printf "\r\033[K" >&2

    print_success "Launcher installed"
    print_success "Desktop app installed"
    if [[ "$FROM_SOURCE" == "true" ]]; then
        print_success "CLI tools installed"
    fi
    print_success "Desktop entry created"

    # Check PATH
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo ""
        print_warning "~/.local/bin is not in your PATH"
        print_info "Add this to your shell config (~/.bashrc or ~/.zshrc):"
        print_info "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
fi

# Clean up temp dir
rm -rf "${TEMP_DIR:-}" 2>/dev/null

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
    print_success "Kessai preview generated"
else
    print_success "Kessai installed!"
fi

# ============================================================================
# Done!
# ============================================================================
if [[ "$DRY_RUN" == "true" ]]; then
    print_card "${MAGENTA}" "Dry Run Complete" "Preview finished successfully"
else
    print_card "${GREEN}" "Installation Complete" "Kessai is ready to use"
fi

echo -e "  ${GREEN}✓${NC} Kessai launcher: kessai"
echo -e "  ${GREEN}✓${NC} Kessai desktop app: kessai-desktop"
if [[ "$FROM_SOURCE" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} Kessai CLI/MCP: kessai-mcp"
    echo -e "  ${GREEN}✓${NC} Kessai web server: kessai-web"
fi
if [[ "$DRY_RUN" == "false" ]]; then
    if [[ "$FROM_SOURCE" == "true" ]]; then
        echo "    Run 'kessai' to open the app, 'kessai list' for CLI, or 'kessai mcp' for MCP"
    else
        echo "    Run 'kessai' to open the app"
    fi
fi

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
    echo "Run without --dry-run to actually install."
else
    echo "To uninstall: ./uninstall.sh"
fi
print_rule
echo ""
