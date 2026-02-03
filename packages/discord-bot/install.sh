#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}!${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    print_error "Don't run this script as root. It will ask for sudo when needed."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_PATH="$SCRIPT_DIR/dist/subby-bot-linux"
SERVICE_FILE="$SCRIPT_DIR/subby-bot.service"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/subby-bot"
SERVICE_NAME="subby-bot@$USER"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Subby Discord Bot Installer        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if binary exists
if [[ ! -f "$BINARY_PATH" ]]; then
    print_error "Binary not found at $BINARY_PATH"
    print_step "Building the binary first..."
    cd "$SCRIPT_DIR"
    pnpm build:exe
    echo ""
fi

# Step 1: Install binary
print_step "Installing binary to $INSTALL_DIR..."
sudo cp "$BINARY_PATH" "$INSTALL_DIR/subby-bot"
sudo chmod +x "$INSTALL_DIR/subby-bot"
print_success "Binary installed"

# Step 2: Create config directory
print_step "Setting up configuration..."
sudo mkdir -p "$CONFIG_DIR"

# Step 3: Check if config already exists
if [[ -f "$CONFIG_DIR/env" ]]; then
    print_warning "Config file already exists at $CONFIG_DIR/env"
    read -p "Overwrite? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_step "Keeping existing config"
        SKIP_CONFIG=true
    else
        SKIP_CONFIG=false
    fi
else
    SKIP_CONFIG=false
fi

if [[ "$SKIP_CONFIG" == "false" ]]; then
    echo ""
    echo -e "${YELLOW}Discord Bot Configuration${NC}"
    echo "You'll need a Discord bot token and your user ID."
    echo "See: https://discord.com/developers/applications"
    echo ""

    read -p "Discord Bot Token: " DISCORD_TOKEN
    read -p "Your Discord User ID: " DISCORD_USER_ID
    read -p "Channel ID (leave empty for DMs): " DISCORD_CHANNEL_ID
    read -p "Reminder time [09:00]: " REMINDER_TIME
    REMINDER_TIME=${REMINDER_TIME:-09:00}
    read -p "Timezone [UTC]: " TIMEZONE
    TIMEZONE=${TIMEZONE:-UTC}

    # Detect Subby backup path
    DEFAULT_BACKUP_PATH="$HOME/.local/share/subby/subby-backup.json"
    if [[ -f "$DEFAULT_BACKUP_PATH" ]]; then
        print_success "Found Subby backup at $DEFAULT_BACKUP_PATH"
        BACKUP_PATH="$DEFAULT_BACKUP_PATH"
    else
        read -p "Subby backup path [$DEFAULT_BACKUP_PATH]: " BACKUP_PATH
        BACKUP_PATH=${BACKUP_PATH:-$DEFAULT_BACKUP_PATH}
    fi

    # Write config
    sudo tee "$CONFIG_DIR/env" > /dev/null << EOF
DISCORD_TOKEN=$DISCORD_TOKEN
DISCORD_USER_ID=$DISCORD_USER_ID
DISCORD_CHANNEL_ID=$DISCORD_CHANNEL_ID
SUBBY_BACKUP_PATH=$BACKUP_PATH
REMINDER_TIME=$REMINDER_TIME
TIMEZONE=$TIMEZONE
EOF

    sudo chmod 600 "$CONFIG_DIR/env"
    print_success "Configuration saved"
fi

# Step 4: Install systemd service
print_step "Installing systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/subby-bot@.service
sudo systemctl daemon-reload
print_success "Service installed"

# Step 5: Enable and start service
print_step "Enabling service for user: $USER"
sudo systemctl enable "$SERVICE_NAME"

read -p "Start the bot now? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    sudo systemctl start "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Bot is running!"
    else
        print_error "Bot failed to start. Check logs with:"
        echo "  journalctl -u $SERVICE_NAME -f"
    fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Installation Complete!         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status $SERVICE_NAME   # Check status"
echo "  sudo systemctl restart $SERVICE_NAME  # Restart bot"
echo "  sudo systemctl stop $SERVICE_NAME     # Stop bot"
echo "  journalctl -u $SERVICE_NAME -f        # View logs"
echo "  sudo nano $CONFIG_DIR/env             # Edit config"
echo ""
