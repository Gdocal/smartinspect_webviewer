/**
 * TitleFilterModal - Modal for creating a view filtered by title pattern
 * Features:
 * - Filter types: contains, starts-with, regex
 * - Live match count with debouncing
 * - Live preview highlighting in grid
 * - Regex validation
 */

import { useState, useEffect, useRef } from 'react';
import { LogEntry, useLogStore, matchesPreviewTitleFilter, defaultListTextFilter } from '../store/logStore';

interface TitleFilterModalProps {
  initialTitle: string;
  entries: LogEntry[];
  onClose: () => void;
}

type FilterOperator = 'contains' | 'starts-with' | 'regex';

// Truncate text for view name
function truncateForViewName(text: string, maxLength: number = 15): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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

export function TitleFilterModal({ initialTitle, entries, onClose }: TitleFilterModalProps) {
  const [pattern, setPattern] = useState(initialTitle);
  const [operator, setOperator] = useState<FilterOperator>('contains');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [viewName, setViewName] = useState(`Title:${truncateForViewName(initialTitle)}`);
  const [matchCount, setMatchCount] = useState(0);
  const [regexError, setRegexError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addView = useLogStore(state => state.addView);
  const setPreviewTitleFilter = useLogStore(state => state.setPreviewTitleFilter);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Update view name when pattern changes
  useEffect(() => {
    setViewName(`Title:${truncateForViewName(pattern)}`);
  }, [pattern]);

  // Debounced match counting and preview highlighting
  useEffect(() => {
    const timer = setTimeout(() => {
      // Validate regex
      if (operator === 'regex' && pattern) {
        if (!isValidRegex(pattern)) {
          setRegexError('Invalid regex pattern');
          setMatchCount(0);
          setPreviewTitleFilter(null);
          return;
        }
      }
      setRegexError(null);

      if (!pattern) {
        setMatchCount(0);
        setPreviewTitleFilter(null);
        return;
      }

      // Count matches
      const filter = { pattern, operator, caseSensitive };
      const matches = entries.filter(e => matchesPreviewTitleFilter(e, filter));
      setMatchCount(matches.length);

      // Set preview filter for grid highlighting
      setPreviewTitleFilter(filter);
    }, 500);

    return () => clearTimeout(timer);
  }, [pattern, operator, caseSensitive, entries, setPreviewTitleFilter]);

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      setPreviewTitleFilter(null);
    };
  }, [setPreviewTitleFilter]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
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

  const handleCreateView = () => {
    if (!pattern || regexError) return;

    // Convert operator to titleFilter format
    const titleFilterOperator = operator === 'starts-with' ? 'contains' : operator;

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
        titleFilter: {
          value: operator === 'starts-with' ? `^${pattern}` : pattern,
          operator: operator === 'starts-with' ? 'regex' : titleFilterOperator,
          inverse: false,
          caseSensitive,
        },
      },
      highlightRules: [],
      useGlobalHighlights: true,
      autoScroll: true,
    }, true);

    onClose();
  };

  const totalEntries = entries.length;
  const isValid = pattern && !regexError;

  return (
    <div className="title-filter-modal-overlay">
      <div ref={modalRef} className="title-filter-modal">
        {/* Header */}
        <div className="title-filter-modal-header">
          <h3>Create View from Title</h3>
          <button className="title-filter-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="title-filter-modal-content">
          {/* Filter Type */}
          <div className="title-filter-field">
            <label>Filter Type</label>
            <div className="title-filter-type-buttons">
              <button
                className={`title-filter-type-btn ${operator === 'contains' ? 'active' : ''}`}
                onClick={() => setOperator('contains')}
              >
                Contains
              </button>
              <button
                className={`title-filter-type-btn ${operator === 'starts-with' ? 'active' : ''}`}
                onClick={() => setOperator('starts-with')}
              >
                Starts with
              </button>
              <button
                className={`title-filter-type-btn ${operator === 'regex' ? 'active' : ''}`}
                onClick={() => setOperator('regex')}
              >
                Regex
              </button>
            </div>
          </div>

          {/* Pattern Input */}
          <div className="title-filter-field">
            <label>Pattern</label>
            <input
              ref={inputRef}
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Enter search pattern..."
              className={regexError ? 'error' : ''}
            />
            {regexError && <div className="title-filter-error">{regexError}</div>}
          </div>

          {/* Case Sensitive */}
          <div className="title-filter-field title-filter-checkbox">
            <label>
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
              />
              Case sensitive
            </label>
          </div>

          {/* Match Count */}
          <div className="title-filter-match-count">
            <span className="title-filter-match-number">{matchCount.toLocaleString()}</span>
            <span className="title-filter-match-label"> of {totalEntries.toLocaleString()} entries matched</span>
          </div>

          {/* Divider */}
          <div className="title-filter-divider" />

          {/* View Name */}
          <div className="title-filter-field">
            <label>View Name</label>
            <input
              type="text"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="View name..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="title-filter-modal-footer">
          <button className="title-filter-btn title-filter-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="title-filter-btn title-filter-btn-primary"
            onClick={handleCreateView}
            disabled={!isValid}
          >
            Create View
          </button>
        </div>
      </div>
    </div>
  );
}
