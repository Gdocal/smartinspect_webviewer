import { memo, useEffect, useRef } from 'react';
import type { ColumnConfig } from './types';

interface ColumnMenuProps {
  columns: ColumnConfig[];
  position: { x: number; y: number };
  onClose: () => void;
  onToggleColumn: (columnId: string) => void;
  onMoveColumn?: (columnId: string, direction: 'left' | 'right') => void;
  targetColumnId?: string;
}

export const ColumnMenu = memo(function ColumnMenu({
  columns,
  position,
  onClose,
  onToggleColumn,
}: ColumnMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${position.x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${position.y - rect.height}px`;
      }
    }
  }, [position]);

  return (
    <div
      ref={menuRef}
      className="vlg-column-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
    >
      {/* Column visibility section */}
      <div className="vlg-menu-section">
        <div className="vlg-menu-section-title">Show/Hide Columns</div>
        {columns
          .filter((column) => column.type !== 'icon') // Hide icon column from list
          .map((column) => (
          <label key={column.id} className="vlg-menu-item vlg-menu-checkbox">
            <input
              type="checkbox"
              checked={!column.hidden}
              onChange={() => onToggleColumn(column.id)}
            />
            <span>{column.header || column.id}</span>
          </label>
        ))}
      </div>
    </div>
  );
});
