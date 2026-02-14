# Environment Variables

This project is a pnpm workspace with an app and optional Discord bot.

## Desktop App

The desktop app has no required `.env` variables for normal local usage.

## Discord Bot (`packages/discord-bot`)

Required variables:

- `DISCORD_TOKEN`
- `DISCORD_USER_ID`
- `SUBBY_BACKUP_PATH`

Optional variables:

- `REMINDER_TIME` (default in bot docs)
- `TIMEZONE`

See `packages/discord-bot/README.md` for setup details.
