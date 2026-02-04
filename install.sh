#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Subby Installer
# ============================================================================
# This script builds and installs Subby on your Linux system.
#
# WHAT IT DOES:
#   1. Checks for required build tools (pnpm, rust, tauri dependencies)
#   2. Builds Subby from source
#   3. Installs the app system-wide (.deb, .rpm, or AppImage)
#   4. Optionally installs the Discord reminder bot
#
# WHY SUDO IS NEEDED:
#   - Installing .deb/.rpm packages requires root (writes to /usr)
#   - Installing Tauri build dependencies requires apt/dnf
#   - The Discord bot service file goes in /etc/systemd/system
#   - AppImage install does NOT need sudo (installs to ~/.local/bin)
#
# You can run with --dry-run to see what would happen without making changes.
# ============================================================================

VERSION="1.0.0"

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
    2. Installs missing Tauri dependencies (requires sudo for apt)
    3. Runs 'pnpm install' to get Node.js dependencies
    4. Runs 'pnpm tauri build' to compile the app
    5. Installs the built package:
       - Ubuntu/Debian: sudo dpkg -i (installs to /usr)
       - Fedora/RHEL: sudo rpm -i (installs to /usr)
       - Other: copies AppImage to ~/.local/bin (no sudo)
    6. Creates desktop menu entry if needed

${BOLD}WHY SUDO IS NEEDED:${NC}
    - ${YELLOW}apt install${NC}: To install Tauri build dependencies
    - ${YELLOW}dpkg -i / rpm -i${NC}: To install the .deb/.rpm package system-wide
    - ${YELLOW}systemctl${NC}: To set up the Discord bot as a service

    ${DIM}Note: If you choose AppImage, no sudo is required for the app itself.${NC}

${BOLD}FILES CREATED:${NC}
    Desktop app:
      /usr/bin/subby (or ~/.local/bin/subby for AppImage)
      /usr/share/applications/subby.desktop

    Discord bot (optional):
      /usr/local/bin/subby-bot
      /etc/systemd/system/subby-bot@.service
      /etc/subby-bot/env (your config)

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

# Check for Tauri Linux dependencies
if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" || "$DISTRO" == "pop" || "$DISTRO" == "linuxmint" ]]; then
    TAURI_DEPS="libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf"
    MISSING_TAURI_DEPS=()
    for dep in $TAURI_DEPS; do
        if ! dpkg -l 2>/dev/null | grep -q "^ii  $dep"; then
            MISSING_TAURI_DEPS+=("$dep")
        fi
    done
    if [[ ${#MISSING_TAURI_DEPS[@]} -gt 0 ]]; then
        print_warning "Missing Tauri build dependencies: ${MISSING_TAURI_DEPS[*]}"
        echo ""
        echo -e "${DIM}These are libraries needed to compile Tauri apps.${NC}"
        echo -e "${DIM}Installing requires sudo to run: apt install ...${NC}"
        echo ""
        if [[ "$DRY_RUN" == "true" ]]; then
            print_dry "Would run: sudo apt update && sudo apt install -y ${MISSING_TAURI_DEPS[*]}"
        else
            read -p "Install them now? [Y/n] " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                sudo apt update && sudo apt install -y "${MISSING_TAURI_DEPS[@]}"
            else
                print_error "Cannot continue without Tauri dependencies"
                exit 1
            fi
        fi
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

    # Find the built package
    BUNDLE_DIR="$SCRIPT_DIR/src-tauri/target/release/bundle"

    if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" || "$DISTRO" == "pop" || "$DISTRO" == "linuxmint" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            print_dry "Would install .deb package with: sudo dpkg -i $BUNDLE_DIR/deb/*.deb"
            echo ""
            echo -e "${DIM}This installs Subby to /usr/bin/subby and creates a desktop entry.${NC}"
        else
            DEB_FILE=$(find "$BUNDLE_DIR/deb" -name "*.deb" 2>/dev/null | head -1)
            if [[ -n "$DEB_FILE" ]]; then
                echo ""
                echo -e "${DIM}Installing .deb package requires sudo to write to /usr${NC}"
                print_step "Installing .deb package..."
                sudo dpkg -i "$DEB_FILE"
                print_success "Subby installed via .deb"
            fi
        fi
    elif [[ "$DISTRO" == "fedora" || "$DISTRO" == "rhel" || "$DISTRO" == "centos" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            print_dry "Would install .rpm package with: sudo rpm -i $BUNDLE_DIR/rpm/*.rpm"
        else
            RPM_FILE=$(find "$BUNDLE_DIR/rpm" -name "*.rpm" 2>/dev/null | head -1)
            if [[ -n "$RPM_FILE" ]]; then
                echo ""
                echo -e "${DIM}Installing .rpm package requires sudo to write to /usr${NC}"
                print_step "Installing .rpm package..."
                sudo rpm -i "$RPM_FILE"
                print_success "Subby installed via .rpm"
            fi
        fi
    else
        # Fallback to AppImage (no sudo needed!)
        if [[ "$DRY_RUN" == "true" ]]; then
            print_dry "Would copy AppImage to ~/.local/bin/subby (no sudo needed)"
        else
            APPIMAGE_FILE=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage" 2>/dev/null | head -1)
            if [[ -n "$APPIMAGE_FILE" ]]; then
                print_step "Installing AppImage (no sudo needed)..."
                mkdir -p "$HOME/.local/bin"
                cp "$APPIMAGE_FILE" "$HOME/.local/bin/subby"
                chmod +x "$HOME/.local/bin/subby"
                print_success "Subby installed to ~/.local/bin/subby"
                print_warning "Make sure ~/.local/bin is in your PATH"
            fi
        fi
    fi

    # Create desktop entry if not created by package
    if [[ "$DRY_RUN" == "false" ]]; then
        if [[ ! -f "/usr/share/applications/subby.desktop" && ! -f "$HOME/.local/share/applications/subby.desktop" ]]; then
            print_step "Creating desktop entry..."
            mkdir -p "$HOME/.local/share/applications"
            cat > "$HOME/.local/share/applications/subby.desktop" << EOF
[Desktop Entry]
Name=Subby
Comment=Know where your money flows
Exec=subby
Icon=subby
Terminal=false
Type=Application
Categories=Finance;Office;
EOF
            print_success "Desktop entry created"
        fi
    fi

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
        echo -e "${DIM}The bot installer will:${NC}"
        echo -e "${DIM}  - Build a standalone binary${NC}"
        echo -e "${DIM}  - Copy it to /usr/local/bin/subby-bot (requires sudo)${NC}"
        echo -e "${DIM}  - Ask for your Discord token and user ID${NC}"
        echo -e "${DIM}  - Create a systemd service (requires sudo)${NC}"
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
