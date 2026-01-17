# SmartInspect Watch Labels System

This document describes the Prometheus-style label system for SmartInspect watches, enabling multi-dimensional metric tracking.

## Problem Solved

Previously, when multiple instances (e.g., `BTC_trade`, `ETH_trade`, `SOL_trade`) wrote the same metric name (`strategy_exitReason`), values would overwrite each other, making it impossible to track per-instance state.

## Solution

Watches now support labels (key-value pairs) that create unique series:
```
strategy_exitReason                        # Base metric (no labels)
strategy_exitReason{instance="BTC_trade"}  # BTC instance
strategy_exitReason{instance="ETH_trade"}  # ETH instance
strategy_exitReason{instance="SOL_trade",env="prod"}  # SOL with env label
```

## Protocol Version

Watch packets support three protocol versions:
- **v1 (legacy)**: 20-byte header, no group or labels
- **v2 (with group)**: 24-byte header, group field for simple instance identification
- **v3 (with labels)**: 28-byte header, native labels dictionary

### v3 Packet Format
```
Header (28 bytes):
  - nameLen(4)
  - valueLen(4)
  - watchType(4)
  - timestamp(8)
  - groupLen(4)      # Legacy, for backwards compatibility
  - labelsLen(4)     # NEW: Length of JSON-encoded labels

Data:
  - name[nameLen]
  - value[valueLen]
  - group[groupLen]
  - labels[labelsLen]  # NEW: JSON string like {"instance":"BTC","env":"prod"}
```

## C# Client Usage

### 1. Simple Usage (Recommended for most users)
Use the existing `group` parameter - it automatically becomes an `instance` label:

```csharp
// Simple: group parameter becomes instance label
session.Watch("strategy_exitReason", "take_profit", "BTC_trade");
// Stored as: strategy_exitReason{instance="BTC_trade"}

session.Watch("strategy_pnl", 1250.50, "ETH_trade");
// Stored as: strategy_pnl{instance="ETH_trade"}
```

### 2. Fluent API (Advanced users)
For full label control with native protocol support:

```csharp
using Gurock.SmartInspect;

// Fluent builder pattern - labels sent natively in protocol
session.Metric("strategy_exitReason")
       .ForInstance("BTC_trade")           // Shorthand for .WithLabel("instance", "BTC_trade")
       .WithLabel("env", "prod")
       .Set("take_profit");
// Stored as: strategy_exitReason{env="prod",instance="BTC_trade"}

// Numeric values
session.Metric("strategy_pnl")
       .ForInstance("ETH_trade")
       .Set(1250.50);
```

### 3. Dictionary API (Programmatic labels)

```csharp
var labels = new Dictionary<string, string>
{
    ["instance"] = "BTC_trade",
    ["env"] = "prod",
    ["strategy"] = "momentum"
};
session.WatchWithLabels("strategy_exitReason", "take_profit", labels);
```

### 4. Direct Watch Packet (Low-level)

```csharp
// Create Watch with native labels
var watch = new Watch(WatchType.Float)
{
    Name = "strategy_pnl",
    Value = "1250.50",
    Timestamp = DateTime.Now
};
watch.ForInstance("BTC_trade")
     .WithLabel("env", "prod");

session.SendWatch(Level.Debug, watch);
```

## Performance Considerations

Labels are serialized as JSON with each watch update. For high-frequency metrics:

1. **Keep labels minimal** - 1-3 labels is typical
2. **Keep label values short** - `instance="BTC"` not `instance="bitcoin-trading-instance-primary"`
3. **Labels should be constant** per series - don't change labels per update

Typical overhead: ~30-50 bytes per watch (e.g., `{"instance":"BTC_trade"}`)
At 200 updates/second, this adds ~10KB/s - negligible for most use cases.

## Web Viewer Usage

### Dashboard Variables

1. Go to MetricsView and enter Edit mode
2. Click "Add Variable"
3. Select "Label Values" type
4. Choose a label name (e.g., "instance")
5. The dropdown will auto-populate with available values

### Panel Queries

Panels can query specific series using the full series key:
- `strategy_exitReason{instance="BTC_trade"}` - Single instance
- `strategy_exitReason` - Query all instances

When dashboard variables are defined, panels can use them:
- Configure panel query with `labelFilters: { instance: "$instance" }`
- The `$instance` will be replaced with the variable's current value

## API Endpoints

### GET /api/watches
Returns all current watch values with labels.

Query params:
- `metric` - Filter by metric name (supports `*` wildcard)
- `labels` - JSON-encoded label matchers

### GET /api/watches/labels
Returns available label names.

### GET /api/watches/labels/:name/values
Returns values for a specific label (for dropdown options).

### GET /api/watches/metrics
Returns unique metric names.

### GET /api/watches/:seriesKey/history
Returns history for a specific series. The seriesKey can be URL-encoded (e.g., `strategy_exitReason%7Binstance%3D%22BTC_trade%22%7D`).

## Internal Format

### Series Key Format
Follows Prometheus convention:
```
metricName{label1="value1",label2="value2"}
```
Labels are sorted alphabetically for consistent key generation.

### Protocol Transport
Labels are now sent natively in the v3 protocol as a JSON-encoded field.
This is more efficient and proper than the previous JSON-in-group hack.

### Legacy Support
For backwards compatibility:
- v2 clients sending `group` field: Server parses as `instance` label
- v1 clients without group: Metric stored without labels
- v3 clients with native labels: Full label support

## Comparison: Labels vs Context (Ctx)

| Feature | Labels (Watch) | Context (LogEntry) |
|---------|----------------|-------------------|
| Purpose | Metric series identification | Log entry filtering/tracing |
| Typical size | 1-3 keys, short values | Many keys, rich values |
| Performance | High-frequency updates | Per-log-entry |
| Examples | `instance`, `env` | `user_id`, `request_id`, `trace_id` |

Both use `Dictionary<string, string>` and JSON serialization, but serve different purposes.
