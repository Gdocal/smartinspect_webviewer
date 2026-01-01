# Async Context Visualization - Ideas Evolution

## Date: 2025-12-11

---

## The Problem Statement

When viewing logs from high-concurrency systems (e.g., shop processing 10 users/sec, parallel file parser),
log entries from different logical operations interleave, making it hard to:
1. Follow one specific request/operation through the system
2. Understand what's happening in parallel
3. Debug issues that span multiple components
4. See parent-child relationships between operations

---

## Terminology Confusion (TO BE CLARIFIED)

We use several terms that may overlap or confuse:

| Term | What it might mean | SmartInspect context |
|------|-------------------|---------------------|
| **Thread** | OS thread (ThreadId in logs) | Physical execution unit |
| **Process** | OS process (ProcessId in logs) | Physical process boundary |
| **Operation** | Logical unit of work | `operationName` field |
| **Correlation** | Group of related log entries | `correlationId` field |
| **Async Context** | Logical flow across async/await | What we're trying to track |
| **Request** | HTTP request or similar | One type of correlation |
| **Task** | C# Task / JS Promise | Implementation detail |

**Key Question**: What exactly do we want to visualize?
- Physical threads? (ThreadId)
- Logical operations? (correlationId + operationName)
- Request flows? (one correlationId from start to end)
- Parent-child spawning? (operation A spawns B, C, D)

---

## Current Protocol (v2)

```typescript
interface AsyncContextFields {
  correlationId?: string;      // Groups related async operations (GUID)
  operationName?: string;      // Current operation name within async flow
  operationDepth?: number;     // Async nesting level (0 = root)
}
```

**What this enables:**
- Group entries by correlationId
- Show nesting depth
- Filter to single correlation

**What this CANNOT do:**
- Know if correlation A spawned correlation B
- Know when an operation started vs ended
- Calculate operation duration
- Build hierarchy tree of related correlations

---

## Ideas Evolution

### Phase 1: Basic Features (Implemented)

1. ✅ **Grid columns** for correlationId, operationName, operationDepth
2. ✅ **Correlation highlighting** - auto-color entries by correlationId
3. ✅ **Depth indentation** - visual indent in title column based on operationDepth
4. ✅ **Filter by correlation** - context menu "Show Related (Async Flow)"
5. ✅ **Correlation filter in FilterPanel** - filter rules for correlationId

### Phase 2: Initial Creative Ideas

1. **Swimlane/Column View** - Each correlation gets its own column
   ```
   Thread A    │ Thread B    │ Thread C
   [Start]     │             │
     └─Op1     │ [Start]     │
   ```

2. **Color-coded Thread Lanes** - Thin color bar on left per correlation

3. **Focus Mode** - Already implemented via "Show Related (Async Flow)"

4. **Smart Grouping/Collapsing** - Group by correlationId, show collapsed
   ```
   ▶ Operation A (correlation: abc123) - 15 entries, 234ms
   ▶ Operation B (correlation: def456) - 8 entries, 120ms
   ```

5. **Thread Ribbon/Timeline** - Compact timeline at top showing active correlations

6. **Alternating Background** - Each correlation gets subtle background tint (✅ implemented)

7. **Virtual Columns per Correlation** - Transform data to side-by-side parallel ops

### Phase 3: User Ideas (High-Concurrency Focus)

User observation: "We can have really a lot of parallel processes - 10 users/sec, parallel parser with 10 files..."

1. **Separate View for Parallel Processes**
   - Dedicated view showing all parallel operations
   - Click on one → fade out unrelated items in main grid

2. **Smart Thread Lines (Vertical Ribbons)**
   - Vertical lines near grid showing logical contexts
   - Only display threads active in current viewport
   - Expandable to show all vs active only
   - Click line → fade/hide unrelated rows
   - Handle complex cases: spawning, collapsing, merging

3. **Fade Modes**
   - Fade 50% non-related items
   - Completely hide non-related items
   - Option to choose behavior

### Phase 4: Synthesized Ideas

1. **Correlation Explorer Panel** (Left sidebar)
   ```
   ┌─ Active Correlations ──────────────┐
   │ 🔍 Filter...                       │
   │ ▼ Currently Active (12)            │
   │   ● ProcessOrder-abc  [3 entries]  │
   │   ● SendEmail-def     [2 entries]  │
   │ ▼ Recently Completed (50)          │
   │   ○ ProcessOrder-xyz  234ms        │
   └────────────────────────────────────┘
   ```
   - Click = highlight (others fade)
   - Double-click = filter (hide others)
   - Shows parent/child relationships

2. **Thread Lines (Vertical Context Ribbons)**
   ```
   │A│B│C│ Time     Title
   │█│ │ │ 10:00:01 Start ProcessOrder
   │█│█│ │ 10:00:02 Start SendEmail
   │█│█│ │ 10:00:03 Email: Format body
   ```
   - Dynamic: only shows threads in viewport
   - Collapsible
   - Click = fade/filter

3. **Multiple View Modes**
   | Use Case | Best View |
   |----------|-----------|
   | What's happening now? | Live grid + highlighting |
   | Debug one request | Correlation filter |
   | See parallel work | Timeline/Waterfall |
   | Find slow operations | Statistics + sort |
   | Understand spawning | Hierarchy tree |

4. **Smart Fade/Filter Modes**
   - Highlight: others at 50% opacity
   - Fade: others at 20%, smaller font
   - Filter: hide others completely
   - Context: show selected + N entries before/after

5. **Correlation Hierarchy Tree**
   ```
   ProcessOrder (abc123) ─────────────────────┐
   ├── ValidateCart (child-1)                 │ 50ms
   ├── ChargePayment (child-2) ──────────┐    │
   │   ├── CheckFraud (grandchild-1)     │    │ 200ms
   │   └── ProcessStripe (grandchild-2)  │    │
   └── UpdateInventory (child-4)              │ 45ms
   ```

---

## Protocol Enhancement Proposals

### Option A: Minimal - Add Parent Reference
```typescript
interface AsyncContextV3 {
  correlationId: string;
  operationName?: string;
  operationDepth: number;

  // NEW
  parentCorrelationId?: string;  // Who spawned this correlation?
}
```

### Option B: Full - Add Lifecycle + Hierarchy
```typescript
interface AsyncContextV3 {
  correlationId: string;
  operationName?: string;
  operationDepth: number;

  // Hierarchy
  parentCorrelationId?: string;
  rootCorrelationId?: string;    // Ultimate ancestor

  // Lifecycle
  operationPhase?: 'start' | 'progress' | 'end' | 'error';
  operationId?: string;          // Unique operation instance
  operationStartTime?: number;   // For duration calculation

  // Semantic hints
  correlationType?: 'request' | 'background' | 'scheduled' | 'spawned';
}
```

---

## What We CAN Solve (with current + proposed features)

1. ✅ "Show me all logs from this specific request"
2. ✅ "Highlight related entries visually"
3. ⏳ "Show me what's running in parallel right now"
4. ⏳ "How long did this operation take?"
5. ⏳ "What operations did this request spawn?"
6. ⏳ "Show me the hierarchy of nested operations"

## What We CANNOT Solve (fundamental limitations)

1. **Cross-process correlation** - If request goes to microservice, we lose correlation
   (unless external correlation ID is passed and logged)
2. **Non-instrumented code** - Operations that don't use AsyncContext won't appear
3. **Very high cardinality** - 1000s of correlations/sec may overwhelm UI
4. **Historical correlation** - Can't build hierarchy if parent logs are trimmed

---

## Open Questions

1. What's the primary use case?
   - Debugging one specific request? → Focus on filtering/highlighting
   - Understanding system behavior? → Focus on timeline/waterfall
   - Finding performance issues? → Focus on statistics/duration

2. How many concurrent correlations is "normal"?
   - 10s? UI can show all
   - 100s? Need filtering/grouping
   - 1000s? Need aggregation/sampling

3. Should we track physical threads or logical contexts?
   - ThreadId = what OS sees
   - CorrelationId = what developer cares about
   - Both? How to reconcile?

4. What about thread pool reuse?
   - Same ThreadId may serve different correlations
   - Same correlation may hop between threads

---

## Next Steps

1. [ ] Clarify terminology - what exactly are we visualizing?
2. [ ] Define primary use cases with concrete examples
3. [ ] Decide on protocol changes (if any)
4. [ ] Prioritize features based on use cases
5. [ ] Prototype simplest useful feature first

---

## Real-World Example: Multi-Source Data Collector

### System Architecture
```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │  WS Subscription │    │  Data Collector  │    │  File Writer   │ │
│  │     Manager      │    │                  │    │                │ │
│  │  WS1 ─┐         │    │  Block 1:        │    │  file001.json  │ │
│  │  WS2 ─┼─ events │───▶│    ├─ Source A   │───▶│  file002.json  │ │
│  │  WS3 ─┤         │    │    ├─ Source B   │    │  ...           │ │
│  │  WS4 ─┘         │    │    └─ Source C   │    │  file999.json  │ │
│  └──────────────────┘    └──────────────────┘    └────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Multiple Dimensions to Track
- WebSocket: WS1, WS2, WS3, WS4
- Data Block: Block-001, Block-002, ...
- Data Source: SourceA, SourceB, SourceC
- Output File: file001.json, file999.json
- Subsystem: WSManager, Collector, Writer

### Proposed: Context Tags (alongside correlationId)

```typescript
interface LogEntry {
  // Existing
  correlationId?: string;      // Primary flow (e.g., block lifecycle)
  operationName?: string;
  operationDepth?: number;

  // NEW: Flexible context tags
  contextTags?: Record<string, string>;
  // Example: { block: "045", source: "B", ws: "WS2", file: "file500" }
}
```

### C# API Design (Easy & Flexible)

```csharp
// Scoped context (auto-clears when disposed)
using (Si.BeginScope("block", "045"))
{
    Si.LogMessage("Processing started");
    Si.LogMessage("Processing complete");
}

// Or with multiple tags
using (Si.BeginScope(new { block = "045", source = "B", ws = "WS2" }))
{
    _log.LogMessage("Processing data");
}
```

---

## UI Design: Context Lines & Fade System

### Concept: Context Lines Panel (Left of Grid)

```
┌─ Context ─┐┌─────────────────────────────────────────────────────┐
│           ││ Time      Level  Title                              │
│ B W S     ││──────────────────────────────────────────────────── │
│ █         ││ 10:00:01  INF    [WSManager] Connected to WS1       │
│ █ █       ││ 10:00:02  INF    [WSManager] Connected to WS2       │
│ █ █ █     ││ 10:00:03  INF    [Collector] Block-001 started      │
│ █ █ █     ││ 10:00:04  DBG    [Collector] Received SourceA       │
│   █ █     ││ 10:00:05  DBG    [Collector] Received SourceB       │
│ █   █     ││ 10:00:06  DBG    [Collector] Received SourceC       │
│ █         ││ 10:00:07  INF    [Collector] Block-001 complete     │
│ █     █   ││ 10:00:08  INF    [Writer] Writing file001.json      │
│       █   ││ 10:00:09  INF    [Writer] Write complete            │
└───────────┘└─────────────────────────────────────────────────────┘
 │ │ │ │
 │ │ │ └─ File context (file001, file002...)
 │ │ └─── Source context (A, B, C)
 │ └───── WS context (WS1, WS2...)
 └─────── Block context (001, 002...)
```

### UI States

1. **Normal View**: All context lines shown, all rows visible
2. **Hover on Line**: Tooltip shows context details
3. **Click on Line**: Fade mode - non-matching rows at 30% opacity
4. **Double-Click**: Filter mode - hide non-matching rows
5. **Ctrl+Click**: Add to selection (multiple contexts)

### Context Lines Panel Design

```
┌─ Contexts ──────────────────────────┐
│ [Show: ▼ Active in viewport]        │
│                                     │
│ block                               │
│  ├─ █ 001  (5 entries) [click=fade] │
│  ├─ █ 002  (3 entries)              │
│  └─ ░ 003  (12 entries, scrolled)   │
│                                     │
│ ws                                  │
│  ├─ █ WS1  (8 entries)              │
│  └─ █ WS2  (4 entries)              │
│                                     │
│ source                              │
│  ├─ █ A    (6 entries)              │
│  ├─ █ B    (4 entries)              │
│  └─ █ C    (5 entries)              │
│                                     │
│ [+ Add context filter]              │
└─────────────────────────────────────┘
```

### Vertical Lines Implementation

For the compact vertical lines view:

```
┌───┬────────────────────────────────────────┐
│BWS│ Time      Title                        │
├───┼────────────────────────────────────────┤
│█  │ 10:00:01  Block-001 started            │  ← Block 001 active
│██ │ 10:00:02  Received from SourceA        │  ← Block 001 + WS1
│██ │ 10:00:03  Received from SourceB        │  ← Block 001 + WS2
│█ █│ 10:00:04  Block-002 started            │  ← Block 001 + Block 002
│ ██│ 10:00:05  Block-001 complete           │  ← Block 002 + WS1
│ █ │ 10:00:06  Writing file001.json         │  ← Block 002 only
└───┴────────────────────────────────────────┘

Legend:
  Column 1 (B): Block context - color per block ID
  Column 2 (W): WebSocket context - color per WS
  Column 3 (S): Source context - color per source
```

### Dynamic Context Columns

User can configure which context tags become columns:

```
Settings → Context Lines:
  [x] block    Color: Auto    Position: 1
  [x] ws       Color: Auto    Position: 2
  [ ] source   (hidden)
  [ ] file     (hidden)
  [+ Add column for tag...]
```

### Fade/Filter Behavior

When user clicks on context line "Block 001":

**Fade Mode (default)**:
```
│█  │ 10:00:01  Block-001 started            │  ← 100% opacity
│██ │ 10:00:02  Received from SourceA        │  ← 100% opacity
│ █ │ 10:00:03  Block-002 started            │  ← 30% opacity, grayed
│██ │ 10:00:04  Block-001 received SourceB   │  ← 100% opacity
│ █ │ 10:00:05  Block-002 received SourceA   │  ← 30% opacity, grayed
```

**Filter Mode (double-click or toggle)**:
```
│█  │ 10:00:01  Block-001 started            │
│██ │ 10:00:02  Received from SourceA        │
│██ │ 10:00:04  Block-001 received SourceB   │
(Block-002 rows completely hidden)
```

### Color Assignment

For many concurrent contexts (100s of blocks), use automatic color cycling:

```typescript
function getContextColor(contextType: string, value: string): string {
  // Hash the value to get consistent color
  const hash = hashString(`${contextType}:${value}`);
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 85%)`; // Pastel colors
}
```

### Handling High Cardinality

When there are 100s of unique values:

1. **In Viewport Only**: Only show context lines for entries in current viewport
2. **Collapse Similar**: Group contexts with same pattern
   ```
   block
     ├─ █ 001-010  (grouped, 45 entries)
     ├─ █ 011      (selected, expanded)
     └─ █ 012-099  (grouped, 230 entries)
   ```
3. **Search/Filter**: Add search box to find specific context
4. **Recent/Active**: Show recently active contexts at top

### Integration with Existing Features

| Existing Feature | How it integrates |
|-----------------|-------------------|
| Correlation highlighting | Context lines ADD to it, not replace |
| Filter panel | Context clicks create filter rules |
| "Show Related" context menu | Uses context tags too |
| Highlights panel | Can create highlight rules from context |

---

## Implementation Phases

### Phase 1: Protocol + Basic UI
- Add contextTags to protocol
- Update C# client with BeginScope API
- Show context tags in detail panel
- Add context tag columns to grid

### Phase 2: Context Lines Panel
- Left sidebar showing active contexts
- Click to fade non-matching rows
- Double-click to filter

### Phase 3: Vertical Lines
- Compact vertical ribbons next to grid
- Configurable which tags become lines
- Color coding

### Phase 4: Advanced
- Context hierarchy (block contains sources)
- Timeline view with context swimlanes
- Statistics per context
