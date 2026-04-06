import React, { useMemo } from 'react';

const resolveRowId = (row, index) => {
    if (row && typeof row === 'object') {
        const preferred = row.id || row.customerId || row.templateId || row.campaignId;
        if (preferred !== undefined && preferred !== null && String(preferred).trim()) {
            return String(preferred).trim();
        }
    }
    return `row-${index}`;
};

const SaasDataTable = ({
    columns = [],
    rows = [],
    selectedId = null,
    onSelect,
    loading = false,
    emptyText = 'No hay datos para mostrar.'
}) => {
    const visibleColumns = useMemo(
        () => columns.filter((column) => column && column.hidden !== true && String(column.key || '').trim()),
        [columns]
    );

    const hasRows = Array.isArray(rows) && rows.length > 0;
    const colSpan = Math.max(visibleColumns.length, 1);

    return (
        <div className="saas-data-table-wrap">
            <table className="saas-data-table">
                <thead>
                    <tr>
                        {visibleColumns.map((column) => (
                            <th
                                key={column.key}
                                style={column.width ? { width: column.width } : undefined}
                                className={column.align ? `is-${column.align}` : ''}
                            >
                                {column.label || column.key}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr>
                            <td colSpan={colSpan} className="saas-data-table__state">
                                Cargando...
                            </td>
                        </tr>
                    ) : !hasRows ? (
                        <tr>
                            <td colSpan={colSpan} className="saas-data-table__state">
                                {emptyText}
                            </td>
                        </tr>
                    ) : rows.map((row, index) => {
                        const rowId = resolveRowId(row, index);
                        const isSelected = Boolean(selectedId) && String(selectedId) === rowId;
                        return (
                            <tr
                                key={rowId}
                                className={isSelected ? 'is-selected' : ''}
                                onClick={onSelect ? () => onSelect(row, rowId) : undefined}
                                role={onSelect ? 'button' : undefined}
                                tabIndex={onSelect ? 0 : undefined}
                                onKeyDown={onSelect ? (event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onSelect(row, rowId);
                                    }
                                } : undefined}
                            >
                                {visibleColumns.map((column) => {
                                    const value = row && typeof row === 'object' ? row[column.key] : undefined;
                                    return (
                                        <td key={`${rowId}-${column.key}`} className={column.align ? `is-${column.align}` : ''}>
                                            {typeof column.render === 'function' ? column.render(value, row, rowId) : (value ?? '-')}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default SaasDataTable;
