import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Columns3, RotateCcw } from 'lucide-react';
import {
    SaasDataTable,
    SaasDetailPanel,
    SaasTableDetailLayout,
    SaasViewHeader,
    useSaasViewPreferences
} from '../layout';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import { applyMultiSort, normalizeSortState } from '../layout/sortUtils';

const EMPTY_ARRAY = [];

function normalizeColumns(columns = [], visibleColumnKeys = [], columnOrder = []) {
    const safeColumns = Array.isArray(columns) ? columns.filter((column) => column && column.key) : [];
    const order = Array.isArray(columnOrder) ? columnOrder : [];
    const configurableColumns = safeColumns.filter((column) => column.configurable !== false);
    const fixedColumns = safeColumns.filter((column) => column.configurable === false);
    const orderedConfigurable = [
        ...order.map((key) => configurableColumns.find((column) => column.key === key)).filter(Boolean),
        ...configurableColumns.filter((column) => !order.includes(column.key))
    ];
    const visible = new Set(Array.isArray(visibleColumnKeys) ? visibleColumnKeys : []);
    return [
        ...fixedColumns,
        ...orderedConfigurable
    ].map((column) => ({
        ...column,
        hidden: column.configurable === false
            ? column.hidden
            : (visible.size > 0 ? !visible.has(column.key) : column.hidden)
    }));
}

function getColumnTextLabel(column = {}) {
    const rawLabel = column.menuLabel ?? column.sortLabel ?? column.label ?? column.key;
    if (typeof rawLabel === 'string' || typeof rawLabel === 'number') {
        const normalized = String(rawLabel).trim();
        if (!normalized) return normalized;
        return normalized
            .toLocaleLowerCase('es')
            .split(' ')
            .map((word) => {
                if (!word) return word;
                return word.charAt(0).toLocaleUpperCase('es') + word.slice(1);
            })
            .join(' ');
    }
    return String(column.key || '');
}

function getConfigurableColumns(columns = []) {
    return (Array.isArray(columns) ? columns : [])
        .filter((column) => column && column.key && column.configurable !== false);
}

function getSortableColumns(columns = []) {
    return getConfigurableColumns(columns)
        .filter((column) => column.sortable !== false)
        .map((column) => ({
            ...column,
            label: getColumnTextLabel(column)
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

function normalizeEntityFilters(filters = null, columns = []) {
    const explicitFilters = Array.isArray(filters) ? filters.filter((filter) => filter && filter.key) : [];
    const explicitByKey = new Map(explicitFilters.map((filter) => [String(filter.key), filter]));
    const inferredFilters = getConfigurableColumns(columns)
        .filter((column) => column.filterable !== false)
        .map((column) => ({
            key: column.key,
            label: column.menuLabel ?? column.sortLabel ?? column.label ?? column.key,
            type: column.type === 'select' ? 'option' : (column.type || 'text'),
            options: Array.isArray(column.options) ? column.options : undefined
        }));
    const combined = [
        ...explicitFilters,
        ...inferredFilters.filter((filter) => !explicitByKey.has(String(filter.key)))
    ];
    return combined.map((filter) => ({
        ...filter,
        type: filter.type === 'select' ? 'option' : (filter.type || 'text')
    }));
}

function matchesFilterValue(rowValue, filterValue = {}) {
    const operator = String(filterValue.operator || 'contains').trim();
    const expected = String(filterValue.value ?? '').trim().toLowerCase();
    const actual = String(rowValue ?? '').trim().toLowerCase();
    if (operator === 'is_empty') return !actual;
    if (operator === 'not_empty') return Boolean(actual);
    if (!expected) return true;
    if (operator === 'equals') return actual === expected;
    if (operator === 'not_equals') return actual !== expected;
    if (operator === 'starts_with') return actual.startsWith(expected);
    if (operator === 'ends_with') return actual.endsWith(expected);
    return actual.includes(expected);
}

function applyStructuredFilter(rows = [], filterValue = {}) {
    const columnKey = String(filterValue?.columnKey || '').trim();
    if (!columnKey) return rows;
    return rows.filter((row) => matchesFilterValue(row?.[columnKey], filterValue));
}

function normalizeFilterItem(filterValue = {}) {
    return {
        id: String(filterValue?.id || ''),
        columnKey: String(filterValue?.columnKey || '').trim(),
        operator: String(filterValue?.operator || 'contains').trim().toLowerCase() || 'contains',
        value: filterValue?.value ?? ''
    };
}

function normalizeFilterItems(items = null) {
    if (!Array.isArray(items)) return [{ id: 'filter_1', columnKey: '', operator: 'contains', value: '' }];
    if (items.length === 0) return [{ id: 'filter_1', columnKey: '', operator: 'contains', value: '' }];
    return items.map((item, index) => {
        const normalized = normalizeFilterItem(item);
        return { ...normalized, id: normalized.id || `filter_${index + 1}` };
    });
}

function isActiveFilterItem(filterValue = {}) {
    const normalized = normalizeFilterItem(filterValue);
    if (!normalized.columnKey) return false;
    if (normalized.operator === 'is_empty' || normalized.operator === 'not_empty') return true;
    return Boolean(String(normalized.value ?? '').trim());
}

function applyStructuredFilters(rows = [], filterItems = []) {
    const activeFilters = normalizeFilterItems(filterItems).filter(isActiveFilterItem);
    return activeFilters.reduce((acc, filterValue) => applyStructuredFilter(acc, filterValue), rows);
}

function ColumnMenu({
    columns = EMPTY_ARRAY,
    preferences,
    className = ''
}) {
    const [open, setOpen] = useState(false);
    const menuColumns = useMemo(() => getConfigurableColumns(columns), [columns]);
    const visible = new Set(preferences?.visibleColumnKeys || []);
    return (
        <div className={['saas-entity-columns', className].filter(Boolean).join(' ')}>
            <button type="button" className="saas-btn saas-header-btn saas-header-btn--secondary saas-btn-columns" onClick={() => setOpen((prev) => !prev)}>
                <Columns3 size={15} strokeWidth={2} />
                <span className="saas-btn-text">Columnas</span>
            </button>
            {open ? (
                <div className="saas-entity-columns__menu">
                    {menuColumns.map((column) => (
                        <label key={column.key} className="saas-entity-columns__item">
                            <input
                                type="checkbox"
                                checked={visible.has(column.key)}
                                onChange={() => preferences?.toggleColumn?.(column.key)}
                            />
                            <span>{getColumnTextLabel(column)}</span>
                        </label>
                    ))}
                    <div className="saas-entity-columns__actions">
                        <button type="button" onClick={() => preferences?.setVisibleColumnKeys?.(menuColumns.map((column) => column.key))}>
                            <CheckSquare size={14} strokeWidth={2} />
                            <span>Todas</span>
                        </button>
                        <button type="button" onClick={preferences?.resetColumns}>
                            <RotateCcw size={14} strokeWidth={2} />
                            <span>Restablecer</span>
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
    confirmCloseMessage = 'Hay cambios sin guardar. ¿Deseas cerrar de todos modos?',
    requestJson = null,
    loading = false,
    emptyText = 'No hay datos para mostrar.',
    searchPlaceholder = 'Buscar...',
    actions = EMPTY_ARRAY,
    filters = null,
    onFilterChange = null,
    header = null,
    left = null,
    right: rightSlot = null,
    layoutClassName = '',
    dataSectionKey = '',
    extra = null,
    className = '',
    detailTitle = '',
    detailSubtitle = '',
    detailActions = null,
    hideCloseButton = false,
    detailShell = true,
    children = null
}) {
    const { confirm } = useUiFeedback();
    const preferences = useSaasViewPreferences(sectionKey || id || title, columns, { requestJson });
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState([{ id: 'filter_1', columnKey: '', operator: 'contains', value: '' }]);
    const filterColumns = useMemo(() => normalizeEntityFilters(filters, columns), [columns, filters]);
    const filterConfig = useMemo(() => {
        if (filterColumns.length === 0) return null;
        return {
            columns: filterColumns,
            items: activeFilters,
            onItemsChange: (nextFilters) => {
                const normalized = normalizeFilterItems(nextFilters);
                setActiveFilters(normalized);
                if (typeof onFilterChange === 'function') onFilterChange(normalized);
            },
            onClear: () => {
                const cleared = [{ id: 'filter_1', columnKey: '', operator: 'contains', value: '' }];
                setActiveFilters(cleared);
                if (typeof onFilterChange === 'function') onFilterChange(cleared);
            }
        };
    }, [activeFilters, filterColumns, onFilterChange]);
    const effectiveColumns = useMemo(
        () => normalizeColumns(columns, preferences.visibleColumnKeys, preferences.columnOrder),
        [columns, preferences.columnOrder, preferences.visibleColumnKeys]
    );
    const sortableColumns = useMemo(() => getSortableColumns(columns), [columns]);
    const visibleRows = useMemo(
        () => applyMultiSort(applyStructuredFilters(applySearch(rows, columns, search), activeFilters), preferences.sort),
        [activeFilters, columns, preferences.sort, rows, search]
    );
    const normalizedSort = useMemo(() => normalizeSortState(preferences.sort), [preferences.sort]);
    const hasSelection = Boolean(selectedId);
    const close = async () => {
        if (dirty) {
            const ok = await confirm({
                title: 'Cambios sin guardar',
                message: confirmCloseMessage,
                confirmText: 'Cerrar de todos modos',
                cancelText: 'Volver',
                tone: 'warn'
            });
            if (!ok) return;
        }
        onClose?.();
    };

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            if (!hasSelection) return;
            void close();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    if ((header || left || rightSlot) && columns.length === 0 && rows.length === 0) {
        return (
            <section
                id={id || undefined}
                className={['saas-admin-card saas-admin-card--full saas-entity-page', className].filter(Boolean).join(' ')}
                data-saas-section-key={dataSectionKey || sectionKey || undefined}
            >
                <SaasTableDetailLayout
                    selectedId={selectedId}
                    className={layoutClassName || 'saas-entity-layout'}
                    header={header}
                    left={left}
                    right={rightSlot}
                />
                {children}
            </section>
        );
    }

    if (children && !title && columns.length === 0 && rows.length === 0) {
        return (
            <section
                id={id || undefined}
                className={['saas-admin-card saas-admin-card--full saas-entity-page', className].filter(Boolean).join(' ')}
                data-saas-section-key={dataSectionKey || sectionKey || undefined}
            >
                {children}
            </section>
        );
    }

    const rightContent = mode === 'form' && typeof renderForm === 'function'
        ? renderForm({ close })
        : (typeof renderDetail === 'function' ? renderDetail({ close }) : null);
    const resolvedDetailActions = typeof detailActions === 'function' ? detailActions({ close }) : detailActions;
    const detailPanelActions = hideCloseButton ? resolvedDetailActions : (
        <>
            {resolvedDetailActions}
            <button type="button" className="saas-btn-cancel" onClick={() => { void close(); }}>
                Volver
            </button>
        </>
    );

    const right = hasSelection ? (detailShell ? (
        <SaasDetailPanel
            title={detailTitle || title}
            subtitle={detailSubtitle}
            className="saas-entity-detail-panel"
            bodyClassName="saas-entity-detail-panel__body"
            actions={detailPanelActions}
        >
            {rightContent}
        </SaasDetailPanel>
    ) : rightContent) : null;

    return (
        <section
            id={id || undefined}
            className={['saas-admin-card saas-admin-card--full saas-entity-page', className].filter(Boolean).join(' ')}
            data-saas-section-key={dataSectionKey || sectionKey || undefined}
        >
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
                        filters={filterConfig}
                        sortConfig={{
                            columns: sortableColumns,
                            items: normalizedSort.items,
                            columnKey: normalizedSort.columnKey,
                            direction: normalizedSort.direction
                        }}
                        onSortChange={preferences.setSort}
                        actionsExtra={<ColumnMenu columns={columns} preferences={preferences} />}
                        extra={extra}
                    />
                )}
                left={(
                    <SaasDataTable
                        columns={effectiveColumns}
                        rows={visibleRows}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        sortConfig={preferences.sort}
                        onSortChange={preferences.setSort}
                        loading={loading}
                        emptyText={emptyText}
                    />
                )}
                right={right}
            />
        </section>
    );
}
