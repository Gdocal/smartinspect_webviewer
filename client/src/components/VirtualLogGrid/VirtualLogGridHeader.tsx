import { memo, useState, useCallback, useRef } from 'react';
import type { ColumnConfig } from './types';
import { ColumnMenu } from './ColumnMenu';

interface VirtualLogGridHeaderProps {
  columns: ColumnConfig[];
  onColumnsChange?: (columns: ColumnConfig[]) => void;
  hasScrollbar?: boolean;
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

  // Drag state
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; columnId: string } | null>(null);

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

    // Get the actual indices in the full columns array
    const currentFullIndex = columns.findIndex(col => col.id === columnId);
    const targetColumnId = visibleColumns[newIndex].id;
    const targetFullIndex = columns.findIndex(col => col.id === targetColumnId);

    // Swap columns
    const newColumns = [...columns];
    [newColumns[currentFullIndex], newColumns[targetFullIndex]] =
      [newColumns[targetFullIndex], newColumns[currentFullIndex]];

    onColumnsChange(newColumns);
  }, [columns, onColumnsChange]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, columnId: string, columnType: string) => {
    // Don't allow dragging the icon column
    if (columnType === 'icon') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
    setDraggedColumnId(columnId);
    dragRef.current = { startX: e.clientX, columnId };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string, columnType: string) => {
    e.preventDefault();
    // Don't allow dropping on icon column
    if (columnType === 'icon') return;
    e.dataTransfer.dropEffect = 'move';
    if (columnId !== draggedColumnId) {
      setDropTargetId(columnId);
    }
  }, [draggedColumnId]);

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetColumnId: string, targetColumnType: string) => {
    e.preventDefault();
    // Don't allow dropping on icon column
    if (targetColumnType === 'icon') return;

    const sourceColumnId = e.dataTransfer.getData('text/plain');
    if (!sourceColumnId || sourceColumnId === targetColumnId || !onColumnsChange) {
      setDraggedColumnId(null);
      setDropTargetId(null);
      return;
    }

    // Find indices and reorder
    const sourceIndex = columns.findIndex(col => col.id === sourceColumnId);
    const targetIndex = columns.findIndex(col => col.id === targetColumnId);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggedColumnId(null);
      setDropTargetId(null);
      return;
    }

    // Remove from old position and insert at new
    const newColumns = [...columns];
    const [movedColumn] = newColumns.splice(sourceIndex, 1);
    newColumns.splice(targetIndex, 0, movedColumn);

    onColumnsChange(newColumns);
    setDraggedColumnId(null);
    setDropTargetId(null);
  }, [columns, onColumnsChange]);

  const handleDragEnd = useCallback(() => {
    setDraggedColumnId(null);
    setDropTargetId(null);
    dragRef.current = null;
  }, []);

  // Scrollbar width - matches ::-webkit-scrollbar width in CSS
  const scrollbarWidth = 8;

  return (
    <>
      <div
        className="vlg-header"
        style={{ paddingRight: hasScrollbar ? scrollbarWidth : 0 }}
        onContextMenu={(e) => handleContextMenu(e)}
      >
        {columns.filter(col => !col.hidden).map((column) => (
          <div
            key={column.id}
            className={`vlg-header-cell vlg-header-${column.id}${
              draggedColumnId === column.id ? ' dragging' : ''
            }${dropTargetId === column.id ? ' drop-target' : ''}`}
            style={{
              width: column.width,
              flex: column.flex,
              minWidth: column.minWidth,
              textAlign: column.align,
              cursor: column.type !== 'icon' ? 'grab' : 'default',
            }}
            draggable={column.type !== 'icon'}
            onDragStart={(e) => handleDragStart(e, column.id, column.type)}
            onDragOver={(e) => handleDragOver(e, column.id, column.type)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id, column.type)}
            onDragEnd={handleDragEnd}
            onContextMenu={(e) => {
              e.stopPropagation();
              handleContextMenu(e, column.id);
            }}
          >
            {column.header}
          </div>
        ))}
      </div>

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
