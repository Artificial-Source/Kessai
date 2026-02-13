#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Subby Installer
# ============================================================================
# Installs Subby locally to your home directory. No sudo needed for the app
# itself — only for installing system build dependencies (one-time).
#
# Files installed:
#   ~/.local/bin/subby                              (binary)
#   ~/.local/share/applications/subby.desktop       (desktop entry)
#   ~/.local/share/icons/hicolor/128x128/apps/subby.png  (icon)
#
# To uninstall: ./uninstall.sh
# ============================================================================

VERSION="1.1.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}!${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_dry() { echo -e "${DIM}[dry-run]${NC} $1"; }
print_info() { echo -e "  ${DIM}$1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default options
DRY_RUN=false
INSTALL_APP=false
INSTALL_BOT=false
INTERACTIVE=true

# ============================================================================
# Help
# ============================================================================
show_help() {
    cat << EOF
${BOLD}Subby Installer${NC} v${VERSION}

${BOLD}USAGE:${NC}
    ./install.sh [OPTIONS]

${BOLD}OPTIONS:${NC}
    -h, --help          Show this help message
    -n, --dry-run       Show what would be done without making changes
    --app               Install desktop app only (non-interactive)
    --bot               Install Discord bot only (non-interactive)
    --all               Install both app and bot (non-interactive)

${BOLD}EXAMPLES:${NC}
    ./install.sh                  # Interactive mode (asks what to install)
    ./install.sh --dry-run        # Preview what would happen
    ./install.sh --app            # Install just the desktop app
    ./install.sh --all            # Install everything

${BOLD}WHAT THIS SCRIPT DOES:${NC}
    1. Checks for build tools (pnpm, cargo/rust)
    2. Installs missing Tauri build dependencies (one-time, needs sudo)
    3. Runs 'pnpm install' for Node.js dependencies
    4. Runs 'pnpm tauri build' to compile the app
    5. Copies the binary to ~/.local/bin/subby (no sudo)
    6. Creates desktop menu entry + icon in ~/.local/share (no sudo)

${BOLD}WHEN IS SUDO NEEDED?${NC}
    Only if system build libraries are missing (libwebkit2gtk, etc).
    This is a one-time apt install. The app itself installs entirely
    in your home directory — no sudo required.

${BOLD}FILES CREATED:${NC}
    Desktop app (all in \$HOME, no sudo):
      ~/.local/bin/subby
      ~/.local/share/applications/subby.desktop
      ~/.local/share/icons/hicolor/128x128/apps/subby.png

    Discord bot (optional, requires sudo):
      /usr/local/bin/subby-bot
      /etc/systemd/system/subby-bot@.service

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
        --app)
            INSTALL_APP=true
            INTERACTIVE=false
            shift
            ;;
        --bot)
            INSTALL_BOT=true
            INTERACTIVE=false
            shift
            ;;
        --all)
            INSTALL_APP=true
            INSTALL_BOT=true
            INTERACTIVE=false
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
# Detect distro
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

# ============================================================================
# Banner
# ============================================================================
echo ""
echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║                                                           ║${NC}"
echo -e "${CYAN}${BOLD}║   ${GREEN}███████╗██╗   ██╗██████╗ ██████╗ ██╗   ██╗${CYAN}            ║${NC}"
echo -e "${CYAN}${BOLD}║   ${GREEN}██╔════╝██║   ██║██╔══██╗██╔══██╗╚██╗ ██╔╝${CYAN}            ║${NC}"
echo -e "${CYAN}${BOLD}║   ${GREEN}███████╗██║   ██║██████╔╝██████╔╝ ╚████╔╝${CYAN}             ║${NC}"
echo -e "${CYAN}${BOLD}║   ${GREEN}╚════██║██║   ██║██╔══██╗██╔══██╗  ╚██╔╝${CYAN}              ║${NC}"
echo -e "${CYAN}${BOLD}║   ${GREEN}███████║╚██████╔╝██████╔╝██████╔╝   ██║${CYAN}               ║${NC}"
echo -e "${CYAN}${BOLD}║   ${GREEN}╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝    ╚═╝${CYAN}               ║${NC}"
echo -e "${CYAN}${BOLD}║                                                           ║${NC}"
echo -e "${CYAN}${BOLD}║           Know where your money flows                     ║${NC}"
echo -e "${CYAN}${BOLD}║                                                           ║${NC}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}${BOLD}DRY RUN MODE${NC} - No changes will be made"
    echo ""
fi

# ============================================================================
# Check prerequisites
# ============================================================================
print_step "Checking prerequisites..."

MISSING_DEPS=()

if ! command -v pnpm &> /dev/null; then
    MISSING_DEPS+=("pnpm")
fi

if ! command -v cargo &> /dev/null; then
    MISSING_DEPS+=("rust/cargo")
fi

if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
    print_error "Missing dependencies: ${MISSING_DEPS[*]}"
    echo ""
    echo "Install them with:"
    echo "  pnpm: npm install -g pnpm"
    echo "  rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# Check for Tauri Linux build dependencies
NEEDS_SUDO=false
if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" || "$DISTRO" == "pop" || "$DISTRO" == "linuxmint" ]]; then
    # Determine the right appindicator package.
    # Modern Ubuntu ships libayatana-appindicator3 which conflicts with the old
    # libappindicator3. Pick whichever is already on the system, or prefer ayatana.
    if dpkg -s libayatana-appindicator3-dev &>/dev/null; then
        APPINDICATOR_PKG=""  # already installed
    elif dpkg -s libappindicator3-dev &>/dev/null; then
        APPINDICATOR_PKG=""  # already installed
    elif dpkg -s libayatana-appindicator3-1 &>/dev/null; then
        # Runtime is installed, install matching dev package
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
        NEEDS_SUDO=true
        echo ""
        print_warning "Missing Tauri build libraries: ${MISSING_TAURI_DEPS[*]}"
        print_info "These are system libraries needed to compile Tauri apps."
        print_info "This is the ONLY step that needs sudo (one-time install)."
        print_info "The app itself installs entirely in your home directory."
        echo ""
        if [[ "$DRY_RUN" == "true" ]]; then
            print_dry "Would run: sudo apt update && sudo apt install -y ${MISSING_TAURI_DEPS[*]}"
        else
            print_step "Requesting sudo to install build libraries..."
            sudo -v || { print_error "sudo is required to install build dependencies"; exit 1; }
            # Keep sudo alive through the install
            sudo apt update && sudo apt install -y "${MISSING_TAURI_DEPS[@]}"
            print_success "Build libraries installed"
        fi
        echo ""
    fi
fi

print_success "Prerequisites OK"

# ============================================================================
# Install pnpm dependencies
# ============================================================================
print_step "Installing Node.js dependencies..."
if [[ "$DRY_RUN" == "true" ]]; then
    print_dry "Would run: pnpm install"
else
    cd "$SCRIPT_DIR"
    pnpm install
fi
print_success "Dependencies ready"

# ============================================================================
# Interactive menu (if no flags provided)
# ============================================================================
if [[ "$INTERACTIVE" == "true" ]]; then
    echo ""
    echo -e "${BOLD}What would you like to install?${NC}"
    echo ""
    echo "  1) Subby desktop app only"
    echo "  2) Subby desktop app + Discord bot"
    echo "  3) Discord bot only"
    echo ""
    read -p "Choose [1-3]: " -n 1 -r INSTALL_CHOICE
    echo ""

    case $INSTALL_CHOICE in
        1) INSTALL_APP=true ;;
        2) INSTALL_APP=true; INSTALL_BOT=true ;;
        3) INSTALL_BOT=true ;;
        *) print_error "Invalid choice"; exit 1 ;;
    esac
fi

# ============================================================================
# Build and install Subby app
# ============================================================================
if [[ "$INSTALL_APP" == "true" ]]; then
    echo ""
    print_step "Building Subby desktop app (this may take a few minutes)..."

    if [[ "$DRY_RUN" == "true" ]]; then
        print_dry "Would run: pnpm tauri build"
    else
        cd "$SCRIPT_DIR"
        pnpm tauri build 2>&1 | tail -20
    fi

    # Install locally — no sudo needed
    RELEASE_DIR="$SCRIPT_DIR/src-tauri/target/release"
    ICON_SRC="$SCRIPT_DIR/src-tauri/icons/128x128.png"

    echo ""
    print_step "Installing to ~/.local (no sudo needed)..."
    print_info "Binary:  ~/.local/bin/subby"
    print_info "Desktop: ~/.local/share/applications/subby.desktop"
    print_info "Icon:    ~/.local/share/icons/hicolor/128x128/apps/subby.png"
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        print_dry "Would copy binary to ~/.local/bin/subby"
        print_dry "Would create desktop entry"
        print_dry "Would install icon"
    else
        # Binary
        mkdir -p "$HOME/.local/bin"
        cp "$RELEASE_DIR/subby" "$HOME/.local/bin/subby"
        chmod +x "$HOME/.local/bin/subby"
        print_success "Binary installed"

        # Icon
        ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
        mkdir -p "$ICON_DIR"
        cp "$ICON_SRC" "$ICON_DIR/subby.png"
        print_success "Icon installed"

        # Desktop entry
        mkdir -p "$HOME/.local/share/applications"
        cat > "$HOME/.local/share/applications/subby.desktop" << EOF
[Desktop Entry]
Name=Subby
Comment=Know where your money flows
Exec=$HOME/.local/bin/subby
Icon=subby
Terminal=false
Type=Application
Categories=Finance;Office;
EOF
        print_success "Desktop entry created"

        # Update icon cache if available
        if command -v gtk-update-icon-cache &>/dev/null; then
            gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
        fi

        # Check PATH
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            echo ""
            print_warning "~/.local/bin is not in your PATH"
            print_info "Add this to your shell config (~/.bashrc or ~/.zshrc):"
            print_info "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        fi
    fi

    echo ""
    print_success "Subby desktop app installed!"
fi

# ============================================================================
# Install Discord bot
# ============================================================================
if [[ "$INSTALL_BOT" == "true" ]]; then
    echo ""
    print_step "Setting up Discord bot..."

    if [[ "$DRY_RUN" == "true" ]]; then
        print_dry "Would run: packages/discord-bot/install.sh"
        echo ""
        print_info "The bot installer will:"
        print_info "  - Build a standalone binary"
        print_info "  - Copy it to /usr/local/bin/subby-bot (requires sudo)"
        print_info "  - Ask for your Discord token and user ID"
        print_info "  - Create a systemd service (requires sudo)"
    else
        cd "$SCRIPT_DIR/packages/discord-bot"
        ./install.sh
    fi
fi

# ============================================================================
# Done!
# ============================================================================
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════════╗${NC}"
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${GREEN}${BOLD}║              Dry Run Complete!                            ║${NC}"
else
    echo -e "${GREEN}${BOLD}║              Installation Complete!                       ║${NC}"
fi
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$INSTALL_APP" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} Subby desktop app"
    if [[ "$DRY_RUN" == "false" ]]; then
        echo "    Launch from your app menu or run: subby"
    fi
fi

if [[ "$INSTALL_BOT" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} Discord bot"
    if [[ "$DRY_RUN" == "false" ]]; then
        echo "    Check status: sudo systemctl status subby-bot@$USER"
    fi
fi

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
    echo "Run without --dry-run to actually install."
else
    echo "To uninstall: ./uninstall.sh"
fi
echo ""
