# Research Report: High-Frequency Metrics Handling Strategies for Real-Time Monitoring Systems
Generated: 2026-01-01

## Executive Summary

Monitoring systems like Prometheus, InfluxDB, Grafana, and VictoriaMetrics handle high-frequency metrics (100M+ samples/second) through a combination of: (1) client-side pre-aggregation to reduce ingestion volume, (2) tiered storage with automatic downsampling (raw -> 5m -> 1h resolution), (3) query-time step/resolution parameters that automatically reduce data density for longer time ranges, and (4) UI throttling via requestAnimationFrame and periodic refresh intervals (5-15 seconds) rather than per-point updates. For SmartInspect watches updating every 5ms (200/sec), the recommended approach is client-side ring buffers with periodic flush, server-side time-bucketed storage with automatic compaction, and UI updates at 60fps max using RAF throttling.

## Research Question

How do Grafana and similar monitoring tools handle high-frequency metrics data (200+ updates/second per metric), including ingestion, storage, query-time aggregation, and real-time display strategies?

## Key Findings

---

### 1. Data Ingestion Strategies

#### 1.1 Client-Side Pre-Aggregation (Before Sending to Server)

The most effective strategy for high-frequency data is **aggregating before transmission**:

**DogStatsD Pattern (Datadog)**:
- Uses a **flush interval of 10 seconds** - all values within that window are aggregated locally
- Instead of 1,000 separate API calls for a counter, sends one aggregated call
- Reduces both network overhead and server ingestion pressure
- Source: [DogStatsD Data Aggregation](https://docs.datadoghq.com/developers/dogstatsd/data_aggregation/)

**Micrometer (Java) Step Value Pattern**:
- Accumulates data for the current publishing interval (typically 10-60 seconds)
- When polled, moves current data to "previous" state
- Reports the previous state until next interval
- Automatically adapts to whether the monitoring system expects client-side or server-side aggregation
- Source: [Micrometer Rate Aggregation](https://docs.micrometer.io/micrometer/reference/concepts/rate-aggregation.html)

**Azure Application Insights Approach**:
- Pre-aggregates metrics on the client side
- Sends only count, sum, min, max, and standard deviation - not individual values
- Reduces network usage significantly
- Source: [Azure Pre-aggregated Metrics](https://learn.microsoft.com/en-us/azure/azure-monitor/app/pre-aggregated-metrics-log-metrics)

**Recommendation for SmartInspect**:
```
Client (5ms updates) -> Ring Buffer (fixed size) ->
  Aggregate every 1-10 seconds -> Send to server

Aggregation includes:
- Count of updates in window
- Min/max/avg values
- Last value (for display)
- First value (for delta calculation)
```

#### 1.2 Server-Side Ingestion Architecture

**Write-Ahead Log (WAL) + In-Memory Buffer Pattern**:
- Prometheus, InfluxDB, VictoriaMetrics all use this pattern
- Points written to WAL for durability, then to in-memory cache
- In-memory data is immediately queryable
- Periodically flushed to disk in optimized format
- Source: [InfluxDB Storage Engine](https://docs.influxdata.com/influxdb/v2/reference/internals/storage-engine/)

**Append-Only Model**:
- TSDBs avoid locks/transactional bottlenecks with append-only writes
- No updates in place - all data is immutable once written
- Enables very high write throughput
- Source: [Time Series Database Explained](https://www.influxdata.com/time-series-database/)

**Rate Limiting at Ingestion**:
- Prometheus uses `sample_limit` in scrape config to limit samples per scrape
- If memory pressure is high, Prometheus throttles ingestion (skips scrapes)
- Source: [Prometheus Storage Docs](https://prometheus.io/docs/prometheus/1.8/storage/)

**VictoriaMetrics Scale**:
- Single-node: handles 2M samples/second with 100M active time series
- Cluster: handles 100M+ samples/second
- Uses batching and buffering at vminsert layer before sending to vmstorage
- Source: [VictoriaMetrics Setup Size Guide](https://docs.victoriametrics.com/guides/understand-your-setup-size/)

---

### 2. Storage Strategies

#### 2.1 Tiered Retention with Automatic Downsampling

**Thanos Compactor Approach** (industry standard pattern):

| Resolution | Created After | Typical Retention |
|------------|---------------|-------------------|
| Raw        | Immediate     | 90 days           |
| 5-minute   | 40 hours      | 180 days          |
| 1-hour     | 10 days       | 1 year            |

Configuration:
```
--retention.resolution-raw=90d
--retention.resolution-5m=180d
--retention.resolution-1h=1y
```

**Critical Rule**: Retention for each level must be >= the age when the next downsampling pass runs, otherwise data is deleted before downsampling can complete.

Source: [Thanos Downsampling Docs](https://thanos.io/tip/components/compact.md/)

**Key Insight**: Downsampling does NOT save storage initially - it adds 2 more blocks per raw block. The benefit is **query performance** for long time ranges, not storage savings. You only save storage when raw data is eventually deleted.

#### 2.2 Compression Strategies

**Facebook Gorilla Encoding** (used by Prometheus, InfluxDB, VictoriaMetrics):
- Timestamps: Delta-of-delta encoding (most timestamps differ by constant interval)
- Values: XOR with previous value (many values change little)
- Achieves 10-12x compression for typical time series
- Source: [Optimizing Prometheus Storage](https://medium.com/@platform.engineers/optimizing-prometheus-storage-handling-high-cardinality-metrics-at-scale-31140c92a7e4)

**TSM (Time Structured Merge Tree) - InfluxDB**:
- Write to WAL -> In-memory cache -> TSM files on disk
- Compaction combines small TSM files into larger ones
- Read-optimized: values for same series organized in long runs
- Source: [InfluxDB Storage Engine](https://docs.influxdata.com/influxdb/v2/reference/internals/storage-engine/)

#### 2.3 Memory Exhaustion Prevention

**Ring Buffer Pattern** (bounded memory):
- Fixed-size circular buffer overwrites oldest data when full
- O(1) enqueue/dequeue operations
- Pre-allocated memory - no runtime allocations
- Perfect for high-frequency sensor/telemetry data
- Use power-of-2 sizes for efficient modulo operations
- Source: [Circular Buffer Guide](https://algocademy.com/blog/when-to-consider-using-a-circular-buffer-a-comprehensive-guide/)

**Recommended Memory Model for SmartInspect**:
```
Per-Watch Ring Buffer:
- Size: 1000 entries (5 seconds at 200/sec)
- When buffer fills: aggregate and persist older half
- Always keep latest N entries for immediate display

Global Memory Budget:
- Max 100MB for watch data
- Calculate: (entries_per_watch * bytes_per_entry * max_watches)
- Evict oldest aggregated data when approaching limit
```

---

### 3. Query-Time Aggregation

#### 3.1 PromQL Step Parameter

The `step` parameter controls query resolution - completely independent of data resolution:

```
Query: rate(http_requests_total[5m])
Time range: 90 days
Without step limit: 259,200 points (every 30 seconds)
With step=1h: 2,160 points (manageable for display)
```

**How Grafana Selects Step Automatically**:
1. Calculate available pixels on screen
2. Calculate time range duration
3. Choose step so result points roughly match pixel count
4. Configurable via "Min step" in data source options

Source: [PromQL Query Steps Explained](https://utcc.utoronto.ca/~cks/space/blog/sysadmin/PrometheusQuerySteps)

**Range Query Internals**:
- Evaluates the expression at each step interval from start to end time
- Each evaluation is like an independent instant query
- Result is an array of (timestamp, value) pairs
- Source: [PromQL Query Anatomy](https://promlabs.com/blog/2020/06/18/the-anatomy-of-a-promql-query/)

#### 3.2 Recording Rules (Pre-Computed Aggregations)

For expensive queries, pre-compute and store results:

```yaml
groups:
  - name: aggregations
    rules:
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)
```

Benefits:
- Query runs once at evaluation interval, stores result
- Dashboard queries just fetch pre-computed time series
- Dramatically faster for complex aggregations
- Source: [Prometheus Recording Rules](https://last9.io/blog/how-to-manage-high-cardinality-metrics-in-prometheus/)

#### 3.3 Recommended Query Strategy for SmartInspect

```
Time Range     | Resolution to Query | Aggregation
---------------|---------------------|------------------
Last 1 minute  | Raw (all points)    | None
Last 5 minutes | 100ms buckets       | avg/min/max per bucket
Last 1 hour    | 1s buckets          | avg/min/max per bucket
Last 24 hours  | 1m buckets          | avg/min/max per bucket
Last 7 days    | 5m buckets          | avg/min/max per bucket
```

---

### 4. Real-Time Display Strategies

#### 4.1 Grafana Live and Streaming

**WebSocket-Based Pub/Sub**:
- Grafana Live uses persistent WebSocket connections
- Data pushed to clients as soon as it arrives at server
- "Soft real-time" - expect 100-300ms latency
- Source: [Grafana Live Setup](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/)

**Refresh Intervals (NOT Per-Point)**:
- Default minimum: 5 seconds
- Recommended for real-time metrics: 5-15 seconds
- Logs/traces: 30-60 seconds
- Very short intervals (1s) increase server load significantly
- Source: [Grafana Refresh Rate](https://questdb.com/blog/increase-grafana-refresh-rate-frequency/)

#### 4.2 Client-Side UI Throttling

**requestAnimationFrame Pattern**:
```javascript
let pendingUpdate = null;
let rafScheduled = false;

function onWatchUpdate(data) {
  pendingUpdate = data;  // Always store latest

  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (pendingUpdate) {
        updateUI(pendingUpdate);
        pendingUpdate = null;
      }
    });
  }
}
```

Benefits:
- Automatically throttles to display refresh rate (typically 60fps = 16ms)
- Paused in background tabs (saves resources)
- Coalesces multiple updates into single render
- Source: [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

**Throttle Libraries**:
- `raf-throttle`: Invokes callback at most once per animation frame
- `frame-throttle`: Lightweight wrapper for event callbacks
- Source: [raf-throttle GitHub](https://github.com/wuct/raf-throttle)

#### 4.3 Display Buffer Pattern

```javascript
class WatchDisplayBuffer {
  constructor(maxPoints = 500) {
    this.buffer = [];
    this.maxPoints = maxPoints;
  }

  add(point) {
    this.buffer.push(point);
    if (this.buffer.length > this.maxPoints) {
      // Downsample older half to half the points
      const mid = Math.floor(this.buffer.length / 2);
      const older = this.downsample(this.buffer.slice(0, mid), mid / 2);
      const newer = this.buffer.slice(mid);
      this.buffer = [...older, ...newer];
    }
  }

  downsample(points, targetCount) {
    // Keep min/max/avg for each bucket
    const bucketSize = Math.ceil(points.length / targetCount);
    const result = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      result.push({
        time: bucket[Math.floor(bucket.length / 2)].time,
        value: average(bucket.map(p => p.value)),
        min: Math.min(...bucket.map(p => p.value)),
        max: Math.max(...bucket.map(p => p.value))
      });
    }
    return result;
  }
}
```

---

## Concrete Recommendations for SmartInspect (5ms Watch Updates = 200/sec)

### Architecture Overview

```
[Client App]                    [SmartInspect Server]              [Web Viewer]
    |                                  |                                |
    | 5ms watch updates               |                                |
    v                                  |                                |
[Client Ring Buffer]                   |                                |
    | (1000 entries = 5 sec)          |                                |
    |                                  |                                |
    | Flush every 100-500ms           |                                |
    | (batch of 20-100 points)        |                                |
    v                                  v                                |
    +----------> WebSocket ---------> [Ingestion Buffer]               |
                                       | (in-memory ring buffer)       |
                                       |                                |
                                       | Write every 1s to storage     |
                                       v                                |
                                  [Time-Bucketed Storage]              |
                                       | Raw: 1 hour                   |
                                       | 1s avg: 24 hours              |
                                       | 1m avg: 7 days                |
                                       |                                |
                                       | Query with auto-resolution    |
                                       v                                v
                                  [Query Engine] <--- WebSocket --- [Dashboard]
                                                                        |
                                                                   RAF throttle
                                                                   (max 60fps)
```

### Specific Recommendations

#### 1. Client-Side (SDK)
```
- Use ring buffer: 1000 entries (5 seconds of data)
- Flush interval: 100ms (send batch of ~20 points)
- Include in each batch:
  - All individual points (for real-time streaming)
  - OR aggregated summary (count, min, max, avg, last)
- Option for "high-frequency mode" vs "aggregated mode"
```

#### 2. Server Ingestion
```
- Accept batches, not individual points
- Write to WAL immediately for durability
- Buffer in memory for 1 second before disk write
- Memory limit: Drop oldest buffered data if exceeded
- Never block ingestion - it's better to lose old data than pause new
```

#### 3. Storage Tiers
```
Tier 1 (Hot): In-memory ring buffer
  - Last 60 seconds of raw data
  - Max 12,000 points per watch (200/sec * 60)

Tier 2 (Warm): Disk-based raw
  - 1 hour of raw data
  - Automatically aggregate to 1-second buckets when moving to cold

Tier 3 (Cold): Aggregated on disk
  - 1-second resolution: 24 hours
  - 1-minute resolution: 7 days
  - 1-hour resolution: 90 days
```

#### 4. Query-Time Resolution
```javascript
function getQueryResolution(timeRange) {
  if (timeRange <= 60)    return 'raw';      // Last 1 minute
  if (timeRange <= 3600)  return '1s';       // Last 1 hour
  if (timeRange <= 86400) return '1m';       // Last 24 hours
  return '1h';                                // 1+ days
}

// Limit max points returned
function getMaxPoints(viewportWidth) {
  return Math.min(viewportWidth * 2, 2000);
}
```

#### 5. UI Updates
```javascript
// Global update throttling
const watchUpdates = new Map();  // watchId -> latestValue
let rafId = null;

function onWatchValue(watchId, value, timestamp) {
  watchUpdates.set(watchId, { value, timestamp });

  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      rafId = null;
      for (const [id, data] of watchUpdates) {
        updateWatchDisplay(id, data);
      }
      watchUpdates.clear();
    });
  }
}

// Chart updates: maximum 10 FPS for smooth scrolling
let lastChartUpdate = 0;
function maybeUpdateChart() {
  const now = performance.now();
  if (now - lastChartUpdate > 100) {  // 100ms = 10 FPS
    lastChartUpdate = now;
    chart.update();
  }
}
```

---

## Sources

### Prometheus and PromQL
- [Downsampling & Aggregating Metrics in Prometheus](https://last9.io/blog/downsampling-aggregating-metrics-in-prometheus-practical-strategies-to-manage-cardinality-and-query-performance/)
- [Optimizing Prometheus for High Volume Metrics](https://binaryscripts.com/prometheus/2025/05/16/optimizing-prometheus-for-high-volume-metrics-collection-in-distributed-systems.html)
- [Optimizing Prometheus Storage](https://medium.com/@platform.engineers/optimizing-prometheus-storage-handling-high-cardinality-metrics-at-scale-31140c92a7e4)
- [Prometheus Storage Docs](https://prometheus.io/docs/prometheus/1.8/storage/)
- [PromQL Query Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Step and query_range](https://www.robustperception.io/step-and-query_range/)
- [How Query Steps Work](https://utcc.utoronto.ca/~cks/space/blog/sysadmin/PrometheusQuerySteps)
- [Optimizing PromQL Queries](https://cortexmetrics.io/blog/2025/04/29/optimizing-promql-queries-a-deep-dive/)

### InfluxDB
- [InfluxDB Storage Engine](https://docs.influxdata.com/influxdb/v2/reference/internals/storage-engine/)
- [Resolve High Cardinality](https://docs.influxdata.com/influxdb/v2/write-data/best-practices/resolve-high-cardinality/)
- [Time Series Database Explained](https://www.influxdata.com/time-series-database/)
- [Fixing Storage Bloat in InfluxDB](https://www.mindfulchase.com/explore/troubleshooting-tips/databases/fixing-storage-bloat-and-write-performance-issues-in-influxdb.html)

### Thanos
- [Thanos Compactor and Downsampling](https://thanos.io/tip/components/compact.md/)
- [Downsampling Resolution and Retention](https://thanos.io/v0.8/components/compact/)
- [Thanos TSDB Silent Data Loss](https://dev.to/julienlau/thanos-tsdb-how-default-configurations-can-lead-to-silent-data-loss-57jh)

### VictoriaMetrics
- [VictoriaMetrics Setup Size Guide](https://docs.victoriametrics.com/guides/understand-your-setup-size/)
- [VictoriaMetrics Key Concepts](https://docs.victoriametrics.com/victoriametrics/keyconcepts/)
- [VictoriaMetrics FAQ](https://docs.victoriametrics.com/faq/)
- [Benchmark 100M Samples/s](https://victoriametrics.com/blog/benchmark-100m/index.html)

### Grafana
- [Grafana Live Setup](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/)
- [Grafana Refresh Rate](https://questdb.com/blog/increase-grafana-refresh-rate-frequency/)
- [Grafana Observability Dashboards](https://www.groundcover.com/learn/observability/grafana-dashboards)
- [Speeding up Grafana Dashboards](https://gist.github.com/FUSAKLA/65e2c0dfafabdc60602bd7391280febc)

### Client-Side Aggregation
- [Micrometer Rate Aggregation](https://docs.micrometer.io/micrometer/reference/concepts/rate-aggregation.html)
- [DogStatsD Data Aggregation](https://docs.datadoghq.com/developers/dogstatsd/data_aggregation/)
- [Azure Pre-aggregated Metrics](https://learn.microsoft.com/en-us/azure/azure-monitor/app/pre-aggregated-metrics-log-metrics)
- [FastMetrics Client Aggregation](https://blogofsomeguy.com/a/fastmetrics-p2-client-aggregation/)

### UI Throttling
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [When Browsers Throttle RAF](https://motion.dev/blog/when-browsers-throttle-requestanimationframe)
- [raf-throttle Library](https://github.com/wuct/raf-throttle)
- [Throttling Chatty Events](https://www.kirupa.com/javascript/throttling_chatty_events.htm)

### Ring Buffers
- [Circular Buffer Wikipedia](https://en.wikipedia.org/wiki/Circular_buffer)
- [Circular Buffer Guide](https://algocademy.com/blog/when-to-consider-using-a-circular-buffer-a-comprehensive-guide/)
- [Ring Buffers in Go](https://medium.com/checker-engineering/a-practical-guide-to-implementing-a-generic-ring-buffer-in-go-866d27ec1a05)
- [Bitdrift Ring Buffer](https://bitdrift.io/buffer)

---

## Open Questions

1. **Backpressure handling**: When the server is overwhelmed, should clients buffer more, drop data, or slow down? Need to define explicit backpressure protocol.

2. **Multi-viewer synchronization**: If multiple viewers are watching the same watch, should each get their own data stream or share?

3. **Historical replay**: When a new viewer connects, how much historical data should be backfilled? All available? Last N seconds?

4. **Watch value types**: Are all watches numeric, or do we need to handle strings, objects, etc.? Aggregation strategies differ.

5. **Alerting on watches**: Should high-frequency watches support alerting? If so, need to define how to evaluate thresholds without overwhelming the alert system.
