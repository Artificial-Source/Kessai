#!/usr/bin/env bash
set -euo pipefail

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
print_info() { echo -e "  ${DIM}$1${NC}"; }
print_error() { echo -e "${RED}${BOLD}XX${NC} $1"; }
print_none() { echo -e "  ${DIM}-${NC} $1"; }

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default options
UNINSTALL_APP=false
INTERACTIVE=true

# ============================================================================
# Help
# ============================================================================
show_help() {
    cat << EOF
${BOLD}Kessai Uninstaller${NC}

${BOLD}USAGE:${NC}
    ./uninstall.sh [OPTIONS]

${BOLD}OPTIONS:${NC}
    -h, --help          Show this help message
    --app               Uninstall desktop app (non-interactive)
    --purge             Also delete app data (combine with --app)

${BOLD}EXAMPLES:${NC}
    ./uninstall.sh                  # Interactive mode
    ./uninstall.sh --app            # Remove the desktop app
    ./uninstall.sh --app --purge    # Remove app and all data

EOF
}

# ============================================================================
# Parse arguments
# ============================================================================
PURGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --app)
            UNINSTALL_APP=true
            INTERACTIVE=false
            shift
            ;;
        --purge)
            PURGE=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Run './uninstall.sh --help' for usage."
            exit 1
            ;;
    esac
done

# ============================================================================
# Detect what's installed
# ============================================================================
APP_INSTALLED=false
DATA_EXISTS=false

# App: check local install and legacy system installs
[[ -f "$HOME/.local/bin/kessai" ]] && APP_INSTALLED=true
[[ -f "$HOME/.local/bin/kessai-desktop" ]] && APP_INSTALLED=true
[[ -f "$HOME/.local/bin/kessai-mcp" ]] && APP_INSTALLED=true
[[ -f "$HOME/.local/bin/kessai-web" ]] && APP_INSTALLED=true
dpkg -s kessai &>/dev/null 2>&1 && APP_INSTALLED=true
rpm -q kessai &>/dev/null 2>&1 && APP_INSTALLED=true

# Data
[[ -d "$HOME/.local/share/com.asf.kessai" ]] && DATA_EXISTS=true

# ============================================================================
# Banner
# ============================================================================
print_card "${RED}" "Kessai Uninstaller" "Remove the app while keeping control of your data"

# Show what's detected
print_info "Detected environment"
if [[ "$APP_INSTALLED" == "true" ]]; then
    echo -e "  ${GREEN}●${NC} Desktop app installed"
else
    echo -e "  ${DIM}○ Desktop app not found${NC}"
fi
if [[ "$DATA_EXISTS" == "true" ]]; then
    echo -e "  ${GREEN}●${NC} App data exists (~/.local/share/com.asf.kessai)"
else
    echo -e "  ${DIM}○ No app data${NC}"
fi
print_rule

# Nothing installed at all
if [[ "$APP_INSTALLED" == "false" && "$DATA_EXISTS" == "false" ]]; then
    print_info "Nothing to uninstall."
    echo ""
    exit 0
fi

# ============================================================================
# Interactive menu
# ============================================================================
if [[ "$INTERACTIVE" == "true" ]]; then
    if [[ "$APP_INSTALLED" == "true" ]]; then
        echo -e "${BOLD}Uninstall Kessai desktop app?${NC}"
        echo ""
        read -p "Proceed? [y/N] " -n 1 -r CHOICE
        echo ""
        case $CHOICE in
            [Yy]) UNINSTALL_APP=true ;;
            *) echo "Cancelled."; exit 0 ;;
        esac
    elif [[ "$DATA_EXISTS" == "true" ]]; then
        # Only leftover data, no app
        echo "  Only leftover app data was found."
        echo ""
        read -p "Delete app data at ~/.local/share/com.asf.kessai? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$HOME/.local/share/com.asf.kessai"
            print_success "Data deleted"
        else
            print_warning "Data kept"
        fi
        echo ""
        exit 0
    fi
fi

# Track what we actually removed for the summary
REMOVED_APP=false
REMOVED_DATA=false

# ============================================================================
# Uninstall desktop app
# ============================================================================
if [[ "$UNINSTALL_APP" == "true" ]]; then
    print_step "Uninstalling Kessai desktop app..."

    FOUND_SOMETHING=false

    print_info "Removing local binaries and launcher"

    # Remove local install
    if [[ -f "$HOME/.local/bin/kessai" ]]; then
        rm -f "$HOME/.local/bin/kessai"
        print_success "Removed launcher (~/.local/bin/kessai)"
        FOUND_SOMETHING=true
    fi

    if [[ -f "$HOME/.local/bin/kessai-desktop" ]]; then
        rm -f "$HOME/.local/bin/kessai-desktop"
        print_success "Removed desktop app (~/.local/bin/kessai-desktop)"
        FOUND_SOMETHING=true
    fi

    if [[ -f "$HOME/.local/bin/kessai-mcp" ]]; then
        rm -f "$HOME/.local/bin/kessai-mcp"
        print_success "Removed MCP/CLI (~/.local/bin/kessai-mcp)"
        FOUND_SOMETHING=true
    fi

    if [[ -f "$HOME/.local/bin/kessai-web" ]]; then
        rm -f "$HOME/.local/bin/kessai-web"
        print_success "Removed web server (~/.local/bin/kessai-web)"
        FOUND_SOMETHING=true
    fi

    if [[ -f "$HOME/.local/share/applications/kessai.desktop" ]]; then
        rm -f "$HOME/.local/share/applications/kessai.desktop"
        print_success "Removed desktop entry"
        FOUND_SOMETHING=true
    fi

    if [[ -f "$HOME/.local/share/icons/hicolor/128x128/apps/kessai.png" ]]; then
        rm -f "$HOME/.local/share/icons/hicolor/128x128/apps/kessai.png"
        if command -v gtk-update-icon-cache &>/dev/null; then
            gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
        fi
        print_success "Removed icon"
        FOUND_SOMETHING=true
    fi

    # Clean up legacy system-wide installs
    DISTRO="unknown"
    [[ -f /etc/os-release ]] && . /etc/os-release && DISTRO="$ID"

    print_info "Checking for legacy system-wide installs"

    if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" || "$DISTRO" == "pop" || "$DISTRO" == "linuxmint" ]]; then
        if dpkg -s kessai &>/dev/null; then
            print_warning "Found legacy system-wide install — removing (needs sudo)"
            sudo dpkg -r kessai 2>/dev/null || true
            print_success "Removed via dpkg"
            FOUND_SOMETHING=true
        fi
    elif [[ "$DISTRO" == "fedora" || "$DISTRO" == "rhel" || "$DISTRO" == "centos" || "$DISTRO" == "nobara" ]]; then
        if rpm -q kessai &>/dev/null; then
            print_warning "Found legacy system-wide install — removing (needs sudo)"
            sudo rpm -e kessai 2>/dev/null || true
            print_success "Removed via rpm"
            FOUND_SOMETHING=true
        fi
    fi

    if [[ -f "/usr/share/applications/kessai.desktop" ]]; then
        sudo rm -f "/usr/share/applications/kessai.desktop" 2>/dev/null || true
        FOUND_SOMETHING=true
    fi

    if [[ "$FOUND_SOMETHING" == "false" ]]; then
        print_none "Desktop app was not installed — nothing to remove"
    else
        REMOVED_APP=true
    fi

    # Handle app data
    if [[ -d "$HOME/.local/share/com.asf.kessai" ]]; then
        print_rule
        if [[ "$PURGE" == "true" ]]; then
            rm -rf "$HOME/.local/share/com.asf.kessai"
            print_success "App data deleted"
            REMOVED_DATA=true
        elif [[ "$INTERACTIVE" == "true" ]]; then
            print_warning "App data found at ~/.local/share/com.asf.kessai"
            print_info "This contains your subscriptions database."
            read -p "Delete your subscription data? [y/N] " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                rm -rf "$HOME/.local/share/com.asf.kessai"
                print_success "App data deleted"
                REMOVED_DATA=true
            else
                print_info "Data kept at ~/.local/share/com.asf.kessai"
            fi
        else
            print_info "App data kept at ~/.local/share/com.asf.kessai (use --purge to delete)"
        fi
    fi
fi

# ============================================================================
# Summary
# ============================================================================
if [[ "$REMOVED_APP" == "true" || "$REMOVED_DATA" == "true" ]]; then
    print_card "${GREEN}" "Uninstallation Complete" "Kessai artifacts were removed successfully"
else
    print_card "${MAGENTA}" "Nothing Changed" "No installed Kessai artifacts were removed"
fi

if [[ "$REMOVED_APP" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} Desktop app removed"
fi
if [[ "$REMOVED_DATA" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} App data deleted"
fi
if [[ "$REMOVED_APP" == "false" && "$REMOVED_DATA" == "false" ]]; then
    echo -e "  ${DIM}Nothing was removed${NC}"
fi

if [[ -d "$HOME/.local/share/com.asf.kessai" ]]; then
    print_info "Note: App data still exists at ~/.local/share/com.asf.kessai"
fi

print_rule
echo ""
