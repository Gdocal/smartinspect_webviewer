/**
 * TitleHighlightModal - Modal for creating highlight rules OR views from title with word selection
 * Features:
 * - Click words to build pattern (word1.*word2)
 * - Auto-detect operator (starts, ends, contains, regex)
 * - Live match count
 * - Live preview highlighting in grid
 * - Editable pattern field
 * - Case sensitivity toggle
 * - Supports both 'highlight' and 'view' modes
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  LogEntry,
  useLogStore,
  matchesPreviewTitleFilter,
  defaultHighlightFilter,
  defaultListTextFilter,
  HighlightRule,
  TextFilter,
} from '../store/logStore';

// Density configuration for modal
const MODAL_DENSITY_CONFIG = {
  compact: {
    headerPy: 'py-2',
    headerPx: 'px-3',
    headerText: 'text-sm',
    contentPadding: 'p-3',
    wordGap: 'gap-1',
    wordPadding: 'px-1.5 py-0.5',
    wordText: 'text-xs',
    inputHeight: 'h-7',
    inputText: 'text-xs',
    selectHeight: 'h-6',
    selectText: 'text-[10px]',
    labelText: 'text-[10px]',
    buttonPadding: 'px-3 py-1.5',
    buttonText: 'text-xs',
    matchText: 'text-xs',
    maxWidth: 'max-w-lg',
    wordAreaHeight: 'max-h-24',
  },
  default: {
    headerPy: 'py-3',
    headerPx: 'px-4',
    headerText: 'text-base',
    contentPadding: 'p-4',
    wordGap: 'gap-1.5',
    wordPadding: 'px-2 py-1',
    wordText: 'text-sm',
    inputHeight: 'h-9',
    inputText: 'text-sm',
    selectHeight: 'h-8',
    selectText: 'text-sm',
    labelText: 'text-xs',
    buttonPadding: 'px-4 py-2',
    buttonText: 'text-sm',
    matchText: 'text-sm',
    maxWidth: 'max-w-2xl',
    wordAreaHeight: 'max-h-32',
  },
  comfortable: {
    headerPy: 'py-4',
    headerPx: 'px-5',
    headerText: 'text-lg',
    contentPadding: 'p-5',
    wordGap: 'gap-2',
    wordPadding: 'px-3 py-1.5',
    wordText: 'text-base',
    inputHeight: 'h-10',
    inputText: 'text-base',
    selectHeight: 'h-9',
    selectText: 'text-sm',
    labelText: 'text-sm',
    buttonPadding: 'px-5 py-2.5',
    buttonText: 'text-base',
    matchText: 'text-base',
    maxWidth: 'max-w-3xl',
    wordAreaHeight: 'max-h-40',
  },
};

// Color palette for random highlight colors
const HIGHLIGHT_COLORS = [
  { bg: '#fef2f2', text: '#991b1b' }, { bg: '#fecaca', text: '#991b1b' }, { bg: '#dc2626', text: '#ffffff' },
  { bg: '#fff7ed', text: '#9a3412' }, { bg: '#fed7aa', text: '#9a3412' }, { bg: '#ea580c', text: '#ffffff' },
  { bg: '#fffbeb', text: '#92400e' }, { bg: '#fde68a', text: '#78350f' }, { bg: '#d97706', text: '#ffffff' },
  { bg: '#ecfdf5', text: '#065f46' }, { bg: '#a7f3d0', text: '#065f46' }, { bg: '#16a34a', text: '#ffffff' },
  { bg: '#eff6ff', text: '#1e40af' }, { bg: '#bfdbfe', text: '#1e40af' }, { bg: '#2563eb', text: '#ffffff' },
  { bg: '#f5f3ff', text: '#5b21b6' }, { bg: '#ddd6fe', text: '#5b21b6' }, { bg: '#7c3aed', text: '#ffffff' },
  { bg: '#f8fafc', text: '#334155' }, { bg: '#e2e8f0', text: '#1e293b' }, { bg: '#475569', text: '#ffffff' },
];

function getRandomUniqueColor(existingRules: HighlightRule[]): { backgroundColor: string; textColor: string } {
  const usedColors = new Set(existingRules.map(r => r.style.backgroundColor).filter(Boolean));
  const availableColors = HIGHLIGHT_COLORS.filter(c => !usedColors.has(c.bg));
  const colorPool = availableColors.length > 0 ? availableColors : HIGHLIGHT_COLORS;
  const randomColor = colorPool[Math.floor(Math.random() * colorPool.length)];
  return { backgroundColor: randomColor.bg, textColor: randomColor.text };
}

interface TitleHighlightModalProps {
  entry: LogEntry;
  entries: LogEntry[];
  onClose: () => void;
  mode: 'highlight' | 'view';  // 'highlight' creates a highlight rule, 'view' creates a view
}

type FilterOperator = 'contains' | 'equals' | 'starts' | 'ends' | 'regex';

// Escape special regex characters in a string
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Validate regex pattern
function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// Token with position info for reconstructing original text
interface TokenInfo {
  text: string;       // Display text (with visual representations for special chars)
  original: string;   // Original text for pattern
  start: number;      // Start position in original title
  end: number;        // End position in original title
}

// Split title into tokens - separate words and punctuation/special chars
function tokenizeTitle(title: string): TokenInfo[] {
  const tokens: TokenInfo[] = [];
  // Match: word characters OR individual punctuation/special chars
  const regex = /[\w]+|[^\w\s]/g;
  let match;
  while ((match = regex.exec(title)) !== null) {
    const original = match[0];
    // Convert special chars to visible representations for display
    let display = original
      .replace(/\r\n/g, '↵')
      .replace(/\n/g, '↵')
      .replace(/\r/g, '↵')
      .replace(/\t/g, '→');
    tokens.push({
      text: display,
      original: original,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

// Get the original substring from title for a range of consecutive tokens
function getOriginalSubstring(title: string, tokens: TokenInfo[], indices: number[]): string {
  if (indices.length === 0) return '';
  const sorted = [...indices].sort((a, b) => a - b);
  const firstToken = tokens[sorted[0]];
  const lastToken = tokens[sorted[sorted.length - 1]];
  return title.substring(firstToken.start, lastToken.end);
}

// Check if indices are consecutive (no gaps)
function areConsecutive(indices: number[]): boolean {
  if (indices.length <= 1) return true;
  const sorted = [...indices].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

export function TitleHighlightModal({ entry, entries, onClose, mode }: TitleHighlightModalProps) {
  const title = entry.title || '';

  // Split title into tokens (words and punctuation separated)
  const tokens = useMemo(() => tokenizeTitle(title), [title]);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [pattern, setPattern] = useState('');
  const [operator, setOperator] = useState<FilterOperator>('contains');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isManuallyEditing, setIsManuallyEditing] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const patternInputRef = useRef<HTMLInputElement>(null);

  const setPreviewTitleFilter = useLogStore(state => state.setPreviewTitleFilter);
  const addHighlightRule = useLogStore(state => state.addHighlightRule);
  const addView = useLogStore(state => state.addView);
  const globalHighlightRules = useLogStore(state => state.globalHighlightRules);
  const rowDensity = useLogStore(state => state.rowDensity);

  const density = MODAL_DENSITY_CONFIG[rowDensity];

  // Smart pattern generation from selected tokens
  // Rules:
  // - Consecutive at start -> "starts with" (use original substring with spaces)
  // - Consecutive in middle -> "contains" (use original substring with spaces)
  // - Consecutive at end -> "ends with" (use original substring with spaces)
  // - All tokens selected + consecutive -> "equals" (exact match, full title)
  // - Non-consecutive (gaps) at start -> regex with ^
  // - Non-consecutive (gaps) at end -> regex with $
  // - Non-consecutive in middle -> plain regex
  useEffect(() => {
    if (isManuallyEditing) return; // Don't auto-update when user is manually editing

    const selected = Array.from(selectedIndices).sort((a, b) => a - b);
    if (selected.length === 0) {
      setPattern('');
      setOperator('contains');
      return;
    }

    const firstSelected = selected[0];
    const lastSelected = selected[selected.length - 1];
    const startsFromBeginning = firstSelected === 0;
    const endsAtEnd = lastSelected === tokens.length - 1;
    const isConsecutive = areConsecutive(selected);

    if (isConsecutive) {
      // Consecutive selection - extract original substring with spaces preserved
      const substringText = getOriginalSubstring(title, tokens, selected);

      if (startsFromBeginning && endsAtEnd) {
        // All tokens selected (full title)
        setPattern(title); // Use full original title
        setOperator('equals');
      } else if (startsFromBeginning) {
        // Consecutive from start
        setPattern(substringText);
        setOperator('starts');
      } else if (endsAtEnd) {
        // Consecutive at end
        setPattern(substringText);
        setOperator('ends');
      } else {
        // Consecutive in middle
        setPattern(substringText);
        setOperator('contains');
      }
    } else {
      // Non-consecutive selection - need regex with .*
      const selectedTokens = selected.map(i => tokens[i].original);
      const escapedTokens = selectedTokens.map(escapeRegex);
      let regexPattern = escapedTokens.join('.*');

      // Add anchors based on position
      if (startsFromBeginning) {
        regexPattern = '^' + regexPattern;
      }
      if (endsAtEnd) {
        regexPattern = regexPattern + '$';
      }

      setPattern(regexPattern);
      setOperator('regex');
    }
  }, [selectedIndices, tokens, title, isManuallyEditing]);

  // Validate regex when operator is regex
  useEffect(() => {
    if (operator === 'regex' && pattern) {
      if (!isValidRegex(pattern)) {
        setRegexError('Invalid regex pattern');
      } else {
        setRegexError(null);
      }
    } else {
      setRegexError(null);
    }
  }, [pattern, operator]);

  // Map operator to preview filter format (TextFilter uses 'starts'/'ends'/'equals', PreviewTitleFilter uses 'starts-with')
  const mapOperatorForPreview = (op: FilterOperator): 'contains' | 'starts-with' | 'regex' => {
    if (op === 'starts') return 'starts-with';
    if (op === 'ends') return 'regex'; // 'ends' needs to be converted to regex for preview
    if (op === 'equals') return 'regex'; // 'equals' needs to be converted to regex for preview
    return op as 'contains' | 'regex';
  };

  // Generate regex pattern for preview (for operators that need conversion)
  const getPreviewPattern = (op: FilterOperator, pat: string): string => {
    if (op === 'ends') {
      return escapeRegex(pat) + '$';
    }
    if (op === 'equals') {
      return '^' + escapeRegex(pat) + '$';
    }
    return pat;
  };

  // Match count calculation
  const matchCount = useMemo(() => {
    if (!pattern || regexError) return 0;
    const previewOperator = mapOperatorForPreview(operator);
    const previewPattern = getPreviewPattern(operator, pattern);
    const filter = { pattern: previewPattern, operator: previewOperator, caseSensitive };
    return entries.filter(e => matchesPreviewTitleFilter(e, filter)).length;
  }, [entries, pattern, operator, caseSensitive, regexError]);

  // Live preview highlighting
  useEffect(() => {
    if (!pattern || regexError) {
      setPreviewTitleFilter(null);
      return;
    }
    const previewOperator = mapOperatorForPreview(operator);
    const previewPattern = getPreviewPattern(operator, pattern);
    setPreviewTitleFilter({ pattern: previewPattern, operator: previewOperator, caseSensitive });
    return () => setPreviewTitleFilter(null);
  }, [pattern, operator, caseSensitive, regexError, setPreviewTitleFilter]);

  // Cleanup preview on unmount
  useEffect(() => {
    return () => setPreviewTitleFilter(null);
  }, [setPreviewTitleFilter]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleWordClick = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    setIsManuallyEditing(false); // Reset manual editing mode when clicking words
  };

  const handleSelectAll = () => {
    setSelectedIndices(new Set(tokens.map((_, i) => i)));
    setIsManuallyEditing(false);
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
    setIsManuallyEditing(false);
  };

  const handlePatternChange = (value: string) => {
    setPattern(value);
    setIsManuallyEditing(true);
  };

  const handleOperatorChange = (newOperator: FilterOperator) => {
    setOperator(newOperator);
    // If switching to regex with multiple tokens selected, regenerate pattern with proper escaping
    if (newOperator === 'regex' && !isManuallyEditing && selectedIndices.size > 1) {
      const selected = Array.from(selectedIndices).sort((a, b) => a - b);
      const selectedTokens = selected.map(i => tokens[i].original);
      const escapedTokens = selectedTokens.map(escapeRegex);
      const firstSelected = selected[0];
      const lastSelected = selected[selected.length - 1];
      let regexPattern = escapedTokens.join('.*');
      if (firstSelected === 0) regexPattern = '^' + regexPattern;
      if (lastSelected === tokens.length - 1) regexPattern = regexPattern + '$';
      setPattern(regexPattern);
    }
  };

  const handleCreate = () => {
    if (!pattern || regexError) return;

    const titleFilter: TextFilter = {
      value: pattern,
      operator: operator,
      inverse: false,
      caseSensitive,
    };

    if (mode === 'highlight') {
      // Create highlight rule
      const randomColor = getRandomUniqueColor(globalHighlightRules);
      const ruleName = `Title: ${pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern}`;

      addHighlightRule({
        name: ruleName,
        enabled: true,
        priority: globalHighlightRules.length + 1,
        filter: {
          ...defaultHighlightFilter,
          titleFilter,
        },
        style: {
          backgroundColor: randomColor.backgroundColor,
          textColor: randomColor.textColor,
          fontWeight: 'normal',
        },
      });
    } else {
      // Create view
      const viewName = `Title: ${pattern.length > 20 ? pattern.slice(0, 20) + '...' : pattern}`;

      addView({
        name: viewName,
        filter: {
          sessions: [],
          levels: [],
          titlePattern: '',
          messagePattern: '',
          inverseMatch: false,
          from: null,
          to: null,
          appNames: [],
          hostNames: [],
          entryTypes: [],
          sessionFilter: { ...defaultListTextFilter },
          appNameFilter: { ...defaultListTextFilter },
          hostNameFilter: { ...defaultListTextFilter },
          titleFilter,
        },
        highlightRules: [],
        useGlobalHighlights: true,
        autoScroll: true,
      }, true); // setAsActive = true
    }

    onClose();
  };

  const isValid = pattern && !regexError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      <div
        ref={modalRef}
        className={`relative bg-white dark:bg-slate-800 rounded-lg shadow-xl ${density.maxWidth} w-full mx-4`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between ${density.headerPx} ${density.headerPy} border-b border-slate-200 dark:border-slate-700`}>
          <h2 className={`${density.headerText} font-semibold text-slate-900 dark:text-slate-100`}>
            {mode === 'highlight' ? 'Create Highlight Rule from Title' : 'Create View from Title'}
          </h2>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Word selection area */}
        <div className={density.contentPadding}>
          <div className="flex items-center justify-between mb-2">
            <p className={`${density.labelText} text-slate-500 dark:text-slate-400`}>
              Click tokens to include in pattern:
            </p>
            {/* Quick actions */}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className={`${density.labelText} px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors`}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={selectedIndices.size === 0}
                className={`${density.labelText} px-1.5 py-0.5 rounded transition-colors ${
                  selectedIndices.size === 0
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Clear
              </button>
            </div>
          </div>
          <div className={`flex flex-wrap ${density.wordGap} p-2 bg-slate-50 dark:bg-slate-900 rounded-lg ${density.wordAreaHeight} overflow-auto`}>
            {tokens.length > 0 ? (
              tokens.map((token, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleWordClick(i)}
                  className={`${density.wordPadding} rounded ${density.wordText} font-medium transition-colors font-mono ${
                    selectedIndices.has(i)
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                  }`}
                  title={token.text === '↵' ? 'Newline' : token.text === '→' ? 'Tab' : undefined}
                >
                  {token.text}
                </button>
              ))
            ) : (
              <span className={`${density.wordText} text-slate-400 dark:text-slate-500 italic`}>No tokens in title</span>
            )}
          </div>
        </div>

        {/* Pattern editor */}
        <div className={`${density.contentPadding} pt-0 space-y-2`}>
          {/* Operator selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <label className={`${density.labelText} text-slate-500 dark:text-slate-400`}>Operator:</label>
              <select
                value={operator}
                onChange={(e) => handleOperatorChange(e.target.value as FilterOperator)}
                className={`${density.selectHeight} px-2 ${density.selectText} border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400`}
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
                <option value="starts">Starts with</option>
                <option value="ends">Ends with</option>
                <option value="regex">Regex</option>
              </select>
            </div>

            <label className={`flex items-center gap-1.5 ${density.labelText} text-slate-600 dark:text-slate-300 cursor-pointer`}>
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600"
              />
              Case sensitive
            </label>
          </div>

          {/* Pattern input */}
          <div>
            <input
              ref={patternInputRef}
              type="text"
              value={pattern}
              onChange={(e) => handlePatternChange(e.target.value)}
              placeholder="Pattern..."
              className={`w-full ${density.inputHeight} px-2 ${density.inputText} font-mono border rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400 ${
                regexError ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-600'
              }`}
            />
            {regexError && (
              <p className={`mt-1 ${density.labelText} text-red-500 dark:text-red-400`}>{regexError}</p>
            )}
          </div>

          {/* Match count */}
          <div className={`${density.matchText} text-slate-500 dark:text-slate-400`}>
            Matches: <span className={`font-semibold ${matchCount > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>{matchCount.toLocaleString()}</span> / {entries.length.toLocaleString()} rows
          </div>
        </div>

        {/* Footer */}
        <div className={`flex justify-end gap-2 ${density.contentPadding} border-t border-slate-200 dark:border-slate-700`}>
          <button
            onClick={onClose}
            className={`${density.buttonPadding} ${density.buttonText} font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors`}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!isValid}
            className={`${density.buttonPadding} ${density.buttonText} font-medium text-white rounded transition-colors ${
              isValid
                ? 'bg-blue-500 hover:bg-blue-600'
                : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
            }`}
          >
            {mode === 'highlight' ? 'Create Rule' : 'Create View'}
          </button>
        </div>
      </div>
    </div>
  );
}
