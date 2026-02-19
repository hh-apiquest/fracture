# SSE (Server-Sent Events) Plugin

Server-Sent Events protocol plugin for ApiQuest Fracture. Provides support for testing SSE endpoints with event streaming and message validation.

## Installation

```bash
# Using npm
npm install -g @apiquest/plugin-sse

# Or using fracture CLI
fracture plugin install sse
```

##Protocol API

The SSE plugin extends the [`quest`](../../fracture/api_reference) object with SSE-specific properties for event-driven testing.

### quest.message

Available in `onMessage` event scripts:

```javascript
quest.message.data              // Message data string
quest.message.event             // Event type (if specified)
quest.message.id                // Event ID (if specified)
```

### quest.messages

Available in `onComplete` event script:

```javascript
quest.messages                  // Array of all received messages
quest.messages.length           // Total message count
```

## Request Data Structure

```json
{
  "url": "{{baseUrl}}/events",
  "timeout": 30000,
  "headers": {
    "Accept": "text/event-stream"
  },
  "scripts": [
    {
      "event": "onMessage",
      "script": "quest.test('Message received', () => {\n  expect(quest.message.data).to.exist;\n});"
    },
    {
      "event": "onComplete",
      "script": "quest.test('Stream completed', () => {\n  expect(quest.messages.length).to.be.greaterThan(0);\n});"
    }
  ]
}
```

## Plugin Events

SSE requests use event-based scripts:

| Event | Description | Can Have Tests | Required |
|-------|-------------|----------------|----------|
| `onMessage` | Fires for each received message | Yes | No |
| `onError` | Fires when an error occurs | No | No |
| `onComplete` | Fires when stream completes | Yes | No |

## Message Counting

Use `quest.expectMessages()` in preRequestScript for deterministic test counting:

```javascript
// preRequestScript
quest.expectMessages(5, 10000);  // Expect 5 messages within 10 seconds
```

This enables accurate test count reporting (5 messages × tests per message).

## Plugin Configuration

### Protocols Provided
- `sse`

### Supported Authentication Types
- `bearer`, `basic`, `apikey`
- Accepts additional auth plugins (`strictAuthList: false`)

## Usage Example

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "protocol": "sse",
  "items": [
    {
      "type": "request",
      "id": "stream-events",
      "name": "Stream Server Events",
      "preRequestScript": "quest.expectMessages(10, 30000);",
      "data": {
        "url": "{{baseUrl}}/events",
        "timeout": 30000,
        "scripts": [
          {
            "event": "onMessage",
            "script": "const data = JSON.parse(quest.message.data);\n\nquest.test('Valid event data', () => {\n  expect(data).to.have.property('timestamp');\n  expect(data).to.have.property('type');\n});"
          },
          {
            "event": "onComplete",
            "script": "quest.test('Received all messages', () => {\n  expect(quest.messages.length).to.equal(10);\n});"
          }
        ]
      }
    }
  ]
}
```

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE.txt](../LICENSE.txt).
