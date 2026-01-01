# Thread Lines Visualization - Design Document

## Date: 2025-12-11

---

## Core Concept

Thread Lines is a visual panel to the LEFT of the log grid that shows **vertical swimlanes** representing active contexts. It helps developers:

1. **Follow one flow** through interleaved concurrent logs
2. **See parallelism** at a glance
3. **Spot lifecycle events** - when contexts spawn, end, or fail
4. **Debug distributed systems** - trace requests across services

---

## Visual Design

```
┌─ Thread Lines ──────────────────┐
│ [+ Add] [user ×] [block ×]      │  ← User selects which keys to show
├─────────────────────────────────┤
│ U │ B │                         │  ← Column headers (abbreviated)
│ ┃ │ ┃ │  ← row 1: user:A, block:001 (both active)
│ ┃ │ ┃ │  ← row 2: user:A, block:001 (continuing)
│ ┃ │   │  ← row 3: user:A, block:001 ended
│   │ ┃ │  ← row 4: user:A ended, block:002 started
│ ┃ │ ┃ │  ← row 5: user:B (new color), block:002
└─────────────────────────────────┘
```

### Lifecycle Visualization

```
│ A B C │ Time      Title
│ ┃     │ 10:00:01  Thread A started        ← A spawns (line begins)
│ ┃ ┃   │ 10:00:02  Thread B started        ← B spawns
│ ┃ ┃   │ 10:00:03  Thread A doing work     ← A continues
│ ┃ ┃ ┃ │ 10:00:04  Thread C started        ← C spawns
│ ┃   ┃ │ 10:00:05  Thread B ended          ← B ends (line stops)
│ ┃   ┃ │ 10:00:06  Thread A doing work
│     ┃ │ 10:00:07  Thread A ended          ← A ends
│     ┃ │ 10:00:08  Thread C still going
```

---

## Use Cases

### 1. Single App - Multi-threaded
```
User debugging: "Why is my app slow?"

│ T1 T2 T3 │ Time      Title
│ ┃        │ 10:00:01  Main thread init
│ ┃  ┃     │ 10:00:02  Spawned worker thread
│ ┃  ┃  ┃  │ 10:00:03  Spawned another worker
│ ┃  ┃  ┃  │ 10:00:04  Worker 1 processing
│ ┃     ┃  │ 10:00:05  Worker 2 blocked!      ← See T2 ended early
│ ┃     ┃  │ 10:00:06  Worker 3 still working
```
Context: `threadId` or custom `worker:1`, `worker:2`

### 2. Web App - Concurrent Requests
```
User debugging: "Request X is slow but Y is fast"

│ R1 R2 R3 │ Time      Title
│ ┃        │ 10:00:01  Request from user A
│ ┃  ┃     │ 10:00:02  Request from user B
│ ┃  ┃     │ 10:00:03  R1: DB query
│ ┃  ┃     │ 10:00:04  R1: DB query (still!)  ← R1 stuck in DB
│    ┃     │ 10:00:05  R2: Completed fast
│ ┃        │ 10:00:06  R1: Finally done
```
Context: `requestId`, `userId`, `sessionId`

### 3. Microservices - Distributed Tracing
```
User debugging: "Where did the request fail?"

│ API GW │ Auth │ Orders │ Payment │
│   ┃    │      │        │         │ Request enters API Gateway
│   ┃    │  ┃   │        │         │ → Auth service
│   ┃    │  ┃   │        │         │ Auth validating
│   ┃    │      │   ┃    │         │ → Orders service
│   ┃    │      │   ┃    │   ┃     │ → Payment service
│   ┃    │      │   ┃    │   ✗     │ Payment FAILED!
│   ┃    │      │   ┃    │         │ Orders rolling back
│   ┃    │      │        │         │ Response sent
```
Context: `traceId`, `service`, `spanId`

### 4. Data Pipeline - Batch Processing
```
User debugging: "Which batch is stuck?"

│ B1 B2 B3 │ Stage     │ Title
│ ┃        │ Extract   │ Batch 1 started
│ ┃  ┃     │ Extract   │ Batch 2 started
│ ┃  ┃     │ Transform │ Batch 1 transforming
│ ┃  ┃  ┃  │ Extract   │ Batch 3 started
│    ┃  ┃  │ Transform │ Batch 1 DONE
│    ┃  ┃  │ Load      │ Batch 2 stuck!       ← B2 never progresses
│       ┃  │ Transform │ Batch 3 moving on
```
Context: `batchId`, `stage`, `sourceFile`

### 5. IoT / Multi-Device
```
User debugging: "Which device is failing?"

│ D1 D2 D3 │ Time      Title
│ ┃  ┃  ┃  │ 10:00:01  All devices online
│ ┃  ┃  ┃  │ 10:00:02  Heartbeats OK
│ ┃     ┃  │ 10:00:03  Device 2 disconnected!
│ ┃     ┃  │ 10:00:04  Device 1 reporting
│ ┃  ┃  ┃  │ 10:00:05  Device 2 reconnected
```
Context: `deviceId`, `location`, `firmware`

### 6. Queue Processing - Workers
```
User debugging: "Are workers balanced?"

│ W1 W2 W3 W4 │ Queue │ Title
│ ┃  ┃  ┃  ┃  │  100  │ All workers active
│ ┃  ┃  ┃  ┃  │   80  │ Processing...
│ ┃  ┃        │   60  │ W3,W4 idle - starving?
│ ┃  ┃        │   40  │ Only 2 workers busy
│ ┃           │   20  │ Just W1 now
```
Context: `workerId`, `queueName`, `jobType`

---

## Common Patterns

| Scenario | Primary Context | Secondary Context | What to visualize |
|----------|----------------|-------------------|-------------------|
| Multi-thread | `threadId` | `taskName` | Thread lifecycle |
| Web requests | `requestId` | `userId`, `endpoint` | Request flow |
| Microservices | `traceId` | `service`, `spanId` | Cross-service flow |
| Batch jobs | `batchId` | `stage` | Pipeline progress |
| Devices | `deviceId` | `eventType` | Device connectivity |
| Workers | `workerId` | `jobId` | Load distribution |

---

## UI Interactions

1. **Click on colored block** → Fade mode for that context value
2. **Double-click** → Filter mode (hide non-matching)
3. **Click on column header** → Dropdown showing all values for that key
4. **Hover on block** → Tooltip with full context value
5. **[×] button** → Remove column
6. **[+ Add] button** → Dropdown of available context keys

---

## UI States

1. **Normal View**: All context lines shown, all rows visible
2. **Hover on Line**: Tooltip shows context details
3. **Click on Line**: Fade mode - non-matching rows at 30% opacity
4. **Double-Click**: Filter mode - hide non-matching rows
5. **Ctrl+Click**: Add to selection (multiple contexts)

---

## Configuration

```
Settings → Thread Lines:
  [x] Show Thread Lines panel

  Columns:
    [x] requestId   Color: Auto    Position: 1
    [x] service     Color: Auto    Position: 2
    [ ] userId      (hidden)
    [+ Add column for tag...]

  Display:
    [ ] Show only active in viewport
    [x] Show lifecycle (spawn/end markers)
    [ ] Compact mode (narrower columns)
```

---

## Color Assignment

For many concurrent contexts, use automatic color cycling based on value hash:

```typescript
function getContextColor(contextType: string, value: string): string {
  const hash = hashString(`${contextType}:${value}`);
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
```

---

## Handling High Cardinality

When there are 100s of unique values:

1. **In Viewport Only**: Only show context lines for entries in current viewport
2. **Collapse Similar**: Group contexts with same pattern
3. **Search/Filter**: Add search box to find specific context
4. **Recent/Active**: Show recently active contexts at top

---

## Features to Support

1. **Multiple context keys** as columns (user selects which)
2. **Lifecycle visualization** (spawn/active/end)
3. **Hierarchy** (service → spans, batch → stages)
4. **Cross-reference** - click on traceId, see ALL services involved
5. **Gaps detection** - spot when a context disappears unexpectedly
6. **Grouping/nesting** - optional hierarchical view

---

## Implementation Phases

### Phase 1: Basic Thread Lines Panel
- Left panel with configurable columns
- Sync scroll with grid
- Color by value hash
- Click to fade

### Phase 2: Lifecycle Markers
- Detect first/last occurrence of each value
- Visual markers for spawn/end
- Highlight gaps/disconnections

### Phase 3: Advanced Features
- Hierarchy/nesting support
- Statistics (duration, entry count)
- Export/share specific thread view

---

## Integration with Existing Features

| Existing Feature | How it integrates |
|-----------------|-------------------|
| Context Panel (right) | Browse/search contexts, Thread Lines for visual |
| Correlation highlighting | Thread Lines ADD to it, not replace |
| Filter panel | Thread Lines clicks create filter rules |
| Fade mode | Shared implementation |
| Column ribbon | Can coexist or be replaced by Thread Lines |
