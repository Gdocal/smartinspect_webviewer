import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnConfig } from './types';
import { ColumnMenu } from './ColumnMenu';

interface VirtualLogGridHeaderProps {
  columns: ColumnConfig[];
  onColumnsChange?: (columns: ColumnConfig[]) => void;
  hasScrollbar?: boolean;
}

interface DragState {
  columnId: string;
  columnHeader: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  sourceRect: DOMRect;
  headerStyle: React.CSSProperties;
}

export const VirtualLogGridHeader = memo(function VirtualLogGridHeader({
  columns,
  onColumnsChange,
  hasScrollbar = false,
}: VirtualLogGridHeaderProps) {
  const [menuState, setMenuState] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    targetColumnId?: string;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dropTargetRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    dropTargetRef.current = dropTargetId;
  }, [dropTargetId]);

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState) return;

    const findDropTarget = (clientX: number): string | null => {
      if (!headerRef.current) return null;

      const cells = headerRef.current.querySelectorAll('.vlg-header-cell');
      for (const cell of cells) {
        const rect = cell.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right) {
          // Get column id from data attribute
          const columnId = (cell as HTMLElement).dataset.columnId;
          if (columnId && columnId !== 'icon' && columnId !== dragState.columnId) {
            return columnId;
          }
        }
      }
      return null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      setDragState(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
      const target = findDropTarget(e.clientX);
      setDropTargetId(target);
      dropTargetRef.current = target;
    };

    const handleMouseUp = () => {
      const currentDropTarget = dropTargetRef.current;

      if (dragState && currentDropTarget && onColumnsChange) {
        const sourceIndex = columns.findIndex(col => col.id === dragState.columnId);
        const targetIndex = columns.findIndex(col => col.id === currentDropTarget);

        if (sourceIndex !== -1 && targetIndex !== -1 && sourceIndex !== targetIndex) {
          const newColumns = [...columns];
          const [movedColumn] = newColumns.splice(sourceIndex, 1);
          newColumns.splice(targetIndex, 0, movedColumn);
          onColumnsChange(newColumns);
        }
      }

      setDragState(null);
      setDropTargetId(null);
      dropTargetRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, columns, onColumnsChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent, columnId?: string) => {
    e.preventDefault();
    setMenuState({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      targetColumnId: columnId,
    });
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleToggleColumn = useCallback((columnId: string) => {
    if (!onColumnsChange) return;

    const newColumns = columns.map(col =>
      col.id === columnId ? { ...col, hidden: !col.hidden } : col
    );
    onColumnsChange(newColumns);
  }, [columns, onColumnsChange]);

  const handleMoveColumn = useCallback((columnId: string, direction: 'left' | 'right') => {
    if (!onColumnsChange) return;

    const visibleColumns = columns.filter(col => !col.hidden);
    const currentIndex = visibleColumns.findIndex(col => col.id === columnId);

    if (currentIndex === -1) return;

    const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= visibleColumns.length) return;

    const currentFullIndex = columns.findIndex(col => col.id === columnId);
    const targetColumnId = visibleColumns[newIndex].id;
    const targetFullIndex = columns.findIndex(col => col.id === targetColumnId);

    const newColumns = [...columns];
    [newColumns[currentFullIndex], newColumns[targetFullIndex]] =
      [newColumns[targetFullIndex], newColumns[currentFullIndex]];

    onColumnsChange(newColumns);
  }, [columns, onColumnsChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent, column: ColumnConfig) => {
    if (column.type === 'icon') return;
    if (e.button !== 0) return; // Only left click

    const cell = e.currentTarget as HTMLElement;
    const rect = cell.getBoundingClientRect();

    // Get computed styles for the floating clone
    const computedStyle = window.getComputedStyle(cell);

    setDragState({
      columnId: column.id,
      columnHeader: column.header,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      sourceRect: rect,
      headerStyle: {
        width: rect.width,
        height: rect.height,
        backgroundColor: computedStyle.backgroundColor,
        color: computedStyle.color,
        fontWeight: computedStyle.fontWeight,
        fontSize: computedStyle.fontSize,
        fontFamily: computedStyle.fontFamily,
        padding: computedStyle.padding,
        textAlign: column.align || 'left',
      },
    });

    e.preventDefault();
  }, []);

  const scrollbarWidth = 8;

  // Calculate floating header position
  const floatingStyle: React.CSSProperties | null = dragState ? {
    position: 'fixed',
    left: dragState.sourceRect.left + (dragState.currentX - dragState.startX),
    top: dragState.sourceRect.top + (dragState.currentY - dragState.startY),
    ...dragState.headerStyle,
    zIndex: 10000,
    pointerEvents: 'none',
    opacity: 0.9,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    border: '1px solid var(--vlg-border)',
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    cursor: 'grabbing',
  } : null;

  return (
    <>
      <div
        ref={headerRef}
        className={`vlg-header${dragState ? ' dragging-active' : ''}`}
        style={{ paddingRight: hasScrollbar ? scrollbarWidth : 0 }}
        onContextMenu={(e) => handleContextMenu(e)}
      >
        {columns.filter(col => !col.hidden).map((column) => {
          const isDragging = dragState?.columnId === column.id;
          const isDropTarget = dropTargetId === column.id;

          return (
            <div
              key={column.id}
              data-column-id={column.id}
              className={`vlg-header-cell vlg-header-${column.id}${
                isDragging ? ' dragging' : ''
              }${isDropTarget ? ' drop-target' : ''}`}
              style={{
                width: column.width,
                flex: column.flex,
                minWidth: column.minWidth,
                textAlign: column.align,
                cursor: column.type !== 'icon' ? (dragState ? 'grabbing' : 'grab') : 'default',
              }}
              onMouseDown={(e) => handleMouseDown(e, column)}
              onContextMenu={(e) => {
                e.stopPropagation();
                handleContextMenu(e, column.id);
              }}
            >
              {column.header}
            </div>
          );
        })}
      </div>

      {/* Floating drag header */}
      {dragState && floatingStyle && createPortal(
        <div style={floatingStyle}>
          {dragState.columnHeader}
        </div>,
        document.body
      )}

      {menuState.isOpen && (
        <ColumnMenu
          columns={columns}
          position={menuState.position}
          onClose={handleCloseMenu}
          onToggleColumn={handleToggleColumn}
          onMoveColumn={handleMoveColumn}
          targetColumnId={menuState.targetColumnId}
        />
      )}
    </>
  );
});
