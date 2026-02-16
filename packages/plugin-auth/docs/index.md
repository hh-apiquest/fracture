# Auth Plugin

Authentication plugin for ApiQuest Fracture. Provides common authentication methods including Bearer tokens, Basic auth, OAuth 2.0, API keys, Digest, and NTLM.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-auth

# Or using fracture CLI
fracture plugin install auth
```

## Supported Auth Types

### Bearer Token

```json
{
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{apiToken}}"
    }
  }
}
```

###Basic Authentication

```json
{
  "auth": {
    "type": "basic",
    "data": {
      "username": "{{username}}",
      "password": "{{password}}"
    }
  }
}
```

### OAuth 2.0

```json
{
  "auth": {
    "type": "oauth2",
    "data": {
      "grantType": "client_credentials",
      "accessTokenUrl": "{{authUrl}}/token",
      "clientId": "{{clientId}}",
      "clientSecret": "{{clientSecret}}",
      "scope": "read write"
    }
  }
}
```

### API Key

```json
{
  "auth": {
    "type": "apikey",
    "data": {
      "key": "X-API-Key",
      "value": "{{apiKey}}",
      "in": "header"
    }
  }
}
```

Supports `in`: "header" or "query"

### Digest Authentication

```json
{
  "auth": {
    "type": "digest",
    "data": {
      "username": "{{username}}",
      "password": "{{password}}"
    }
  }
}
```

### NTLM Authentication

```json
{
  "auth": {
    "type": "ntlm",
    "data": {
      "username": "{{username}}",
      "password": "{{password}}",
      "domain": "{{domain}}"
    }
  }
}
```

## Plugin Configuration

### Authentication Types Provided
- `bearer`
- `basic`
- `oauth2`
- `apikey`
- `digest`
- `ntlm`

### Supported Protocols
- `http`
- `graphql`
- `grpc`
- `websocket`
- `sse`

## Usage

Authentication is applied by the runner before protocol plugin execution. Configure at collection, folder, or request level:

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "http",
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{globalToken}}"
    }
  },
  "items": [
    {
      "type": "request",
      "id": "protected-resource",
      "name": "Get Protected Resource",
      "data": {
        "method": "GET",
        "url": "{{baseUrl}}/protected"
      }
    }
  ]
}
```

### Inheritance

- Requests inherit auth from parent folder
- Folders inherit auth from collection
- Use `"type": "inherit"` to explicitly inherit
- Use `"type": "none"` to disable auth for specific request/folder

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE.txt](../LICENSE.txt).
