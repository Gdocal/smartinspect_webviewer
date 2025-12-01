/**
 * ContextMenu - Enterprise-grade context menu component
 *
 * Features:
 * - Positioned at mouse click location
 * - Auto-closes on click outside or Escape key
 * - Supports keyboard navigation
 * - Supports separators and disabled items
 * - Accessible (ARIA attributes)
 * - Handles viewport boundary detection
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    shortcut?: string;
    disabled?: boolean;
    danger?: boolean;
    separator?: boolean;
    onClick?: () => void;
}

interface ContextMenuProps {
    items: ContextMenuItem[];
    position: { x: number; y: number };
    onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPosition, setAdjustedPosition] = useState(position);
    const [focusedIndex, setFocusedIndex] = useState(-1);

    // Adjust position to stay within viewport
    useEffect(() => {
        if (menuRef.current) {
            const menu = menuRef.current;
            const rect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let x = position.x;
            let y = position.y;

            // Adjust horizontal position if menu would overflow right edge
            if (x + rect.width > viewportWidth - 8) {
                x = viewportWidth - rect.width - 8;
            }

            // Adjust vertical position if menu would overflow bottom edge
            if (y + rect.height > viewportHeight - 8) {
                y = viewportHeight - rect.height - 8;
            }

            // Ensure minimum margins
            x = Math.max(8, x);
            y = Math.max(8, y);

            setAdjustedPosition({ x, y });
        }
    }, [position]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleContextMenu = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        // Use timeout to avoid closing immediately on the same click that opened it
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('contextmenu', handleContextMenu);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [onClose]);

    // Close on Escape, handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key) {
                case 'Escape':
                    event.preventDefault();
                    onClose();
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    setFocusedIndex(prev => {
                        const actionableItems = items.filter(item => !item.separator && !item.disabled);
                        const currentActionableIndex = actionableItems.findIndex(
                            (_, i) => items.indexOf(actionableItems[i]) === prev
                        );
                        const nextIndex = (currentActionableIndex + 1) % actionableItems.length;
                        return items.indexOf(actionableItems[nextIndex]);
                    });
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    setFocusedIndex(prev => {
                        const actionableItems = items.filter(item => !item.separator && !item.disabled);
                        const currentActionableIndex = actionableItems.findIndex(
                            (_, i) => items.indexOf(actionableItems[i]) === prev
                        );
                        const nextIndex = currentActionableIndex <= 0
                            ? actionableItems.length - 1
                            : currentActionableIndex - 1;
                        return items.indexOf(actionableItems[nextIndex]);
                    });
                    break;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    if (focusedIndex >= 0 && focusedIndex < items.length) {
                        const item = items[focusedIndex];
                        if (item && !item.disabled && !item.separator && item.onClick) {
                            item.onClick();
                            onClose();
                        }
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [items, focusedIndex, onClose]);

    // Focus menu on mount for keyboard navigation
    useEffect(() => {
        menuRef.current?.focus();
    }, []);

    const handleItemClick = useCallback((item: ContextMenuItem) => {
        if (item.disabled || item.separator) return;
        item.onClick?.();
        onClose();
    }, [onClose]);

    return createPortal(
        <div
            ref={menuRef}
            role="menu"
            tabIndex={-1}
            className="fixed z-[100] min-w-[180px] py-1 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 outline-none"
            style={{
                left: adjustedPosition.x,
                top: adjustedPosition.y,
            }}
        >
            {items.map((item, index) => {
                if (item.separator) {
                    return (
                        <div
                            key={item.id}
                            className="my-1 border-t border-slate-200 dark:border-slate-700"
                            role="separator"
                        />
                    );
                }

                const isFocused = focusedIndex === index;

                return (
                    <button
                        key={item.id}
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => handleItemClick(item)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors outline-none ${
                            item.disabled
                                ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                : item.danger
                                    ? isFocused
                                        ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                        : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                                    : isFocused
                                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        {item.icon && (
                            <span className={`w-4 h-4 flex-shrink-0 ${
                                item.disabled ? 'opacity-50' : ''
                            }`}>
                                {item.icon}
                            </span>
                        )}
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                            <span className={`text-xs flex-shrink-0 ${
                                item.disabled
                                    ? 'text-slate-400 dark:text-slate-600'
                                    : 'text-slate-400 dark:text-slate-500'
                            }`}>
                                {item.shortcut}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>,
        document.body
    );
}

// Hook for managing context menu state
export interface ContextMenuState<T = unknown> {
    isOpen: boolean;
    position: { x: number; y: number };
    data: T | null;
}

export function useContextMenu<T = unknown>() {
    const [state, setState] = useState<ContextMenuState<T>>({
        isOpen: false,
        position: { x: 0, y: 0 },
        data: null,
    });

    const open = useCallback((event: React.MouseEvent, data: T) => {
        event.preventDefault();
        event.stopPropagation();
        setState({
            isOpen: true,
            position: { x: event.clientX, y: event.clientY },
            data,
        });
    }, []);

    const close = useCallback(() => {
        setState(prev => ({ ...prev, isOpen: false }));
    }, []);

    return { state, open, close };
}
