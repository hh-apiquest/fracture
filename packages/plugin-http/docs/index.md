# HTTP Plugin

HTTP/HTTPS protocol plugin for ApiQuest Fracture. Provides comprehensive REST API testing with support for all standard methods, headers, body types, SSL/TLS, proxies, and cookie management.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-http

# Or using fracture CLI
fracture plugin install http
```

## Protocol API

The HTTP plugin extends the [`quest`](../../fracture/api_reference) object with HTTP-specific properties and methods via [`protocolAPIProvider()`].

### quest.request

#### Properties (HTTP-Specific)
```javascript
quest.request.url               // "https://api.com/users/123" - Request URL
quest.request.method            // "GET" - HTTP method
```

#### Headers
```javascript
quest.request.headers.get('Authorization')                     // Get header value (case-insensitive)
quest.request.headers.add({key: 'X-Custom', value: 'value'})   // Add header
quest.request.headers.remove('X-Old')                          // Remove header
quest.request.headers.upsert({key: 'User-Agent', value: '...'}) // Add or update header
quest.request.headers.toObject()                               // All headers as object
```

#### Body
```javascript
quest.request.body.get()                        // Get body content as string or null
quest.request.body.set('{"key": "value"}')      // Set body content
quest.request.body.mode                         // 'raw' | 'urlencoded' | 'formdata' | null
```

### quest.response

#### Status
```javascript
quest.response.status           // 200 - HTTP status code
quest.response.statusText       // "OK" - HTTP status text
```

#### Body
```javascript
quest.response.body             // Raw response body string
quest.response.json()           // Parse body as JSON (returns {} if invalid)
quest.response.text()           // Alias for .body
```

#### Headers
```javascript
quest.response.headers.get('content-type')     // Get header value (case-insensitive)
                                                // Returns string | string[] | null
                                                // (headers like 'set-cookie' can have multiple values)
quest.response.headers.has('content-type')     // Check if header exists
quest.response.headers.toObject()              // All headers as object: Record<string, string | string[]>
```

**Important:** Some HTTP headers (notably `set-cookie`) can have multiple values. When this occurs:
- `get()` returns an array of strings: `['cookie1=value1', 'cookie2=value2']`
- Single-value headers return a string: `'application/json'`
- Missing headers return `null`

**Example:**
```javascript
// Single value header
const contentType = quest.response.headers.get('content-type');
// → "application/json"

// Multiple value header (set-cookie)
const cookies = quest.response.headers.get('set-cookie');
// → ["sessionId=abc123; Path=/", "userId=xyz; Path=/"]

// Check if header exists
if (quest.response.headers.has('set-cookie')) {
  const cookies = quest.response.headers.get('set-cookie');
  if (Array.isArray(cookies)) {
    console.log(`Received ${cookies.length} cookies`);
  }
}
```

#### Metrics
```javascript
quest.response.duration         // 145 - Response duration in milliseconds
quest.response.size             // 1234 - Response body size in bytes
```

#### Assertion Helpers
```javascript
quest.response.to.be.ok                        // true if status === 200
quest.response.to.be.success                   // true if status 2xx
quest.response.to.be.clientError               // true if status 4xx
quest.response.to.be.serverError               // true if status 5xx
quest.response.to.have.status(200)             // true if status matches
quest.response.to.have.header('content-type')  // true if header exists
quest.response.to.have.jsonBody('userId')      // true if JSON body has field
```

## Request Data Structure

Basic structure (see [Collection Schema](../../fracture/quest_schema_spec.md) for full details):

```json
{
 "method": "POST",
  "url": "{{baseUrl}}/users",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "mode": "raw",
    "raw": "{\"name\": \"Alice\"}"
  }
}
```

### Query Parameters

```json
{
  "method": "GET",
  "url": "{{baseUrl}}/users",
  "params": [
    { "key": "page", "value": "1", "description": "Page number" },
    { "key": "limit", "value": "10" }
  ]
}
```

### Body Modes

**Raw** (JSON, XML, text):
```json
{
  "body": {
    "mode": "raw",
    "raw": "{\"name\": \"Alice\", \"email\": \"alice@example.com\"}"
  }
}
```

**Binary** (base64-encoded):
```json
{
  "body": {
    "mode": "binary",
    "raw": "iVBORw0KGgoAAAANSUhEUgA..."
  }
}
```

**URL-Encoded Form**:
```json
{
  "body": {
    "mode": "urlencoded",
    "kv": [
      { "key": "username", "value": "alice" },
      { "key": "password", "value": "{{password}}" }
    ]
  }
}
```

**Form Data** (multipart/form-data):
```json
{
  "body": {
    "mode": "formdata",
    "kv": [
      { "key": "file", "value": "base64EncodedContent...", "type": "binary", "description": "PDF file" },
      { "key": "category", "value": "reports", "type": "text" }
    ]
  }
}
```

**Note:** For `type: "binary"` in formdata/urlencoded, `value` must be base64-encoded content.

## Runtime Options

Configure HTTP-specific options via collection-level `options` or plugin-specific `options.plugins.http`:

```json
{
  "options": {
    "timeout": {
      "request": 30000
    },
    "followRedirects": true,
    "maxRedirects": 5,
    "ssl": {
      "validateCertificates": true,
      "clientCertificate": {
        "cert": "/path/to/cert.pem",
        "key": "/path/to/key.pem",
        "passphrase": "{{certPass}}"
      },
      "ca": "/path/to/ca.pem"
    },
    "proxy": {
      "enabled": true,
      "host": "proxy.example.com",
      "port": 8080,
      "auth": {
        "username": "proxyuser",
        "password": "{{proxyPass}}"
      },
      "bypass": ["localhost", "*.internal.com"]
    },
    "plugins": {
      "http": {
        "keepAlive": true,
        "timeout": 60000,
        "followRedirects": false,
        "maxRedirects": 10,
        "validateCertificates": false
      }
    }
  }
}
```

### Plugin Options Schema

Options in `options.plugins.http` override collection-level options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `keepAlive` | boolean | true | Keep TCP connections alive between requests |
| `timeout` | number | 30000 | Request timeout in ms (overrides `options.timeout.request`) |
| `followRedirects` | boolean | true | Follow HTTP redirects automatically |
| `maxRedirects` | number | 5 | Maximum number of redirects to follow |
| `validateCertificates` | boolean | true | Validate SSL/TLS certificates (overrides `options.ssl.validateCertificates`) |

## Environment Variables

The HTTP plugin respects standard proxy environment variables:
- `HTTP_PROXY` / `http_proxy` - HTTP proxy URL
- `HTTPS_PROXY` / `https_proxy` - HTTPS proxy URL
- `NO_PROXY` / `no_proxy` - Comma-separated list of hosts to bypass proxy

Example:
```bash
export HTTPS_PROXY=http://proxy.corp.com:8080
export NO_PROXY=localhost,127.0.0.1,*.internal.com
fracture run collection.json
```

## Authentication

Works with authentication plugins (e.g., `@apiquest/plugin-auth`). Authentication is applied by the runner before the HTTP plugin executes:

```json
{
  "protocol": "http",
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{apiToken}}"
    }
  }
}
```

See [Authentication Plugins](../plugin-auth/index.md) for details.

## Cookie Management

The HTTP plugin integrates with Fracture's cookie jar:
- Automatically sends relevant cookies with requests (domain/path matching)
- Stores `Set-Cookie` headers from responses (including error responses)
- Cookies persist across requests in the same run (unless disabled via `options.jar.persist`)

Access cookies in scripts via [`quest.cookies`](../../fracture/api_reference.md#questcookies).

## Plugin Configuration

### Protocols Provided
- `http`

### Supported Authentication Types
- `bearer`, `basic`, `oauth2`, `apikey`, `digest`, `ntlm`
- Accepts additional auth plugins (`strictAuthList: false`)

## Usage Example

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "http",
  "variables": {
    "baseUrl": "https://api.example.com",
    "userId": "123"
  },
  "items": [
    {
      "type": "request",
      "id": "get-user",
      "name": "Get User",
      "data": {
        "method": "GET",
        "url": "{{baseUrl}}/users/{{userId}}",
        "headers": {
          "Accept": "application/json"
        }
      },
      "postRequestScript": "quest.test('User found', () => {\n  expect(quest.response.to.be.success).to.be.true;\n  const user = quest.response.json();\n  expect(user.id).to.equal(quest.variables.get('userId'));\n});"
    }
  ]
}
```
