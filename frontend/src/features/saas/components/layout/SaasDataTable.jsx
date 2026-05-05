import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { normalizeSortState, promoteSortColumn } from './sortUtils';

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
    sortConfig = null,
    onSortChange = null,
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
    const normalizedSort = useMemo(() => normalizeSortState(sortConfig), [sortConfig]);
    const activeSortItems = normalizedSort.activeItems;
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
    const handleSortToggle = useCallback((column = null) => {
        if (typeof onSortChange !== 'function' || !column?.key || column.sortable === false) return;
        const nextColumnKey = String(column.key || '').trim();
        if (!nextColumnKey) return;
        onSortChange(promoteSortColumn(sortConfig, nextColumnKey));
    }, [onSortChange, sortConfig]);

    const hasRows = renderedRows.length > 0;
    const colSpan = Math.max(visibleColumns.length, 1);
    const tableMinWidth = visibleColumns.reduce((total, column) => {
        const raw = column?.minWidth;
        if (typeof raw === 'number' && Number.isFinite(raw)) return total + raw;
        const match = typeof raw === 'string' ? raw.match(/^(\d+(?:\.\d+)?)px$/i) : null;
        return total + (match ? Number(match[1]) : 160);
    }, 0);
    const resolvedTableMinWidth = Math.max(980, Math.ceil(tableMinWidth));

    return (
        <div
            className="saas-data-table-wrap"
            {...containerPropsSafe}
            style={{
                ...(containerPropsSafe.style || {}),
                overflowX: 'auto',
                overflowY: 'auto'
            }}
            ref={wrapperRef}
            onScroll={handleScroll}
        >
            <table className="saas-data-table" style={{ minWidth: `${resolvedTableMinWidth}px`, width: '100%' }}>
                <thead>
                    <tr>
                        {visibleColumns.map((column) => {
                            const isSortable = typeof onSortChange === 'function' && column.sortable !== false;
                            const normalizedColumnKey = String(column.key || '').trim();
                            const sortPriorityIndex = activeSortItems.findIndex((item) => item.columnKey === normalizedColumnKey);
                            const isActiveSort = sortPriorityIndex >= 0;
                            const SortIcon = !isSortable
                                ? null
                                : (isActiveSort
                                    ? ((activeSortItems[sortPriorityIndex]?.direction || 'asc') === 'desc' ? ChevronDown : ChevronUp)
                                    : ArrowUpDown);
                            return (
                                <th
                                    key={column.key}
                                    style={(() => {
                                        const style = {};
                                        if (column.width) style.width = column.width;
                                        if (column.minWidth) style.minWidth = column.minWidth;
                                        if (column.maxWidth) style.maxWidth = column.maxWidth;
                                        return Object.keys(style).length > 0 ? style : undefined;
                                    })()}
                                    className={[
                                        column.align ? `is-${column.align}` : '',
                                        isSortable ? 'is-sortable' : '',
                                        isActiveSort ? 'is-sorted' : ''
                                    ].filter(Boolean).join(' ')}
                                >
                                    {isSortable ? (
                                        <button
                                            type="button"
                                            className="saas-data-table__sort-button"
                                            onClick={() => handleSortToggle(column)}
                                            title={`Ordenar por ${column.label || column.key}`}
                                        >
                                            <span>{column.label || column.key}</span>
                                            <span className="saas-data-table__sort-meta">
                                                {SortIcon ? <SortIcon size={14} strokeWidth={2} /> : null}
                                                {isActiveSort ? (
                                                    <span className="saas-data-table__sort-priority" aria-hidden="true">
                                                        {sortPriorityIndex + 1}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </button>
                                    ) : (column.label || column.key)}
                                </th>
                            );
                        })}
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
                                        <td
                                            key={`${rowId}-${column.key}`}
                                            className={column.align ? `is-${column.align}` : ''}
                                            style={(() => {
                                                const style = {};
                                                if (column.width) style.width = column.width;
                                                if (column.minWidth) style.minWidth = column.minWidth;
                                                if (column.maxWidth) style.maxWidth = column.maxWidth;
                                                return Object.keys(style).length > 0 ? style : undefined;
                                            })()}
                                        >
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
