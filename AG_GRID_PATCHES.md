# AG Grid Stick-to-Bottom Implementation

This document describes the implementation for stick-to-bottom behavior in AG Grid (auto-scroll to new rows added at the bottom).

## Problem Description

When implementing a "stick-to-bottom" feature (like a log viewer where new entries appear at the bottom), the following issues occur:

1. **Scroll Bounce**: When a new row is added, the scrollbar visually "bounces" - it moves up momentarily then snaps back down
2. **Fighting Scroll Handlers**: AG Grid has multiple internal scroll synchronization mechanisms that conflict with manual scroll-to-bottom calls
3. **User Cannot Exit Auto-Scroll**: When rows are added rapidly, it's hard for users to scroll away from the bottom

### Root Cause

AG Grid uses two scroll containers that must stay synchronized:
- **Body Viewport** (`ag-body-viewport`): The main content area
- **Fake Vertical Scrollbar** (`ag-body-vertical-scroll-viewport`): A custom scrollbar component

When content height changes (new row added):
1. The browser updates `scrollHeight` but `scrollTop` stays the same
2. This means the scrollbar thumb visually moves UP (because content got taller)
3. AG Grid's internal scroll sync tries to adjust
4. Our code tries to scroll to bottom
5. These compete, causing visible bounce

---

## Solution: Application-Side Implementation (No AG Grid Patches)

The best approach is to handle stick-to-bottom entirely in application code without patching AG Grid.

### Key Components

```typescript
// Track stick-to-bottom state
const stickToBottomRef = useRef(true);

// Track programmatic scrolling (to ignore those scroll events)
const isProgrammaticScrollRef = useRef(false);

// Track user interaction time - don't auto-scroll right after user interacts
const userInteractionTimeRef = useRef(0);
```

### Snap to Bottom Function

```typescript
const snapToBottom = useCallback((viewport: HTMLElement, fakeScroll: HTMLElement | null) => {
    isProgrammaticScrollRef.current = true;
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTop = maxScroll;
    if (fakeScroll) fakeScroll.scrollTop = maxScroll;
    // Reset after a short delay
    setTimeout(() => {
        isProgrammaticScrollRef.current = false;
    }, 50);
}, []);
```

### Add Rows Function

```typescript
const addRows = useCallback(() => {
    const newRows = generateRows(options.rowsPerAdd);
    const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
    const fakeScroll = document.querySelector('.ag-body-vertical-scroll-viewport') as HTMLElement;

    // Add rows via AG Grid API
    gridApi.applyTransaction({ add: newRows });

    // If we should stick to bottom, snap there immediately after DOM updates
    // But skip if user recently interacted (give them time to scroll away)
    const timeSinceInteraction = Date.now() - userInteractionTimeRef.current;
    if (stickToBottomRef.current && viewport && timeSinceInteraction > 500) {
        // Snap multiple times to catch all AG Grid internal updates
        snapToBottom(viewport, fakeScroll);
        queueMicrotask(() => snapToBottom(viewport, fakeScroll));
        requestAnimationFrame(() => {
            snapToBottom(viewport, fakeScroll);
            requestAnimationFrame(() => snapToBottom(viewport, fakeScroll));
        });
    }
}, []);
```

### User Interaction Detection

```typescript
useEffect(() => {
    const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
    const fakeScroll = document.querySelector('.ag-body-vertical-scroll-viewport') as HTMLElement;

    // Wheel event - user is scrolling with mouse wheel
    const handleWheel = (e: WheelEvent) => {
        userInteractionTimeRef.current = Date.now();
        // Scrolling up (negative deltaY) = user wants to leave auto-scroll
        if (e.deltaY < 0) {
            stickToBottomRef.current = false;
        }
    };

    // Mousedown on scrollbar track - user is dragging scrollbar
    const handleMouseDown = () => {
        userInteractionTimeRef.current = Date.now();
        // User is interacting with scrollbar, disable stick-to-bottom
        stickToBottomRef.current = false;
    };

    // Scroll event - check if user scrolled to bottom to re-enable
    // Also trigger redraw after fast scrolling stops to fix empty rows
    let scrollTimeout: number | null = null;
    const handleScroll = () => {
        if (!viewport || isProgrammaticScrollRef.current) return;

        const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

        // If user scrolled to bottom (within 10px), enable stick-to-bottom
        if (distanceFromBottom < 10) {
            stickToBottomRef.current = true;
        }

        // Debounced redraw after scroll stops - fixes empty rows after fast scroll
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => {
            if (gridApiRef.current) {
                gridApiRef.current.redrawRows();
            }
        }, 150);
    };

    viewport?.addEventListener('wheel', handleWheel, { passive: true });
    viewport?.addEventListener('mousedown', handleMouseDown);
    fakeScroll?.addEventListener('mousedown', handleMouseDown);
    viewport?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
        viewport?.removeEventListener('wheel', handleWheel);
        viewport?.removeEventListener('mousedown', handleMouseDown);
        fakeScroll?.removeEventListener('mousedown', handleMouseDown);
        viewport?.removeEventListener('scroll', handleScroll);
    };
}, [gridKey]);
```

---

## CSS to Prevent White Flash on New Rows

When rows are added, they may flash white before their proper background is applied. Fix with:

```css
/* Set explicit background colors for all rows to prevent white flash */
.ag-theme-balham-dark .ag-row {
    background-color: #0f172a !important;
}
.ag-theme-balham-dark .ag-row-odd {
    background-color: #1e293b !important;
}
.ag-theme-balham-dark .ag-row-even {
    background-color: #0f172a !important;
}
/* Ensure cells also have background to prevent flash */
.ag-theme-balham-dark .ag-cell {
    background-color: inherit;
}
/* Row animation - only animate transform, not background */
.ag-theme-balham-dark .ag-row-animation {
    transition: transform 0.3s ease-out !important;
}
.ag-theme-balham-dark .ag-row-no-animation {
    transition: none !important;
}
/* Prevent flash during virtualization */
.ag-theme-balham-dark .ag-center-cols-viewport {
    overflow-anchor: none;
    background-color: #0f172a;
}
.ag-theme-balham-dark .ag-body-viewport {
    background-color: #0f172a;
}
```

---

## Key Points Summary

1. **Track stick-to-bottom state with a ref** - not derived from scroll position each time
2. **Detect user intent via wheel and mousedown events** - these are user-initiated, not programmatic
3. **500ms grace period after user interaction** - don't immediately snap back to bottom
4. **Snap to bottom multiple times** (sync, microtask, 2x RAF) to catch all AG Grid internal updates
5. **Update BOTH viewports** - the main viewport AND the fake scrollbar
6. **Debounced redrawRows() after scroll stops** - fixes empty grid after fast scrolling
7. **User re-enables by scrolling to bottom** - within 10px of bottom re-enables auto-scroll

---

## Recommended AG Grid Settings

```typescript
<AgGridReact
    animateRows={true}
    rowBuffer={100}  // Larger buffer helps with fast scrolling
    debounceVerticalScrollbar={true}
    suppressScrollOnNewData={true}
    // ...other options
/>
```

---

## Related Files

- `client/src/AgGridTest.tsx` - Test page for experimenting with scroll behavior
- `package.json` - Contains AG Grid dependencies

---

## Version Compatibility

- **AG Grid Version**: 34.3.1
- **Tested With**: ag-grid-enterprise, ag-grid-react
