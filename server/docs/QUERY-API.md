# SmartInspect Web Viewer - Query API Documentation

The Query API provides REST endpoints for querying logs and stream data with comprehensive filtering capabilities.

## Base URL

```
http://localhost:3000
```

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/logs/query` | GET | Query log entries with filters |
| `/api/streams/query` | GET | Query stream data |
| `/api/streams` | GET | List available stream channels |

---

## GET /api/logs/query

Query log entries from the ring buffer with comprehensive filtering options.

### Query Parameters

#### Time Filters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `from` | ISO 8601 datetime | Start time (inclusive) | `2024-01-01T10:00:00Z` |
| `to` | ISO 8601 datetime | End time (exclusive) | `2024-01-01T11:00:00Z` |
| `between` | comma-separated | Alternative time range | `2024-01-01T10:00:00Z,2024-01-01T11:00:00Z` |

#### Session Filters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `session` | string | Exact session name match | `Database` |
| `sessionContains` | string | Session name contains substring | `Auth` |
| `sessionPattern` | regex | Session name matches regex | `^User.*Service$` |
| `sessions` | comma-separated | List of session names | `Database,Auth,API` |
| `sessionInverse` | boolean | Invert session filter | `true` |

#### Message/Title Filters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `message` | string | Title contains substring | `connection failed` |
| `messagePattern` | regex | Title matches regex | `timeout.*retry` |
| `messageInverse` | boolean | Invert message filter | `true` |
| `title` | string | Title contains substring | `Error` |
| `titlePattern` | regex | Title matches regex | `^SQL.*` |

#### Level Filter

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `level` | comma-separated | Filter by log levels | `Error,Fatal` or `4,5` |

**Level Values:**
| Name | Value |
|------|-------|
| Debug | 0 |
| Verbose | 1 |
| Info/Message | 2 |
| Warning | 3 |
| Error | 4 |
| Fatal | 5 |
| Control | 6 |

#### Entry Type Filter

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `entryType` | comma-separated | Filter by entry type IDs | `100,101,102` |

#### Other Filters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `appName` | string | Filter by application name | `MyApp` |
| `appNames` | comma-separated | List of app names | `App1,App2` |
| `hostName` | string | Filter by host name | `server-01` |

#### Pagination

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | number | 1000 | 10000 | Maximum entries to return |
| `offset` | number | 0 | - | Skip first N entries |
| `order` | string | `desc` | - | Sort order: `asc` or `desc` |

### Response Format

```json
{
    "entries": [
        {
            "id": 12345,
            "type": "logEntry",
            "logEntryType": 100,
            "sessionName": "Database",
            "title": "Query executed successfully",
            "level": 2,
            "timestamp": "2024-01-01T10:30:00.000Z",
            "receivedAt": "2024-01-01T10:30:00.123Z",
            "appName": "MyApp",
            "hostName": "server-01",
            "processId": 1234,
            "threadId": 5678,
            "data": "base64encodeddata==",
            "dataEncoding": "base64"
        }
    ],
    "total": 4523,
    "returned": 100,
    "hasMore": true,
    "query": {
        "session": "Database",
        "level": "Error",
        "limit": "100"
    }
}
```

### Examples

#### Get Last 100 Errors

```bash
curl "http://localhost:3000/api/logs/query?level=Error,Fatal&limit=100"
```

#### Filter by Session

```bash
# Exact match
curl "http://localhost:3000/api/logs/query?session=Database"

# Contains substring
curl "http://localhost:3000/api/logs/query?sessionContains=Auth"

# Regex pattern
curl "http://localhost:3000/api/logs/query?sessionPattern=^User.*"

# Multiple sessions
curl "http://localhost:3000/api/logs/query?sessions=Database,Auth,API"
```

#### Inverse Filters (Exclude)

```bash
# All sessions EXCEPT Database
curl "http://localhost:3000/api/logs/query?session=Database&sessionInverse=true"

# All logs NOT containing "debug"
curl "http://localhost:3000/api/logs/query?message=debug&messageInverse=true"
```

#### Time Range Queries

```bash
# Logs from a specific time
curl "http://localhost:3000/api/logs/query?from=2024-01-01T10:00:00Z"

# Logs before a specific time
curl "http://localhost:3000/api/logs/query?to=2024-01-01T11:00:00Z"

# Logs between two times
curl "http://localhost:3000/api/logs/query?from=2024-01-01T10:00:00Z&to=2024-01-01T11:00:00Z"

# Using 'between' shorthand
curl "http://localhost:3000/api/logs/query?between=2024-01-01T10:00:00Z,2024-01-01T11:00:00Z"
```

#### Combined Filters

```bash
# Errors in Database session in last hour
curl "http://localhost:3000/api/logs/query?session=Database&level=Error&from=2024-01-01T10:00:00Z"

# All non-debug logs except internal sessions
curl "http://localhost:3000/api/logs/query?level=Info,Warning,Error,Fatal&sessionPattern=^Internal&sessionInverse=true"

# Search for timeout errors excluding test sessions
curl "http://localhost:3000/api/logs/query?message=timeout&level=Error&sessionContains=Test&sessionInverse=true"
```

#### Pagination

```bash
# First page
curl "http://localhost:3000/api/logs/query?limit=100&offset=0"

# Second page
curl "http://localhost:3000/api/logs/query?limit=100&offset=100"

# Oldest first
curl "http://localhost:3000/api/logs/query?limit=100&order=asc"
```

---

## GET /api/streams/query

Query stream data (high-frequency metrics/events) with stricter limits.

### Query Parameters

| Parameter | Type | Required | Default | Max | Description |
|-----------|------|----------|---------|-----|-------------|
| `channel` | string | **Yes** | - | - | Stream channel name |
| `from` | ISO datetime | No | - | - | Start time |
| `to` | ISO datetime | No | - | - | End time |
| `limit` | number | No | 100 | 1000 | Max entries |
| `offset` | number | No | 0 | - | Skip first N entries |
| `order` | string | No | `desc` | - | Sort order |

### Response Format

```json
{
    "channel": "metrics",
    "entries": [
        {
            "id": 1706789012345,
            "channel": "metrics",
            "data": "cpu=45.2",
            "timestamp": "2024-01-01T10:30:00.000Z",
            "sessionName": "Monitor"
        }
    ],
    "total": 50000,
    "returned": 100,
    "warning": "Stream data limited to 1000 entries per request"
}
```

### Examples

```bash
# Get last 100 metrics
curl "http://localhost:3000/api/streams/query?channel=metrics&limit=100"

# Time-filtered stream data
curl "http://localhost:3000/api/streams/query?channel=performance&from=2024-01-01T10:00:00Z"
```

---

## GET /api/streams

List all available stream channels.

### Response Format

```json
{
    "channels": [
        { "channel": "metrics", "count": 15000 },
        { "channel": "performance", "count": 8500 },
        { "channel": "events", "count": 2300 }
    ]
}
```

### Example

```bash
curl "http://localhost:3000/api/streams"
```

---

## Error Responses

### 400 Bad Request

```json
{
    "error": "Missing required parameter",
    "message": "channel parameter is required"
}
```

### 500 Internal Server Error

```json
{
    "error": "Query failed",
    "message": "Invalid regex pattern"
}
```

---

## Debugging Workflows

### 1. Find Recent Errors

```bash
# Get all errors from the last 5 minutes
FIVE_MIN_AGO=$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
curl "http://localhost:3000/api/logs/query?level=Error,Fatal&from=$FIVE_MIN_AGO"
```

### 2. Trace a Specific Session

```bash
# All logs from a specific session, oldest first
curl "http://localhost:3000/api/logs/query?session=UserAuth&order=asc&limit=500"
```

### 3. Search for Error Patterns

```bash
# Find timeout-related errors
curl "http://localhost:3000/api/logs/query?messagePattern=timeout|connection.*refused&level=Error"
```

### 4. Compare Sessions

```bash
# Get errors from Database session
curl "http://localhost:3000/api/logs/query?session=Database&level=Error" > db_errors.json

# Get errors from all other sessions
curl "http://localhost:3000/api/logs/query?session=Database&sessionInverse=true&level=Error" > other_errors.json
```

### 5. Monitor High-Frequency Data

```bash
# Check available streams
curl "http://localhost:3000/api/streams"

# Sample recent metrics
curl "http://localhost:3000/api/streams/query?channel=metrics&limit=50"
```

---

## Using with jq

### Count Errors by Session

```bash
curl -s "http://localhost:3000/api/logs/query?level=Error&limit=10000" | \
  jq '.entries | group_by(.sessionName) | map({session: .[0].sessionName, count: length})'
```

### Get Unique Error Messages

```bash
curl -s "http://localhost:3000/api/logs/query?level=Error&limit=1000" | \
  jq '[.entries[].title] | unique'
```

### Timeline of Errors

```bash
curl -s "http://localhost:3000/api/logs/query?level=Error&order=asc&limit=100" | \
  jq '.entries[] | "\(.timestamp) [\(.sessionName)] \(.title)"'
```

---

## Rate Limiting

Currently no rate limiting is implemented. For production use, consider:
- Adding rate limiting middleware
- Caching frequent queries
- Limiting maximum time ranges

---

## Performance Considerations

1. **Use appropriate limits** - Start with smaller limits (100-500) and increase if needed
2. **Filter early** - Use session/level filters to reduce data before pagination
3. **Avoid full-text regex** - Pattern matching on messages scans all entries
4. **Stream queries are limited** - Max 1000 entries per request for high-volume data
5. **Time filters help** - Narrow time ranges significantly improve query speed
