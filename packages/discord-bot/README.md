# Subby Discord Bot

A Discord bot that sends subscription payment reminders based on your Subby data.

## Features

- **Daily Reminders**: Get notified 1, 3, and 7 days before subscription payments
- **Slash Commands**:
  - `/upcoming [days]` - View upcoming payments for the next N days
  - `/summary` - Monthly subscription spending breakdown
  - `/link [path]` - Check or update the backup file path
- **Rich Embeds**: Beautiful Discord embeds with category colors and totals

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this)
5. Enable "Message Content Intent" under Privileged Gateway Intents
6. Go to "OAuth2" → "URL Generator"
7. Select scopes: `bot`, `applications.commands`
8. Select permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
9. Copy the generated URL and invite the bot to your server

### 2. Export Subby Data

In the Subby app, go to Settings → Export Data to create a JSON backup file.

### 3. Configure the Bot

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_USER_ID=your_user_id_here
SUBBY_BACKUP_PATH=~/.local/share/subby/subby-backup.json
REMINDER_TIME=09:00
TIMEZONE=America/New_York
```

To find your Discord User ID:

1. Enable Developer Mode in Discord (Settings → App Settings → Advanced)
2. Right-click your name and select "Copy User ID"

### 4. Run the Bot

```bash
# From the monorepo root
pnpm install
pnpm bot:dev    # Development mode with hot reload
pnpm bot:build  # Build for production
pnpm bot:start  # Run production build
```

Or from this package directly:

```bash
pnpm dev   # Development
pnpm build # Production build
pnpm start # Run production
```

## Commands

### `/upcoming [days]`

Shows subscription payments due in the next N days (default: 7).

### `/summary`

Shows your monthly subscription spending breakdown by category, including:

- Total monthly cost
- Yearly projection
- Active subscription count
- Spending by category

### `/link [path]`

Check or update the path to your Subby backup file.

## How It Works

1. The bot reads your Subby JSON backup file
2. It calculates upcoming payments based on `next_payment_date`
3. Daily reminders are sent at your configured time
4. Respects your notification settings from Subby (`notification_days_before`)

## Re-exporting Data

When you add or modify subscriptions in Subby, re-export your data to update the bot:

1. Open Subby
2. Go to Settings → Export Data
3. Save to the same location

The bot automatically reloads the data periodically.

## Linux Binary Installation

The bot can be compiled into a standalone Linux executable that doesn't require Node.js.

### Build the Binary

```bash
# From the monorepo root
cd packages/discord-bot
pnpm install
pnpm build:exe
```

This creates `dist/subby-bot-linux` - a single executable file.

### Manual Installation

```bash
# Copy binary to system
sudo cp dist/subby-bot-linux /usr/local/bin/subby-bot
sudo chmod +x /usr/local/bin/subby-bot

# Create config directory
sudo mkdir -p /etc/subby-bot

# Create environment file
sudo tee /etc/subby-bot/env << 'EOF'
DISCORD_TOKEN=your_bot_token_here
DISCORD_USER_ID=your_user_id_here
SUBBY_BACKUP_PATH=/home/youruser/.local/share/subby/subby-backup.json
REMINDER_TIME=09:00
TIMEZONE=America/New_York
EOF

sudo chmod 600 /etc/subby-bot/env
```

### Run as SystemD Service (Recommended)

For 24/7 operation as a background daemon:

```bash
# Copy service file
sudo cp subby-bot.service /etc/systemd/system/subby-bot@.service

# Enable and start (replace 'youruser' with your username)
sudo systemctl daemon-reload
sudo systemctl enable subby-bot@youruser
sudo systemctl start subby-bot@youruser

# Check status
sudo systemctl status subby-bot@youruser

# View logs
journalctl -u subby-bot@youruser -f
```

### Run Directly

If you prefer to run without systemd:

```bash
# Set environment variables
export DISCORD_TOKEN=your_token
export DISCORD_USER_ID=your_id
export SUBBY_BACKUP_PATH=~/.local/share/subby/subby-backup.json

# Run the binary
./dist/subby-bot-linux
```

## Hosting Options

For 24/7 uptime, deploy the bot to:

- **Linux desktop/server**: Use the binary + SystemD service (see above)
- A VPS (DigitalOcean, Linode, etc.)
- Railway, Fly.io, or Render
- A Raspberry Pi at home

## License

MIT - Same as the main Subby project.
