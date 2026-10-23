# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| 0.x     | No        |

## Security Model

Kessai is a **local-first application** with the following security characteristics:

- **All data stored locally** - SQLite database in your app data directory
- **No telemetry or analytics** - the desktop app has no checked-in tracking layer, but optional features such as update checks and logo fetches do make network requests
- **Authentication depends on the surface** - see the matrix below; local storage is not encrypted by Kessai
- **Mostly local data handling** - subscription and payment data stay local by default, but optional network-assisted features such as logo fetch and update checks do contact external services

| Surface                 | Authentication and boundary                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop app             | No application login; local OS account and filesystem permissions protect the database                                                                                                                                           |
| Standalone web server   | No application authentication; Host and mutation-Origin checks protect the browser boundary, not against direct clients. Loopback by default; non-loopback exposure requires a trusted network or an authenticated reverse proxy |
| Private Web Access      | Access key bootstraps a per-server random session cookie for every browser, including direct loopback requests; remote requests additionally require validated Tailscale identity, authority, and Origin                         |
| Tailscale-hosted access | Standalone `--tailscale-only` requires validated Tailscale identity for hosted requests; canonical direct loopback requests are trusted without a second login, and `/__kessai/health` is identity-free                          |
| MCP over HTTP           | Required bearer token, loopback binding, and Host/Origin checks                                                                                                                                                                  |
| CLI / MCP over stdio    | No application login; the invoking local process and OS account are trusted                                                                                                                                                      |

See [Security and privacy](docs/explanation/security-and-privacy.md) for deployment boundaries, optional network requests, token handling, and data protection details.

Private Web Access never stores the persistent access key in a cookie. Restarting its server invalidates session tokens; disabling and re-enabling access also rotates the key. Standalone `--allowed-host` / `KESSAI_WEB_ALLOWED_HOSTS` restrict accepted hosts on non-loopback listeners but do not authenticate clients.

### Data Storage Locations

| Platform | Location                                           |
| -------- | -------------------------------------------------- |
| Linux    | `${XDG_DATA_HOME:-~/.local/share}/com.asf.kessai/` |
| macOS    | `~/Library/Application Support/com.asf.kessai/`    |
| Windows  | `%APPDATA%/com.asf.kessai/`                        |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email security concerns to the maintainer security contact listed in repository settings, or
3. Open a [private security advisory](https://github.com/Artificial-Source/Kessai/security/advisories/new) on GitHub

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
