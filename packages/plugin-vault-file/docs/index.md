# Vault File Plugin

File-based secrets management plugin for ApiQuest Fracture. Provides secure storage and retrieval of sensitive values from encrypted vault files.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-vault-file

# Or using fracture CLI
fracture plugin install vault-file
```

## Usage

Reference vault values in variables using the `vault:file` provider:

```json
{
  "variables": {
    "apiToken": {
      "value": "",
      "provider": "vault:file",
      "isSecret": true
    },
    "dbPassword": {
      "value": "",
      "provider": "vault:file",
      "isSecret": true
    }
  }
}
```

## Vault File Format

Create a `.vault` file (JSON format):

```json
{
  "apiToken": "sk_live_abc123def456",
  "dbPassword": "super_secret_password",
  "awsAccessKey": "AKIAIOSFODNN7EXAMPLE"
}
```

## Configuration

Specify vault file location via runtime options:

```json
{
  "options": {
    "plugins": {
      "vault-file": {
        "path": "/path/to/.vault"
      }
    }
  }
}
```

Or via environment variable:
```bash
VAULT_FILE_PATH=/path/to/.vault fracture run collection.json
```

Or via CLI:
```bash
fracture run collection.json --vault-file /path/to/.vault
```

## Security

- Vault files should be excluded from version control (add `.vault` to `.gitignore`)
- Use file system permissions to restrict access
- Consider encrypting vault files at rest
- Variables marked with `isSecret: true` are masked in logs and UI

## Plugin Configuration

### Provider
- `vault:file`

### Configuration Schema
```typescript
{
  path: string;  // Path to vault file
}
```

## Example

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "http",
  "variables": {
    "baseUrl": "https://api.example.com",
    "apiKey": {
      "value": "",
      "provider": "vault:file",
      "isSecret": true,
      "description": "API key from vault"
    }
  },
  "auth": {
    "type": "apikey",
    "data": {
      "key": "X-API-Key",
      "value": "{{apiKey}}",
      "in": "header"
    }
  },
  "options": {
    "plugins": {
      "vault-file": {
        "path": "./.vault"
      }
    }
  },
  "items": [
    {
      "type": "request",
      "id": "list-users",
      "name": "List Users",
      "data": {
        "method": "GET",
        "url": "{{baseUrl}}/users"
      }
    }
  ]
}
```
