import { memo } from 'react';
import type { ColumnConfig } from './types';

interface VirtualLogGridHeaderProps {
  columns: ColumnConfig[];
}

export const VirtualLogGridHeader = memo(function VirtualLogGridHeader({
  columns,
}: VirtualLogGridHeaderProps) {
  return (
    <div className="vlg-header">
      {columns.filter(col => !col.hidden).map((column) => (
        <div
          key={column.id}
          className={`vlg-header-cell vlg-header-${column.id}`}
          style={{
            width: column.width,
            flex: column.flex,
            minWidth: column.minWidth,
            textAlign: column.align,
          }}
        >
          {column.header}
        </div>
      ))}
    </div>
  );
});
