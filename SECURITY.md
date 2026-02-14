# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Model

Subby is a **local-first application** with the following security characteristics:

- **All data stored locally** - SQLite database in your app data directory
- **No network requests in desktop runtime** - 100% offline desktop app, no telemetry, no analytics
- **No authentication** - No accounts, passwords, or login required
- **No sensitive data transmission** - Your subscription data never leaves your device

### Data Storage Locations

| Platform | Location                               |
| -------- | -------------------------------------- |
| Linux    | `~/.local/share/subby/`                |
| macOS    | `~/Library/Application Support/subby/` |
| Windows  | `%APPDATA%/subby/`                     |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email security concerns to the maintainer security contact listed in repository settings, or
3. Open a [private security advisory](https://github.com/ASF/Subby/security/advisories/new) on GitHub

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

1. **Keep Subby updated** - Install updates when available
2. **Secure your device** - Subby's data is as secure as your device
3. **Back up your data** - Use the export feature regularly
4. **Be cautious with imports** - Only import backup files from trusted sources

## Disclosure Policy

We follow responsible disclosure:

1. Security issues are fixed before public disclosure
2. Credits given to reporters (unless they prefer anonymity)
3. CVE assigned for significant vulnerabilities
