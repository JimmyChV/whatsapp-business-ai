import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    emptyText = 'No hay datos para mostrar.',
    containerProps = null,
    enableInfinite = true,
    initialBatch = 250,
    batchSize = 250
}) => {
    const wrapperRef = useRef(null);
    const containerPropsSafe = containerProps && typeof containerProps === 'object' ? containerProps : {};
    const externalOnScroll = typeof containerPropsSafe.onScroll === 'function' ? containerPropsSafe.onScroll : null;

    const visibleColumns = useMemo(
        () => columns.filter((column) => column && column.hidden !== true && String(column.key || '').trim()),
        [columns]
    );

    const safeRows = Array.isArray(rows) ? rows : [];
    const [visibleCount, setVisibleCount] = useState(() => (
        enableInfinite ? Math.min(Math.max(1, initialBatch), safeRows.length) : safeRows.length
    ));

    useEffect(() => {
        if (!enableInfinite) {
            setVisibleCount(safeRows.length);
            return;
        }
        setVisibleCount(Math.min(Math.max(1, initialBatch), safeRows.length));
    }, [enableInfinite, initialBatch, safeRows.length]);

    const canLoadMore = enableInfinite && visibleCount < safeRows.length;
    const loadMoreRows = useCallback(() => {
        if (!canLoadMore) return;
        setVisibleCount((previous) => Math.min(safeRows.length, previous + Math.max(50, batchSize)));
    }, [batchSize, canLoadMore, safeRows.length]);

    useEffect(() => {
        if (!enableInfinite) return;
        if (!canLoadMore) return;
        const node = wrapperRef.current;
        if (!node) return;
        if ((node.scrollHeight - node.clientHeight) <= 24) {
            loadMoreRows();
        }
    }, [canLoadMore, enableInfinite, loadMoreRows, visibleCount]);

    const handleScroll = useCallback((event) => {
        const node = event?.currentTarget;
        if (enableInfinite && node && canLoadMore) {
            const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
            if (distanceToBottom <= 120) {
                loadMoreRows();
            }
        }
        if (externalOnScroll) {
            externalOnScroll(event);
        }
    }, [canLoadMore, enableInfinite, externalOnScroll, loadMoreRows]);

    const renderedRows = useMemo(
        () => (enableInfinite ? safeRows.slice(0, visibleCount) : safeRows),
        [enableInfinite, safeRows, visibleCount]
    );

    const hasRows = renderedRows.length > 0;
    const colSpan = Math.max(visibleColumns.length, 1);

    return (
        <div
            className="saas-data-table-wrap"
            {...containerPropsSafe}
            ref={wrapperRef}
            onScroll={handleScroll}
        >
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
                    ) : renderedRows.map((row, index) => {
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
