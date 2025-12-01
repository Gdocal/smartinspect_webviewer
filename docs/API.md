# API Reference

Complete REST API and WebSocket protocol documentation.

## REST API Endpoints

### Server Status

#### `GET /api/status`
Get server status, uptime, memory usage, and connection counts.

**Response:**
```json
{
  "uptime": 12345,
  "memory": { "heapUsed": 50000000, "heapTotal": 100000000 },
  "connections": 5,
  "entryCount": 1523,
  "rooms": ["default", "dev", "qa"]
}
```

#### `GET /api/server/connection-info`
Get network interfaces and SmartInspect connection strings.

**Response:**
```json
{
  "tcpPort": 4229,
  "httpPort": 3000,
  "hostname": "desktop",
  "connections": [
    {
      "interface": "eth0",
      "address": "192.168.1.100",
      "family": "IPv4",
      "port": 4229,
      "connectionString": "tcp(host=192.168.1.100, port=4229)"
    }
  ]
}
```

### Logs

#### `GET /api/logs`
Query logs with filters and pagination.

**Query Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `sessions` | string | Comma-separated session names | `sessions=Database,API` |
| `levels` | string | Comma-separated level numbers (0-5) | `levels=3,4` |
| `levelInverse` | boolean | Invert level matching | `levelInverse=true` |
| `from` | ISO date | Start time filter | `from=2024-01-01T00:00:00Z` |
| `to` | ISO date | End time filter | `to=2024-01-31T23:59:59Z` |
| `between` | string | Date range "from,to" | `between=2024-01-01,2024-01-31` |
| `title` | string | Title match | `title=Error` |
| `titlePattern` | string | Title regex pattern | `titlePattern=^Error.*timeout` |
| `titleOperator` | string | Title operator (contains/equals/regex) | `titleOperator=contains` |
| `titleCaseSensitive` | boolean | Case-sensitive title | `titleCaseSensitive=true` |
| `message` | string | Message match | `message=database` |
| `messagePattern` | string | Message regex | `messagePattern=SELECT.*FROM` |
| `messageOperator` | string | Message operator | `messageOperator=regex` |
| `inverse` | boolean | Invert pattern matching | `inverse=true` |
| `appNames` | string | Comma-separated app names | `appNames=WebApp,MobileApp` |
| `hostNames` | string | Comma-separated host names | `hostNames=server-01` |
| `processIds` | string | Comma-separated process IDs | `processIds=1234,5678` |
| `offset` | number | Pagination offset | `offset=100` |
| `limit` | number | Max results (default: 100, max: 1000) | `limit=500` |

**Example Request:**
```bash
curl "http://localhost:3000/api/logs?sessions=Database&levels=3,4&from=2024-01-01T00:00:00Z&limit=50"
```

**Response:**
```json
{
  "entries": [
    {
      "id": 1523,
      "timestamp": "2024-01-15T10:30:45.123Z",
      "level": 4,
      "sessionName": "Database",
      "title": "Connection failed",
      "data": "ECONNREFUSED",
      "appName": "MyApp",
      "hostName": "server-01"
    }
  ],
  "total": 1523,
  "offset": 0,
  "limit": 50
}
```

#### `GET /api/logs/since/:id`
Get logs since a given entry ID.

**Response:**
```json
{
  "entries": [ /* LogEntry[] */ ],
  "count": 25
}
```

#### `DELETE /api/logs`
Clear all logs from the buffer.

**Response:**
```json
{
  "success": true,
  "clearedCount": 1523
}
```

### Sessions

#### `GET /api/sessions`
List all sessions with entry counts.

**Response:**
```json
{
  "sessions": [
    { "name": "Database", "count": 523 },
    { "name": "API", "count": 342 },
    { "name": "UI", "count": 658 }
  ]
}
```

### Watches

#### `GET /api/watches`
Get current watch values.

**Response:**
```json
{
  "watches": [
    {
      "name": "config.timeout",
      "value": "5000",
      "timestamp": "2024-01-15T10:30:45.123Z"
    },
    {
      "name": "users.active",
      "value": "42",
      "timestamp": "2024-01-15T10:30:50.456Z"
    }
  ]
}
```

#### `DELETE /api/watches`
Clear all watch values.

**Response:**
```json
{
  "success": true,
  "clearedCount": 15
}
```

### Streams

#### `GET /api/streams`
List all stream channels.

**Response:**
```json
{
  "streams": [
    { "channel": "metrics", "count": 1000 },
    { "channel": "telemetry", "count": 850 }
  ]
}
```

#### `GET /api/streams/:channel`
Get stream data for a specific channel.

**Response:**
```json
{
  "channel": "metrics",
  "data": [
    {
      "index": 1,
      "data": "CPU: 45%, Memory: 2.3GB",
      "timestamp": "2024-01-15T10:30:45.123Z"
    }
  ],
  "count": 1000
}
```

### Rooms

#### `GET /api/rooms`
List available rooms with statistics.

**Response:**
```json
{
  "rooms": [
    {
      "name": "default",
      "entryCount": 1523,
      "connections": 3,
      "sessions": ["Database", "API", "UI"]
    },
    {
      "name": "dev",
      "entryCount": 842,
      "connections": 2,
      "sessions": ["Testing"]
    }
  ]
}
```

### Settings

#### `GET /api/settings/:room/:user/:key`
Get a setting value.

**Response:**
```json
{
  "value": { /* setting data */ }
}
```

#### `POST /api/settings/:room/:user/:key`
Set a setting value.

**Request Body:**
```json
{
  "value": { /* setting data */ }
}
```

**Response:**
```json
{
  "success": true
}
```

### Projects

#### `GET /api/projects/:room/:user`
List user projects in a room.

**Response:**
```json
{
  "projects": [
    {
      "id": "proj-123",
      "name": "My Project",
      "updatedAt": "2024-01-15T10:30:45.123Z"
    }
  ]
}
```

#### `GET /api/projects/:room/:user/:id`
Get a project by ID.

**Response:**
```json
{
  "id": "proj-123",
  "name": "My Project",
  "projectData": {
    "views": [ /* ... */ ],
    "theme": "dark"
  }
}
```

#### `POST /api/projects/:room/:user`
Create a new project.

**Request Body:**
```json
{
  "name": "My Project",
  "projectData": { /* project configuration */ }
}
```

**Response:**
```json
{
  "project": {
    "id": "proj-456",
    "name": "My Project"
  }
}
```

#### `PUT /api/projects/:room/:user/:id`
Update an existing project.

**Request Body:**
```json
{
  "name": "Updated Project",
  "projectData": { /* updated configuration */ }
}
```

**Response:**
```json
{
  "project": {
    "id": "proj-123",
    "name": "Updated Project"
  }
}
```

#### `DELETE /api/projects/:room/:user/:id`
Delete a project.

**Response:**
```json
{
  "success": true
}
```

---

## WebSocket Protocol

**Connect to:** `ws://localhost:3000/ws`

### Messages from Server

#### `init`
Initial state sent when client connects.

```json
{
  "type": "init",
  "data": {
    "stats": {
      "entryCount": 1523,
      "sessionCount": 5
    },
    "watches": [ /* watch values */ ],
    "sessions": ["Database", "API", "UI"],
    "rooms": ["default", "dev"]
  }
}
```

#### `entries`
New log entries (batched every 100ms).

```json
{
  "type": "entries",
  "data": [
    {
      "id": 1524,
      "timestamp": "2024-01-15T10:30:45.123Z",
      "level": 2,
      "sessionName": "API",
      "title": "Request processed",
      "data": "GET /api/users"
    }
  ]
}
```

#### `watch`
Watch value update.

```json
{
  "type": "watch",
  "data": {
    "name": "users.active",
    "value": "43",
    "timestamp": "2024-01-15T10:30:50.456Z"
  }
}
```

#### `stream`
Stream data entry.

```json
{
  "type": "stream",
  "data": {
    "channel": "metrics",
    "data": "CPU: 50%, Memory: 2.5GB",
    "timestamp": "2024-01-15T10:30:55.789Z",
    "index": 1001
  }
}
```

#### `control`
Control message (clear, pause, etc.).

```json
{
  "type": "control",
  "data": {
    "command": "clear",
    "room": "default"
  }
}
```

#### `stats`
Server statistics update.

```json
{
  "type": "stats",
  "data": {
    "entryCount": 1525,
    "sessionCount": 5,
    "connections": 3
  }
}
```

### Messages to Server

#### `pause`
Pause log streaming.

```json
{
  "type": "pause"
}
```

#### `resume`
Resume log streaming.

```json
{
  "type": "resume"
}
```

#### `getSince`
Request entries since a given ID.

```json
{
  "type": "getSince",
  "sinceId": 1500
}
```

#### `selectRoom`
Switch to a different room.

```json
{
  "type": "selectRoom",
  "room": "dev"
}
```

### Example WebSocket Client

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected to SmartInspect viewer');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'init':
      console.log('Initial state:', message.data);
      break;
    case 'entries':
      console.log('New entries:', message.data);
      break;
    case 'watch':
      console.log('Watch update:', message.data);
      break;
    case 'stream':
      console.log('Stream data:', message.data);
      break;
    case 'control':
      console.log('Control message:', message.data);
      break;
    case 'stats':
      console.log('Stats update:', message.data);
      break;
  }
};

// Pause streaming
ws.send(JSON.stringify({ type: 'pause' }));

// Resume streaming
ws.send(JSON.stringify({ type: 'resume' }));

// Get entries since ID 1500
ws.send(JSON.stringify({ type: 'getSince', sinceId: 1500 }));

// Switch to 'dev' room
ws.send(JSON.stringify({ type: 'selectRoom', room: 'dev' }));
```
