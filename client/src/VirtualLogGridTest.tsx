import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { VirtualLogGrid, MAX_ROWS, DEFAULT_COLUMNS } from './components/VirtualLogGrid';
import { LogEntry, Level, LogEntryType, HighlightRule, defaultHighlightFilter } from './store/logStore';

const sessionNames = ['Main', 'Worker', 'Database', 'Network', 'UI', 'API'];

// Different entry types for more realistic test data
const entryTypes = [
  LogEntryType.Message,
  LogEntryType.Warning,
  LogEntryType.Error,
  LogEntryType.Debug,
  LogEntryType.Verbose,
  LogEntryType.EnterMethod,
  LogEntryType.LeaveMethod,
  LogEntryType.Checkpoint,
];

// Map entry types to appropriate levels
const typeToLevel: Record<number, number> = {
  [LogEntryType.Message]: Level.Message,
  [LogEntryType.Warning]: Level.Warning,
  [LogEntryType.Error]: Level.Error,
  [LogEntryType.Debug]: Level.Debug,
  [LogEntryType.Verbose]: Level.Verbose,
  [LogEntryType.EnterMethod]: Level.Message,
  [LogEntryType.LeaveMethod]: Level.Message,
  [LogEntryType.Checkpoint]: Level.Message,
  [LogEntryType.Fatal]: Level.Fatal,
};

// Sample highlight rules for testing - subtle colors that work with hover/selection
const testHighlightRules: HighlightRule[] = [
  {
    id: 'error-highlight',
    name: 'Errors',
    enabled: true,
    priority: 100,
    filter: {
      ...defaultHighlightFilter,
      levels: [Level.Error, Level.Fatal],
    },
    style: {
      backgroundColor: '#3f1515', // Subtle dark red
      textColor: '#f87171', // red-400
    },
  },
  {
    id: 'warning-highlight',
    name: 'Warnings',
    enabled: true,
    priority: 90,
    filter: {
      ...defaultHighlightFilter,
      levels: [Level.Warning],
    },
    style: {
      backgroundColor: '#3d2808', // Subtle dark amber
      textColor: '#fbbf24', // amber-400
    },
  },
];

export function VirtualLogGridTest() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isAutoAdding, setIsAutoAdding] = useState(false);
  const [addRate, setAddRate] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [useHighlights, setUseHighlights] = useState(true);
  const nextIdRef = useRef(1);

  // Column configuration with Level column shown
  const columns = useMemo(() => {
    return DEFAULT_COLUMNS.map(col =>
      col.id === 'level' ? { ...col, hidden: false } : col
    );
  }, []);

  // Generate a test entry with varied types
  const generateEntry = useCallback((): LogEntry => {
    const id = nextIdRef.current++;
    const entryType = entryTypes[Math.floor(Math.random() * entryTypes.length)];
    const level = typeToLevel[entryType] ?? Level.Message;
    const session = sessionNames[Math.floor(Math.random() * sessionNames.length)];

    // Generate appropriate title based on entry type
    let title: string;
    switch (entryType) {
      case LogEntryType.EnterMethod:
        title = `Entering MyClass.Method${id % 10}()`;
        break;
      case LogEntryType.LeaveMethod:
        title = `Leaving MyClass.Method${id % 10}()`;
        break;
      case LogEntryType.Error:
        title = `Error: Failed to process request #${id}`;
        break;
      case LogEntryType.Warning:
        title = `Warning: Resource usage high (${50 + Math.random() * 50}%)`;
        break;
      case LogEntryType.Checkpoint:
        title = `Checkpoint: Step ${id % 5 + 1} completed`;
        break;
      default:
        title = `Message #${id} - ${Math.random().toString(36).substring(7)}`;
    }

    return {
      id,
      type: 'message',
      logEntryType: entryType,
      title,
      sessionName: session,
      timestamp: new Date().toISOString(),
      level,
    };
  }, []);

  // Add single entry
  const addSingleEntry = useCallback(() => {
    setEntries(prev => {
      const combined = [...prev, generateEntry()];
      return combined.length > MAX_ROWS ? combined.slice(-MAX_ROWS) : combined;
    });
  }, [generateEntry]);

  // Add batch of entries
  const addBatch = useCallback((count: number) => {
    const newEntries = Array.from({ length: count }, generateEntry);
    setEntries(prev => {
      const combined = [...prev, ...newEntries];
      return combined.length > MAX_ROWS ? combined.slice(-MAX_ROWS) : combined;
    });
  }, [generateEntry]);

  // Auto-add with batching for efficiency
  useEffect(() => {
    if (!isAutoAdding) return;

    const updatesPerSecond = Math.min(60, addRate);
    const batchSize = Math.max(1, Math.ceil(addRate / updatesPerSecond));
    const intervalMs = 1000 / updatesPerSecond;

    const timer = setInterval(() => {
      const newEntries = Array.from({ length: batchSize }, generateEntry);
      setEntries(prev => {
        const combined = [...prev, ...newEntries];
        return combined.length > MAX_ROWS ? combined.slice(-MAX_ROWS) : combined;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isAutoAdding, addRate, generateEntry]);

  // Clear all entries
  const clearEntries = useCallback(() => {
    setEntries([]);
    nextIdRef.current = 1;
    setSelectedEntryId(null);
  }, []);

  // Handle entry selection
  const handleSelectEntry = useCallback((entry: LogEntry) => {
    setSelectedEntryId(entry.id);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100">
      {/* Control Panel */}
      <div className="p-4 bg-slate-800 flex flex-wrap gap-4 items-center border-b border-slate-700">
        {/* Start/Stop Button */}
        <button
          onClick={() => setIsAutoAdding(!isAutoAdding)}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            isAutoAdding
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isAutoAdding ? 'Stop' : 'Start'}
        </button>

        {/* Rate Slider */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Rate:</label>
          <input
            type="range"
            min="1"
            max="200"
            value={addRate}
            onChange={(e) => setAddRate(Number(e.target.value))}
            className="w-32 accent-blue-500"
          />
          <span className="text-sm font-mono w-16">{addRate}/sec</span>
        </div>

        {/* Manual Add Buttons */}
        <div className="flex gap-2">
          <button
            onClick={addSingleEntry}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
          >
            +1
          </button>
          <button
            onClick={() => addBatch(10)}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
          >
            +10
          </button>
          <button
            onClick={() => addBatch(100)}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
          >
            +100
          </button>
          <button
            onClick={() => addBatch(1000)}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
          >
            +1K
          </button>
        </div>

        {/* AutoScroll Toggle */}
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            autoScroll
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
          }`}
        >
          AutoScroll: {autoScroll ? 'ON' : 'OFF'}
        </button>

        {/* Highlight Toggle */}
        <button
          onClick={() => setUseHighlights(!useHighlights)}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            useHighlights
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
          }`}
        >
          Highlights: {useHighlights ? 'ON' : 'OFF'}
        </button>

        {/* Clear Button */}
        <button
          onClick={clearEntries}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
        >
          Clear
        </button>

        {/* Row Count and Scroll Mode */}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-slate-400">
            Rows: <span className="font-mono text-slate-200">{entries.length.toLocaleString()}</span>
          </span>
          {/* Scroll mode indicator */}
          <span className={`text-xs px-2 py-1 rounded ${
            addRate < 10 ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
          }`}>
            {addRate < 10 ? 'Smooth' : 'Instant'} scroll
          </span>
          {selectedEntryId && (
            <span className="text-sm text-slate-400">
              Selected: <span className="font-mono text-slate-200">#{selectedEntryId}</span>
            </span>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="px-4 py-1 bg-slate-800/50 text-xs text-slate-500 border-b border-slate-700">
        Tip: Click grid and use Arrow Up/Down to navigate rows
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-hidden">
        <VirtualLogGrid
          entries={entries}
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
          selectedEntryId={selectedEntryId}
          onSelectEntry={handleSelectEntry}
          theme="dark"
          alternatingRows={true}
          columns={columns}
          highlightRules={useHighlights ? testHighlightRules : []}
        />
      </div>
    </div>
  );
}
