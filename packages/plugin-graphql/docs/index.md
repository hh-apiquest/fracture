# GraphQL Plugin

GraphQL protocol plugin for ApiQuest Fracture. Provides support for GraphQL queries, mutations, and subscriptions with variable support.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-graphql

# Or using fracture CLI
fracture plugin install graphql
```

## Protocol API

The GraphQL plugin extends the [`quest`](../../fracture/docs/api_reference.md:1) object with GraphQL-specific properties.

### quest.request

```javascript
quest.request.url               // "https://api.example.com/graphql"
quest.request.method            // "POST" (always POST for GraphQL)
quest.request.headers.toObject()// All headers as object
```

### quest.response

```javascript
quest.response.status           // 200
quest.response.statusText       // "OK"
quest.response.body             // Raw response body string
quest.response.json()           // Parse response (returns {} if invalid)
quest.response.text()           // Alias for .body
quest.response.headers.get('content-type')
quest.response.headers.has('content-type')
quest.response.headers.toObject()
```

## Request Data Structure

```json
{
  "url": "{{baseUrl}}/graphql",
  "query": "query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    name\n    email\n  }\n}",
  "variables": {
    "id": "{{userId}}"
  },
  "operationName": "GetUser",
  "headers": {
    "x-api-version": "2024-01-01"
  }
}
```

### Mutation Example

```json
{
  "url": "{{baseUrl}}/graphql",
  "mutation": "mutation CreateUser($input: UserInput!) {\n  createUser(input: $input) {\n    id\n    name\n  }\n}",
  "variables": {
    "input": {
      "name": "Alice",
      "email": "alice@example.com"
    }
  }
}
```

## Plugin Configuration

### Protocols Provided
- `graphql`

### Supported Authentication Types
- `bearer`, `basic`, `apikey`, `oauth2`
- Accepts additional auth plugins (`strictAuthList: false`)

## Usage Example

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "graphql",
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
        "url": "{{baseUrl}}/graphql",
        "query": "query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    name\n    email\n  }\n}",
        "variables": {
          "id": "{{userId}}"
        }
      },
      "postRequestScript": "quest.test('User found', () => {\n  const result = quest.response.json();\n  expect(result.data.user).to.exist;\n  expect(result.errors).to.be.undefined;\n});"
    }
  ]
}
```

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE.txt](../LICENSE.txt).
