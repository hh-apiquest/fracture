# Security Policy

## Supported Versions

We provide security updates for the following versions of ApiQuest/Fracture:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in ApiQuest/Fracture, please report it to us privately:

- **Email**: security@apiquest.net
- **Subject**: Include "SECURITY" and brief description
- **Details**: Provide as much information as possible:
  - Type of vulnerability
  - Affected version(s)
  - Steps to reproduce
  - Potential impact
  - Suggested fix (if available)

### What to Expect

1. **Acknowledgment**: We'll acknowledge your email within 48 hours
2. **Assessment**: We'll investigate and assess the vulnerability's severity
3. **Update**: We'll provide status updates every 5-7 days
4. **Resolution**: We'll work on a fix and coordinate disclosure timing with you
5. **Credit**: We'll credit you in the security advisory (unless you prefer to remain anonymous)

### Disclosure Policy

- We request that you give us reasonable time to fix the vulnerability before public disclosure
- We'll work with you to understand the issue and develop a fix
- Once a fix is ready, we'll coordinate a disclosure timeline that works for both parties
- We'll publish a security advisory crediting the reporter (unless anonymity is requested)

## Security Best Practices

When using ApiQuest/Fracture:

### Script Execution
- **Never run collections from untrusted sources** - Scripts execute in a VM sandbox that is NOT fully isolated
- **Review pre-request and test scripts** before executing collections
- **Avoid storing secrets in scripts** - Use environment variables or vault providers instead

### API Keys & Secrets
- **Use environment variables** for sensitive credentials
- **Never commit** `.env` files or credentials to version control
- **Use vault providers** for production secrets (e.g., `@apiquest/plugin-vault-file`)
- **Rotate credentials** regularly

### HTTPS & TLS
- **Use HTTPS** for all production API requests
- **Verify TLS certificates** - don't disable certificate validation except for development
- **Be cautious with self-signed certificates**

### Plugin Security
- **Only install plugins from trusted sources** - Plugins can execute arbitrary code
- **Review plugin code** before installation when possible
- **Keep plugins updated** to receive security patches

### Desktop Application
- **Keep the desktop application updated** to receive security fixes
- **Be aware of local file access** - Fracture can access local files via file URLs
- **Review collection permissions** - Collections can potentially access local resources

## Known Limitations

### VM Sandbox
The JavaScript execution environment (Node.js VM) provides **limited isolation**:
- Scripts can access Node.js built-in modules
- Scripts can make network requests
- File system access is restricted but not completely prevented

**Recommendation**: Treat collection scripts as trusted code and only run collections from verified sources.

### Plugin System
Plugins are **NOT sandboxed** and execute with full Node.js privileges:
- Protocol plugins can make arbitrary network requests
- Auth plugins can access and modify request data
- Value provider plugins can access file systems or external services

**Recommendation**: Only install plugins from the official ApiQuest organization or verified community sources.

### Local File Access
The file-based vault provider (`@apiquest/plugin-vault-file`) stores secrets in encrypted files:
- Encryption key is stored locally
- File permissions depend on OS configuration
- Not suitable for highly sensitive production secrets

**Recommendation**: For production use, implement a custom vault provider that integrates with your secrets management system (HashiCorp Vault, AWS Secrets Manager, etc.).

## Responsible Disclosure

We believe in responsible disclosure and will work with security researchers to:
- Understand and verify reported vulnerabilities
- Develop and test fixes promptly
- Coordinate public disclosure timing
- Credit researchers appropriately

Thank you for helping keep ApiQuest/Fracture and our community safe!
