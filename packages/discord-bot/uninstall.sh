#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}!${NC} $1"; }

SERVICE_NAME="subby-bot@$USER"
CONFIG_DIR="/etc/subby-bot"

echo ""
echo -e "${RED}╔════════════════════════════════════════╗${NC}"
echo -e "${RED}║    Subby Discord Bot Uninstaller       ║${NC}"
echo -e "${RED}╚════════════════════════════════════════╝${NC}"
echo ""

read -p "This will remove the Subby Discord Bot. Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Stop and disable service
print_step "Stopping service..."
sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
print_success "Service stopped"

# Remove service file
print_step "Removing service file..."
sudo rm -f /etc/systemd/system/subby-bot@.service
sudo systemctl daemon-reload
print_success "Service file removed"

# Remove binary
print_step "Removing binary..."
sudo rm -f /usr/local/bin/subby-bot
print_success "Binary removed"

# Ask about config
if [[ -d "$CONFIG_DIR" ]]; then
    read -p "Remove configuration (contains your Discord token)? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo rm -rf "$CONFIG_DIR"
        print_success "Configuration removed"
    else
        print_warning "Config kept at $CONFIG_DIR"
    fi
fi

echo ""
print_success "Subby Discord Bot has been uninstalled."
echo ""
