import React, { useEffect, useMemo, useState } from 'react';
import {
    SaasDataTable,
    SaasDetailPanel,
    SaasTableDetailLayout,
    SaasViewHeader,
    useSaasViewPreferences
} from '../layout';

const EMPTY_ARRAY = [];

function normalizeColumns(columns = [], visibleColumnKeys = [], columnOrder = []) {
    const safeColumns = Array.isArray(columns) ? columns.filter((column) => column && column.key) : [];
    const order = Array.isArray(columnOrder) ? columnOrder : [];
    const ordered = [
        ...order.map((key) => safeColumns.find((column) => column.key === key)).filter(Boolean),
        ...safeColumns.filter((column) => !order.includes(column.key))
    ];
    const visible = new Set(Array.isArray(visibleColumnKeys) ? visibleColumnKeys : []);
    return ordered.map((column) => ({
        ...column,
        hidden: visible.size > 0 ? !visible.has(column.key) : column.hidden
    }));
}

function defaultRowText(row = {}, columns = []) {
    return columns
        .map((column) => row?.[column.key])
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');
}

function applySearch(rows = [], columns = [], search = '') {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => defaultRowText(row, columns).includes(query));
}

function applySort(rows = [], sort = {}) {
    const columnKey = String(sort?.columnKey || '').trim();
    if (!columnKey) return rows;
    const direction = String(sort?.direction || 'asc') === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
        const left = String(a?.[columnKey] ?? '').trim();
        const right = String(b?.[columnKey] ?? '').trim();
        return left.localeCompare(right, 'es', { numeric: true, sensitivity: 'base' }) * direction;
    });
}

function ColumnMenu({
    columns = EMPTY_ARRAY,
    preferences,
    className = ''
}) {
    const [open, setOpen] = useState(false);
    const visible = new Set(preferences?.visibleColumnKeys || []);
    return (
        <div className={['saas-entity-columns', className].filter(Boolean).join(' ')}>
            <button type="button" onClick={() => setOpen((prev) => !prev)}>
                Columnas
            </button>
            {open ? (
                <div className="saas-entity-columns__menu">
                    {columns.map((column) => (
                        <label key={column.key} className="saas-entity-columns__item">
                            <input
                                type="checkbox"
                                checked={visible.has(column.key)}
                                onChange={() => preferences?.toggleColumn?.(column.key)}
                            />
                            <span>{column.label || column.key}</span>
                        </label>
                    ))}
                    <div className="saas-entity-columns__actions">
                        <button type="button" onClick={() => preferences?.setVisibleColumnKeys?.(columns.map((column) => column.key))}>
                            Todas
                        </button>
                        <button type="button" onClick={preferences?.resetColumns}>
                            Restablecer
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function SaasEntityPage({
    id = '',
    sectionKey = '',
    title = '',
    rows = EMPTY_ARRAY,
    columns = EMPTY_ARRAY,
    selectedId = '',
    onSelect = null,
    onClose = null,
    renderDetail = null,
    renderForm = null,
    mode = 'detail',
    dirty = false,
    confirmCloseMessage = 'Hay cambios sin guardar. ?Deseas cerrar de todos modos?',
    requestJson = null,
    loading = false,
    emptyText = 'No hay datos para mostrar.',
    searchPlaceholder = 'Buscar...',
    actions = EMPTY_ARRAY,
    filters = null,
    extra = null,
    className = '',
    detailTitle = '',
    detailSubtitle = ''
}) {
    const preferences = useSaasViewPreferences(sectionKey || id || title, columns, { requestJson });
    const [search, setSearch] = useState('');
    const effectiveColumns = useMemo(
        () => normalizeColumns(columns, preferences.visibleColumnKeys, preferences.columnOrder),
        [columns, preferences.columnOrder, preferences.visibleColumnKeys]
    );
    const visibleRows = useMemo(
        () => applySort(applySearch(rows, columns, search), preferences.sort),
        [columns, preferences.sort, rows, search]
    );
    const hasSelection = Boolean(selectedId);
    const close = () => {
        if (dirty && typeof window !== 'undefined' && !window.confirm(confirmCloseMessage)) return;
        onClose?.();
    };

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            if (!hasSelection) return;
            close();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const right = hasSelection ? (
        <SaasDetailPanel
            title={detailTitle || title}
            subtitle={detailSubtitle}
            className="saas-entity-detail-panel"
            bodyClassName="saas-entity-detail-panel__body"
            actions={(
                <button type="button" className="saas-btn-cancel" onClick={close}>
                    Cerrar
                </button>
            )}
        >
            {mode === 'form' && typeof renderForm === 'function'
                ? renderForm({ close })
                : (typeof renderDetail === 'function' ? renderDetail({ close }) : null)}
        </SaasDetailPanel>
    ) : null;

    return (
        <section id={id || undefined} className={['saas-admin-card saas-admin-card--full saas-entity-page', className].filter(Boolean).join(' ')}>
            <SaasTableDetailLayout
                selectedId={selectedId}
                className="saas-entity-layout"
                header={(
                    <SaasViewHeader
                        title={title}
                        count={visibleRows.length}
                        searchValue={search}
                        onSearchChange={setSearch}
                        searchPlaceholder={searchPlaceholder}
                        actions={actions}
                        filters={filters}
                        sortConfig={{
                            columns,
                            columnKey: preferences.sort?.columnKey || '',
                            direction: preferences.sort?.direction || 'asc'
                        }}
                        onSortChange={preferences.setSort}
                        extra={(
                            <>
                                <ColumnMenu columns={columns} preferences={preferences} />
                                {extra}
                            </>
                        )}
                    />
                )}
                left={(
                    <SaasDataTable
                        columns={effectiveColumns}
                        rows={visibleRows}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        loading={loading}
                        emptyText={emptyText}
                    />
                )}
                right={right}
            />
        </section>
    );
}
