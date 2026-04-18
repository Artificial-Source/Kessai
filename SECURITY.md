# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |

## Security Model

Kessai is a **local-first application** with the following security characteristics:

- **All data stored locally** - SQLite database in your app data directory
- **No telemetry or analytics** - the desktop app has no checked-in tracking layer, but optional features such as update checks, exchange-rate fetches, and logo fetches do make network requests
- **No authentication** - No accounts, passwords, or login required
- **Mostly local data handling** - subscription and payment data stay local by default, but optional network-assisted features such as logo fetch, exchange-rate lookup, and update checks do contact external services

### Data Storage Locations

| Platform | Location                               |
| -------- | -------------------------------------- |
| Linux    | `~/.local/share/com.asf.kessai/`                |
| macOS    | `~/Library/Application Support/com.asf.kessai/` |
| Windows  | `%APPDATA%/com.asf.kessai/`                     |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email security concerns to the maintainer security contact listed in repository settings, or
3. Open a [private security advisory](https://github.com/Artificial-Source-Foundation/Kessai/security/advisories/new) on GitHub

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- Acknowledgment: Within 48 hours
- Initial assessment: Within 1 week
- Fix timeline: Depends on severity (critical: ASAP, others: next release)

## Security Best Practices for Users

1. **Keep Kessai updated** - Install updates when available
2. **Secure your device** - Kessai's data is as secure as your device
3. **Back up your data** - Use the export feature regularly
4. **Be cautious with imports** - Only import backup files from trusted sources

## Disclosure Policy

We follow responsible disclosure:

1. Security issues are fixed before public disclosure
2. Credits given to reporters (unless they prefer anonymity)
3. CVE assigned for significant vulnerabilities
