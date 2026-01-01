# Context Tracking Implementation Plan

## Overview

Add flexible context tracking to SmartInspect that allows:
1. Tracking logical flows across async operations (existing correlationId)
2. Multi-dimensional context tags (NEW: block, user, ws, file, etc.)
3. UI that scales from simple use (no contexts) to complex (1000s of contexts)

---

## Design Principles

1. **Progressive Disclosure**: Simple by default, advanced when needed
2. **Scale Gracefully**: Handle 1-10 contexts easily, 1000s without breaking
3. **Non-Intrusive**: Existing users see no change unless they use contexts
4. **Flexible**: User defines what contexts matter to them

---

## Protocol Changes

### Current Protocol (v2)
```typescript
interface LogEntry {
  // ... existing fields ...
  correlationId?: string;      // Groups related async operations
  operationName?: string;      // Current operation name
  operationDepth?: number;     // Nesting level
}
```

### New Protocol (v3)
```typescript
interface LogEntry {
  // ... existing fields ...

  // Async context (unchanged)
  correlationId?: string;
  operationName?: string;
  operationDepth?: number;

  // NEW: Flexible context tags
  ctx?: Record<string, string>;
  // Examples:
  //   { user: "john@example.com", tenant: "acme-corp" }
  //   { block: "045", source: "B", ws: "WS2" }
  //   { requestId: "req-123", userId: "U456" }
}
```

### Why `ctx` instead of `contextTags`?
- Shorter = less bandwidth for high-volume logging
- Every log entry includes this, so size matters

### Reserved Context Keys (conventions, not enforced)
| Key | Purpose | Example |
|-----|---------|---------|
| `user` | User identifier | `"john@example.com"` |
| `tenant` | Multi-tenant system | `"acme-corp"` |
| `request` | HTTP request ID | `"req-abc123"` |
| `session` | User session | `"sess-xyz"` |
| `job` | Background job ID | `"job-456"` |
| `file` | File being processed | `"data.csv"` |
| `ws` | WebSocket connection | `"WS2"` |

User can use any keys they want.

---

## C# Client API

### Simple API (90% of use cases)
```csharp
// Set context for all subsequent logs in this async flow
Si.SetContext("user", "john@example.com");
Si.SetContext("tenant", "acme-corp");

// Log normally - context is automatically included
Si.LogMessage("User logged in");
// Output: { title: "User logged in", ctx: { user: "john@example.com", tenant: "acme-corp" } }

// Clear context
Si.ClearContext("user");
Si.ClearAllContext();
```

### Scoped API (auto-cleanup)
```csharp
// Context automatically cleared when scope ends
using (Si.Context("request", "req-123"))
{
    Si.LogMessage("Processing request");

    // Nested context
    using (Si.Context("step", "validation"))
    {
        Si.LogMessage("Validating input");
        // ctx: { request: "req-123", step: "validation" }
    }

    Si.LogMessage("Request complete");
    // ctx: { request: "req-123" }
}
// ctx: { } (empty)
```

### Batch Context
```csharp
// Set multiple at once
using (Si.Context(new { user = "john", tenant = "acme", request = "req-123" }))
{
    Si.LogMessage("Processing");
}
```

### Integration with Existing AsyncContext
```csharp
// CorrelationId is separate from ctx - both can be used
using (Si.BeginOperation("ProcessOrder"))  // Sets correlationId, operationName, depth
using (Si.Context("user", userId))          // Sets ctx.user
{
    Si.LogMessage("Processing order for user");
    // Has both correlationId AND ctx.user
}
```

---

## Server Changes

### Storage (storage.js)
```javascript
// Track unique context keys and values seen
contextIndex: {
  keys: Set<string>,           // All context keys seen: ["user", "tenant", "request"]
  values: Map<string, Set>,    // Values per key: { user: Set(["john", "jane"]), ... }
  counts: Map<string, Map>,    // Entry counts: { user: { "john": 150, "jane": 89 } }
}

// On new entry with ctx:
function indexContext(entry) {
  if (!entry.ctx) return;
  for (const [key, value] of Object.entries(entry.ctx)) {
    this.contextIndex.keys.add(key);
    if (!this.contextIndex.values.has(key)) {
      this.contextIndex.values.set(key, new Set());
      this.contextIndex.counts.set(key, new Map());
    }
    this.contextIndex.values.get(key).add(value);
    const counts = this.contextIndex.counts.get(key);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
}
```

### API Endpoints
```
GET /api/contexts
  Returns: {
    keys: ["user", "tenant", "request"],
    summary: {
      user: { count: 1250, uniqueValues: 89 },
      tenant: { count: 1250, uniqueValues: 3 },
      request: { count: 1250, uniqueValues: 450 }
    }
  }

GET /api/contexts/:key
  Returns: {
    key: "user",
    values: [
      { value: "john@example.com", count: 150, lastSeen: "2025-01-01T..." },
      { value: "jane@example.com", count: 89, lastSeen: "2025-01-01T..." },
      ...
    ]
  }
  Query params:
    ?limit=50          // Pagination
    ?offset=0
    ?sort=count|recent // Sort by entry count or last seen
    ?search=john       // Filter values
```

---

## UI Implementation

### Phase 1: Foundation (No visible changes for simple users)

#### 1.1 Update Types
```typescript
// types.ts
interface LogEntry {
  // ... existing ...
  ctx?: Record<string, string>;
}
```

#### 1.2 Display in Detail Panel
When entry has `ctx`, show in detail panel:
```
┌─ Entry Details ────────────────────────────┐
│ Title: Processing order                     │
│ Time: 2025-01-01 10:00:00.123              │
│ Session: OrderService                       │
│                                            │
│ ▼ Context                                  │
│   user: john@example.com    [→ Filter]     │
│   tenant: acme-corp         [→ Filter]     │
│   request: req-123          [→ Filter]     │
└────────────────────────────────────────────┘
```
Click [→ Filter] adds filter for that context.

#### 1.3 Context Columns in Grid
Add optional columns for context keys:
```
Column Chooser:
  [x] Time
  [x] Level
  [x] Title
  [ ] ctx.user      ← NEW: auto-discovered
  [ ] ctx.tenant    ← NEW: auto-discovered
  [ ] ctx.request   ← NEW: auto-discovered
```

### Phase 2: Context Panel

#### 2.1 Toggle Button in Toolbar
```
[Views ▼] [Filter] [Highlights] [Contexts]  ← NEW button
```

#### 2.2 Context Panel (Collapsible Sidebar)
```
┌─ Contexts ────────────────────────────────┐
│                                           │
│ Mode: ○ Off  ● Fade  ○ Filter  ○ Highlight│
│                                           │
│ ┌─ Active Contexts ─────────────────────┐ │
│ │ (click to select, others fade)        │ │
│ │                                       │ │
│ │ ▼ user (89 unique, 1250 entries)      │ │
│ │   🔍 [Search users...]                │ │
│ │   ● john@example.com     150 ████     │ │
│ │   ○ jane@example.com      89 ██       │ │
│ │   ○ bob@example.com       45 █        │ │
│ │   [Show 86 more...]                   │ │
│ │                                       │ │
│ │ ▶ tenant (3 unique) [collapsed]       │ │
│ │ ▶ request (450 unique) [collapsed]    │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ┌─ Pinned Contexts ─────────────────────┐ │
│ │ (always visible, quick access)        │ │
│ │                                       │ │
│ │ 📌 user:john@example.com              │ │
│ │ 📌 tenant:acme-corp                   │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ [Clear All Selections]                    │
└───────────────────────────────────────────┘
```

#### 2.3 Handling High Cardinality (1000s of users)

**Problem**: Can't show 1000 users in a list

**Solutions**:

1. **Search-First UI**
   ```
   ┌─ user (1250 unique) ─────────────────┐
   │ 🔍 [Type to search users...]         │
   │                                      │
   │ Recently active:                     │
   │   ○ john@example.com (2 min ago)     │
   │   ○ jane@example.com (5 min ago)     │
   │                                      │
   │ Most entries:                        │
   │   ○ system@internal (2500)           │
   │   ○ admin@example.com (890)          │
   └──────────────────────────────────────┘
   ```

2. **Grouping by Pattern**
   ```
   ┌─ user (1250 unique) ─────────────────┐
   │ ▶ *@example.com (450 users)          │
   │ ▶ *@acme-corp.com (320 users)        │
   │ ▶ *@internal (3 users)               │
   │ ▶ Other (477 users)                  │
   └──────────────────────────────────────┘
   ```

3. **Pin Important Contexts**
   User can pin specific values they care about:
   ```
   Pinned:
     📌 user:john@example.com   [x]
     📌 user:jane@example.com   [x]
     📌 tenant:acme-corp        [x]
   ```

4. **"Track This User" Feature**
   Right-click on entry → "Track this user" → Adds to pinned

### Phase 3: Vertical Ribbons

#### 3.1 Optional Ribbon Column
```
Settings → Display:
  [x] Show context ribbons

  Ribbon columns:
    [x] correlationId    Width: 4px
    [ ] ctx.user         Width: 4px
    [ ] ctx.request      Width: 4px
```

#### 3.2 Ribbon Implementation
```
┌────┬────────────────────────────────────────┐
│░█░█│ Time      Level  Title                 │
├────┼────────────────────────────────────────┤
│░█░ │ 10:00:01  INF    User john logged in   │
│░█░█│ 10:00:02  DBG    Processing request    │
│░█░█│ 10:00:03  DBG    Validation complete   │
│░ ░█│ 10:00:04  INF    User jane logged in   │
│░█░ │ 10:00:05  INF    John's request done   │
└────┴────────────────────────────────────────┘
 ││││
 │││└─ Request context (each request = color)
 ││└── (unused)
 │└─── User context (john=blue, jane=green)
 └──── Correlation (unchanged)
```

### Phase 4: Fade/Filter Modes

#### 4.1 Mode Selection
```
Context Mode:
  ○ Off        - No context filtering
  ● Fade       - Non-matching rows at 30% opacity
  ○ Filter     - Hide non-matching rows
  ○ Highlight  - Color matching rows (keep others normal)
```

#### 4.2 CSS for Fade
```css
.vlg-row.context-faded {
  opacity: 0.3;
  transition: opacity 0.15s ease;
}

.vlg-row.context-faded:hover {
  opacity: 0.7;  /* Peek on hover */
}
```

#### 4.3 Multi-Select Logic
```
Selected: user=john AND tenant=acme

Matching logic:
  - entry.ctx.user === "john" AND entry.ctx.tenant === "acme"
  → Show at 100%

  - entry.ctx.user === "john" but no tenant match
  → Fade to 30%

  - Neither match
  → Fade to 30%
```

---

## UI Without Advanced Features

For users who don't need context tracking:

### Default State
- Context panel hidden
- No ribbon columns
- No fade effects
- Just normal grid view

### Progressive Discovery
```
1. User sees entry with ctx in detail panel
   → "Context: user=john [→ Filter]"

2. User clicks [→ Filter]
   → Filter applied, toast: "Filtered to user=john.
      Open Context Panel for more options."

3. User opens Context Panel
   → Sees full context UI
```

### Settings
```
Settings → Context Tracking:
  [ ] Enable context panel
  [ ] Show context ribbons
  [ ] Auto-discover context columns

  When disabled, contexts only visible in detail panel.
```

---

## Implementation Order

### Sprint 1: Protocol & Backend (Week 1)
- [ ] Update packet-parser.js to parse ctx field
- [ ] Update storage.js to index contexts
- [ ] Add /api/contexts endpoints
- [ ] Update TypeScript types
- [ ] Update C# client with Si.Context() API

### Sprint 2: Basic UI (Week 2)
- [ ] Show ctx in detail panel
- [ ] Add "Filter by this context" action
- [ ] Add ctx columns to column chooser
- [ ] Context values in filter panel dropdown

### Sprint 3: Context Panel (Week 3)
- [ ] Context panel component
- [ ] Context list with search
- [ ] Click to select (single)
- [ ] Fade mode implementation

### Sprint 4: Advanced Features (Week 4)
- [ ] Multi-select contexts
- [ ] Pinned contexts
- [ ] Vertical ribbons
- [ ] Filter/Highlight modes
- [ ] Grouping for high cardinality

### Sprint 5: Polish (Week 5)
- [ ] Settings for enabling/disabling
- [ ] Performance optimization for 1000s of contexts
- [ ] Documentation
- [ ] C# client examples

---

## API Summary

### C# Client
```csharp
// Simple
Si.SetContext("user", userId);
Si.ClearContext("user");

// Scoped
using (Si.Context("request", requestId))
using (Si.Context(new { user = userId, tenant = tenantId }))
{
    Si.LogMessage("Processing");
}
```

### REST API
```
GET  /api/contexts              - List all context keys
GET  /api/contexts/:key         - Get values for a key
GET  /api/contexts/:key/stats   - Statistics for a key
```

### WebSocket Messages
```javascript
// Existing - now includes ctx
{ type: "log", entry: { title: "...", ctx: { user: "john" } } }

// New - context index updates
{ type: "context-update", key: "user", value: "john", count: 151 }
```

---

## Questions to Resolve

1. **Context inheritance**: Should child operations inherit parent context?
2. **Context size limit**: Max keys? Max value length?
3. **Context persistence**: Store in localStorage which contexts user cares about?
4. **Performance**: At what scale do we need server-side context filtering?

---

## Success Metrics

1. **No regression**: Users not using contexts see no change
2. **Easy adoption**: Add context with 1 line of code
3. **Scales**: UI usable with 1000+ unique context values
4. **Fast**: No noticeable lag when selecting context
