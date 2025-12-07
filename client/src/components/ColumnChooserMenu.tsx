/**
 * ColumnChooserMenu - Simple column visibility menu for panel grids
 * Used by WatchPanel and StreamsView for right-click column management
 * Uses a portal to render outside the component tree to avoid clipping issues
 */

import { useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';

export interface ColumnDef {
    id: string;
    label: string;
    hidden: boolean;
}

interface ColumnChooserMenuProps {
    columns: ColumnDef[];
    position: { x: number; y: number };
    onClose: () => void;
    onToggleColumn: (columnId: string) => void;
}

export const ColumnChooserMenu = memo(function ColumnChooserMenu({
    columns,
    position,
    onClose,
    onToggleColumn,
}: ColumnChooserMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside or pressing Escape
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

    console.log('[ColumnChooserMenu] Rendering at', position.x, position.y, 'columns:', columns.length);

    const menu = (
        <div
            ref={menuRef}
            className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-[10000] min-w-[160px]"
            style={{
                left: position.x,
                top: position.y,
            }}
        >
            {/* Header */}
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    Show/Hide Columns
                </span>
            </div>

            {/* Column checkboxes */}
            <div className="py-1 max-h-64 overflow-y-auto">
                {columns.map((column) => (
                    <label
                        key={column.id}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <input
                            type="checkbox"
                            checked={!column.hidden}
                            onChange={() => onToggleColumn(column.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="text-slate-700 dark:text-slate-300">
                            {column.label}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );

    // Use portal to render outside the component tree to avoid clipping
    return createPortal(menu, document.body);
});
