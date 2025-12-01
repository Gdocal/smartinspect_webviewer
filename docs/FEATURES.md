# Features Overview

Complete list of features available in SmartInspect Web Viewer.

## Core Log Viewing

- **Real-time streaming** - Logs appear instantly as applications send them via TCP
- **AG Grid Enterprise display** - Virtual scrolling handles 100K+ log entries with smooth performance
- **Multi-client support** - Multiple applications can send logs simultaneously
- **Auto-scroll control** - Automatically scroll to bottom, disable by scrolling up
- **Pause/Resume** - Control log streaming without losing connection
- **Circular buffer** - Configurable maximum entries (default: 100,000)

## Filtering & Search

- **Session filtering** - Filter by session name (Database, API, Authentication, UI, etc.)
- **Level filtering** - Toggle Debug, Verbose, Message, Warning, Error, Fatal levels with inverse option
- **Text search** - Filter by title and message with multiple operators:
  - Contains (case-sensitive or insensitive)
  - Equals (exact match)
  - Regex (with pattern support)
  - Inverse matching (exclude matches)
- **Time range filtering** - Filter by date/timestamp range with date picker
- **Multi-field filtering** - Filter by app name, host name, process ID, thread ID
- **List + Text dual mode** - Session filter supports both list selection AND text pattern
- **Advanced operators** - Supports contains, equals, regex, inverse for all text fields

## View Management

- **Predefined Views (Tabs)** - Create custom views with saved filter combinations
- **Quick switching** - Click view tabs for instant access to filtered perspectives
- **View editor** - Double-click tabs to edit name, filters, and settings
- **View persistence** - Views saved per room and synced across sessions
- **Default "All Logs" view** - Always available, shows unfiltered logs
- **Color-coded tabs** - Assign colors to tabs for visual organization
- **Drag-to-reorder** - Reorder view tabs by dragging (planned)
- **Per-view settings** - Each view can have its own auto-scroll and highlight rules

## Entry Details & Data Visualization

- **Detail Panel** - Click any log entry to see full details in side panel
- **Rich data display**:
  - **JSON** - Syntax highlighting and pretty-printing for Object entries
  - **Source code** - Formatted display for Source entries with language detection
  - **Binary data** - Hex dump view for Binary entries
  - **Plain text** - Readable display for Text entries
- **Metadata display** - Timestamp, type, level, session, app, host, PID, TID
- **Call context tracking** - Shows method call chain for EnterMethod/LeaveMethod entries
- **Entry type badges** - Visual indicators for entry types (Message, Warning, Error, etc.)
- **Copy to clipboard** - Copy entry data with one click

## Watch Values Monitoring

- **Watch Panel** - Dedicated panel showing real-time watch values from applications
- **Live updates** - Values update instantly as applications send new data
- **Flash animation** - Visual feedback when values change (color pulse)
- **Table view** - Columns for Name, Value, Updated timestamp
- **Filterable** - Search watch values by name or content
- **Sortable** - Click column headers to sort by any field
- **Clear function** - Clear all watches with one click
- **Resizable** - Drag panel border to resize
- **Collapsible** - Toggle panel visibility

## Stream Panel (High-Frequency Data)

- **Separate panel** - Dedicated space for streaming data channels
- **Multi-channel support** - Multiple independent data streams (e.g., metrics, telemetry)
- **Channel tabs** - Switch between different stream channels
- **Auto-scroll option** - Enable/disable auto-scroll to bottom per channel
- **Text filtering** - Filter stream data by content
- **Configurable buffer** - Default 1000 entries per stream
- **Clear controls** - Clear individual channels or all streams
- **Dedicated view** - Full-screen stream view available

## Highlighting & Styling Rules

- **User-controlled highlighting** - No automatic styling, all rules are explicitly defined
- **Flexible filter conditions**:
  - **Fields**: level, session, app, title, entry type, process ID, host name
  - **Operators**: equals, contains, regex, inverse
  - **Logical combinations**: Multiple conditions per rule
- **Custom styling per rule**:
  - Background color (8 preset colors + custom)
  - Text color (8 preset colors + custom)
  - Font weight (normal, bold)
  - Font style (italic support)
- **Priority system** - Rules execute in order, first match wins
- **Enable/disable** - Toggle individual rules without deleting
- **Rule editor** - Visual editor with color pickers and live preview
- **Import/Export** - Share highlighting rules via JSON

## Layout & Customization

- **Resizable panels** - Drag borders to resize detail panel and watch panel
- **Collapsible panels** - Show/hide panels to maximize log viewing area
- **Column chooser** - AG Grid sidebar for show/hide log grid columns
- **Column ordering** - Reorder and resize columns with drag-and-drop
- **Column pinning** - Pin columns to left/right for fixed visibility
- **Dark/Light theme** - Toggle between dark and light modes with smooth transition
- **Layout persistence** - Panel sizes and column widths saved to localStorage
- **Export/Import/Reset** - Save complete layout configurations to JSON and restore them
- **Responsive design** - Adapts to different screen sizes

## Project Management

- **Project persistence** - Save complete project state (views, settings, layouts, highlights)
- **Save as new** - Save current configuration with a new project name
- **Load project** - Switch between saved projects from dropdown
- **Auto-save** - Optional automatic project saving on changes
- **Export to JSON** - Export projects as `.siwv` files
- **Import from file** - Import projects from JSON files
- **Default reset** - Restore to original default state
- **Project indicator** - Header shows current project name with unsaved changes indicator
- **Unsaved changes warning** - Prompts to save when switching projects with unsaved changes

## Room/Isolation

- **Multi-room support** - Separate log namespaces for different projects or teams
- **Room selection** - Switch between rooms via header dropdown
- **Project-per-room** - Each room maintains independent project configurations
- **Isolated storage** - Views, highlights, watches, and streams are per-room
- **Room statistics** - Track connections, entries, and activity per room

## Control Features

- **Pause/Resume streaming** - Stop incoming logs without disconnecting
- **Clear logs** - Remove all entries from buffer with confirmation
- **Status bar** - Shows connection status, entry count, and server stats
- **Server info modal** - Display server version, uptime, memory usage, connection details
- **Settings panel** - Configure application behavior and preferences
- **Connection indicator** - Visual feedback for WebSocket connection state
