import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowUpDown,
    Check,
    ChevronDown,
    ChevronUp,
    Columns3,
    Download,
    Edit2,
    Filter,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Upload,
    X
} from 'lucide-react';

const normalizeActions = (actions = []) => (
    Array.isArray(actions)
        ? actions.filter((action) => action && typeof action === 'object')
        : []
);

const resolveHeaderActionVariant = (action = {}) => {
    const explicitVariant = String(action?.variant || '').trim().toLowerCase();
    if (explicitVariant) return explicitVariant;
    const key = String(action?.key || action?.label || '').trim().toLowerCase();
    if (!key) return 'secondary';
    if (/(cancel|cerrar|close|delete|eliminar|danger)/.test(key)) return 'danger';
    if (/(create|new|nuevo|nueva|save|guardar|add|agregar|import|select|seleccionar|update|actualizar|next|siguiente|chat)/.test(key)) return 'primary';
    return 'secondary';
};

const resolveHeaderActionIcon = (action = {}) => {
    const key = String(action?.iconKey || action?.key || action?.label || '').trim().toLowerCase();
    if (/(refresh|reload|recargar|actualizar)/.test(key)) return RefreshCw;
    if (/(new|nuevo|nueva|add|agregar)/.test(key)) return Plus;
    if (/(column|columna)/.test(key)) return Columns3;
    if (/(filter|filtro)/.test(key)) return Filter;
    if (/(sort|ordenar)/.test(key)) return ArrowUpDown;
    if (/(clear|limpiar|trash)/.test(key)) return Trash2;
    if (/(close|cerrar|cancel|cancelar)/.test(key)) return X;
    if (/(edit|editar)/.test(key)) return Edit2;
    if (/(save|guardar|confirm)/.test(key)) return Check;
    if (/(export|descargar)/.test(key)) return Download;
    if (/(import|subir)/.test(key)) return Upload;
    return null;
};

const toUpperLabel = (value = '') => String(value || '').trim().toLocaleUpperCase('es');

const toTitleCaseLabel = (value = '') => {
    const normalized = String(value || '').trim();
    if (!normalized) return normalized;
    return normalized
        .toLocaleLowerCase('es')
        .split(' ')
        .map((word) => {
            if (!word) return word;
            return word.charAt(0).toLocaleUpperCase('es') + word.slice(1);
        })
        .join(' ');
};

const FILTER_OPERATORS = {
    text: [
        { value: 'contains', label: 'Contiene' },
        { value: 'equals', label: 'Igual a' },
        { value: 'starts_with', label: 'Empieza con' },
        { value: 'ends_with', label: 'Termina con' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No vacío' }
    ],
    option: [
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Distinto de' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No vacío' }
    ],
    number: [
        { value: 'equals', label: '=' },
        { value: 'gt', label: '>' },
        { value: 'gte', label: '>=' },
        { value: 'lt', label: '<' },
        { value: 'lte', label: '<=' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No vacío' }
    ],
    date: [
        { value: 'on', label: 'En fecha' },
        { value: 'before', label: 'Antes de' },
        { value: 'after', label: 'Después de' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No vacío' }
    ]
};

const SaasViewHeader = ({
    title = '',
    count = null,
    searchValue = '',
    onSearchChange = null,
    searchPlaceholder = 'Buscar...',
    searchDisabled = false,
    actions = [],
    filters = null,
    sortConfig = null,
    onSortChange = null,
    actionsExtra = null,
    extra = null
}) => {
    const safeActions = useMemo(() => normalizeActions(actions), [actions]);
    const [compactActions, setCompactActions] = useState(false);
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const filtersRef = useRef(null);
    const sortRef = useRef(null);
    const filterColumns = useMemo(
        () => (Array.isArray(filters?.columns) ? filters.columns.filter((column) => column && column.key) : []),
        [filters]
    );
    const selectedFilterColumn = useMemo(() => {
        const selectedKey = String(filters?.value?.columnKey || '').trim();
        if (!selectedKey) return null;
        return filterColumns.find((column) => String(column?.key || '').trim() === selectedKey) || null;
    }, [filterColumns, filters]);
    const selectedFilterType = String(selectedFilterColumn?.type || 'text').trim().toLowerCase();
    const hasFilterOptions = Array.isArray(selectedFilterColumn?.options) && selectedFilterColumn.options.length > 0;
    const operatorOptions = useMemo(() => {
        if (Array.isArray(filters?.operators) && filters.operators.length > 0) return filters.operators;
        if (hasFilterOptions) return FILTER_OPERATORS.option;
        if (selectedFilterType === 'number') return FILTER_OPERATORS.number;
        if (selectedFilterType === 'date') return FILTER_OPERATORS.date;
        return FILTER_OPERATORS.text;
    }, [filters, hasFilterOptions, selectedFilterType]);
    const showFilterValue = !['is_empty', 'not_empty'].includes(String(filters?.value?.operator || '').trim());
    const sortColumns = useMemo(
        () => (Array.isArray(sortConfig?.columns) ? sortConfig.columns.filter((column) => column && column.key) : []),
        [sortConfig]
    );
    const inlineActions = useMemo(
        () => (compactActions ? safeActions.slice(0, 2) : safeActions),
        [compactActions, safeActions]
    );
    const overflowActions = useMemo(
        () => (compactActions ? safeActions.slice(2) : []),
        [compactActions, safeActions]
    );

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const mediaQuery = window.matchMedia('(max-width: 1440px)');
        const sync = () => setCompactActions(mediaQuery.matches);
        sync();
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', sync);
            return () => mediaQuery.removeEventListener('change', sync);
        }
        mediaQuery.addListener(sync);
        return () => mediaQuery.removeListener(sync);
    }, []);

    useEffect(() => {
        if (!compactActions) setOverflowOpen(false);
    }, [compactActions]);

    useEffect(() => {
        const handlePointerDown = (event) => {
            const target = event.target;
            if (filtersRef.current && !filtersRef.current.contains(target)) setFiltersOpen(false);
            if (sortRef.current && !sortRef.current.contains(target)) setSortOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, []);

    const hasActiveFilter = Boolean(
        String(filters?.value?.columnKey || '').trim()
        || String(filters?.value?.operator || 'contains').trim() !== 'contains'
        || String(filters?.value?.value || '').trim()
    );
    const hasActiveSort = Boolean(String(sortConfig?.columnKey || '').trim());

    return (
        <div className="saas-view-header saas-view-header__sticky">
            <div className="saas-view-header__top">
                <div className="saas-view-header__title-group">
                    <h3>{toUpperLabel(title || 'Vista')}</h3>
                    {count !== null && count !== undefined ? <small>{`${Number(count || 0).toLocaleString('es-PE')} registros`}</small> : null}
                </div>
                <div className="saas-view-header__actions">
                    {inlineActions.map((action, index) => {
                        const ActionIcon = resolveHeaderActionIcon(action);
                        return (
                            <button
                                key={String(action.key || action.label || index)}
                                type="button"
                                className={`saas-header-btn saas-header-btn--${resolveHeaderActionVariant(action)} saas-view-header__action-btn`}
                                onClick={typeof action.onClick === 'function' ? action.onClick : undefined}
                                disabled={Boolean(action.disabled)}
                                title={action.label || 'Acción'}
                            >
                                {ActionIcon ? <ActionIcon size={15} strokeWidth={2} /> : null}
                                <span className="saas-btn-text">{action.label || 'Acción'}</span>
                            </button>
                        );
                    })}
                    {actionsExtra}
                    {compactActions && overflowActions.length > 0 ? (
                        <div className="saas-header-actions-overflow">
                            <button
                                type="button"
                                className="saas-header-btn saas-header-btn--secondary"
                                onClick={() => setOverflowOpen((prev) => !prev)}
                                aria-expanded={overflowOpen}
                                title="Más acciones"
                            >
                                <MoreHorizontal size={16} strokeWidth={2} />
                            </button>
                            {overflowOpen ? (
                                <div className="saas-header-actions-overflow__menu">
                                    {overflowActions.map((action, index) => {
                                        const ActionIcon = resolveHeaderActionIcon(action);
                                        return (
                                            <button
                                                key={`overflow_${String(action.key || action.label || index)}`}
                                                type="button"
                                                className={`saas-header-btn saas-header-btn--${resolveHeaderActionVariant(action)}`}
                                                onClick={() => {
                                                    setOverflowOpen(false);
                                                    action?.onClick?.();
                                                }}
                                                disabled={Boolean(action.disabled)}
                                            >
                                                {ActionIcon ? <ActionIcon size={15} strokeWidth={2} /> : null}
                                                <span className="saas-btn-text">{action.label || 'Acción'}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="saas-view-header__controls">
                <div className="saas-view-header__control-bar">
                    <div className="saas-view-header__search">
                        <Search size={15} strokeWidth={2} className="saas-view-header__search-icon" />
                        <input
                            value={searchValue}
                            onChange={(event) => {
                                if (typeof onSearchChange === 'function') {
                                    onSearchChange(event.target.value);
                                }
                            }}
                            placeholder={searchPlaceholder}
                            disabled={searchDisabled}
                        />
                    </div>

                    {filters ? (
                        <div className="saas-view-header__dropdown" ref={filtersRef}>
                            <button
                                type="button"
                                className={`saas-header-btn ${hasActiveFilter ? 'saas-header-btn--primary' : 'saas-header-btn--secondary'}`}
                                onClick={() => {
                                    setFiltersOpen((prev) => !prev);
                                    setSortOpen(false);
                                }}
                                title="Filtros"
                            >
                                <Filter size={15} strokeWidth={2} />
                                <span className="saas-btn-text">Filtros</span>
                            </button>
                            {filtersOpen ? (
                                <div className="saas-view-header__dropdown-menu saas-view-header__dropdown-menu--filters">
                                    <select
                                        value={String(filters?.value?.columnKey || '')}
                                        onChange={(event) => filters?.onChange?.({ ...filters.value, columnKey: event.target.value })}
                                    >
                                        <option value="">Filtrar por...</option>
                                        {filterColumns.map((column) => (
                                            <option key={column.key} value={column.key}>{toTitleCaseLabel(column.label || column.key)}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={String(filters?.value?.operator || 'contains')}
                                        onChange={(event) => filters?.onChange?.({ ...filters.value, operator: event.target.value })}
                                    >
                                        {operatorOptions.map((operator) => (
                                            <option key={operator.value} value={operator.value}>{operator.label || operator.value}</option>
                                        ))}
                                    </select>

                                    {showFilterValue ? (
                                        hasFilterOptions ? (
                                            <select
                                                value={String(filters?.value?.value || '')}
                                                onChange={(event) => filters?.onChange?.({ ...filters.value, value: event.target.value })}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {selectedFilterColumn.options.map((optionItem, optionIndex) => {
                                                    const optionValue = String(optionItem?.value ?? optionItem?.id ?? optionItem ?? '').trim();
                                                    const optionLabelSource = String((optionItem?.label ?? optionValue) || `Opción ${optionIndex + 1}`).trim();
                                                    const optionLabel = toTitleCaseLabel(optionLabelSource.replace(/[_-]+/g, ' '));
                                                    return (
                                                        <option key={`${selectedFilterColumn.key}-${optionValue}-${optionIndex}`} value={optionValue}>
                                                            {optionLabel}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        ) : (
                                            <input
                                                type={selectedFilterType === 'number' ? 'number' : (selectedFilterType === 'date' ? 'date' : 'text')}
                                                value={String(filters?.value?.value || '')}
                                                onChange={(event) => filters?.onChange?.({ ...filters.value, value: event.target.value })}
                                                placeholder="Valor de filtro"
                                            />
                                        )
                                    ) : (
                                        <div className="saas-view-header__filter-placeholder">Sin valor</div>
                                    )}

                                    <div className="saas-view-header__dropdown-actions">
                                        <button
                                            type="button"
                                            className="saas-header-btn saas-header-btn--primary"
                                            onClick={() => setFiltersOpen(false)}
                                        >
                                            <Check size={15} strokeWidth={2} />
                                            <span className="saas-btn-text">Aplicar</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="saas-header-btn saas-header-btn--secondary"
                                            onClick={() => {
                                                filters?.onClear?.();
                                                setFiltersOpen(false);
                                            }}
                                        >
                                            <Trash2 size={15} strokeWidth={2} />
                                            <span className="saas-btn-text">Limpiar</span>
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {sortConfig ? (
                        <div className="saas-view-header__dropdown" ref={sortRef}>
                            <button
                                type="button"
                                className={`saas-header-btn ${hasActiveSort ? 'saas-header-btn--primary' : 'saas-header-btn--secondary'}`}
                                onClick={() => {
                                    setSortOpen((prev) => !prev);
                                    setFiltersOpen(false);
                                }}
                                title="Ordenar"
                            >
                                <ArrowUpDown size={15} strokeWidth={2} />
                                <span className="saas-btn-text">Ordenar</span>
                            </button>
                            {sortOpen ? (
                                <div className="saas-view-header__dropdown-menu saas-view-header__dropdown-menu--sort">
                                    <select
                                        value={String(sortConfig?.columnKey || '')}
                                        onChange={(event) => {
                                            if (typeof onSortChange === 'function') {
                                                onSortChange({
                                                    columnKey: event.target.value,
                                                    direction: String(sortConfig?.direction || 'asc')
                                                });
                                            }
                                        }}
                                    >
                                        <option value="">Ordenar por...</option>
                                        {sortColumns.map((column) => (
                                            <option key={column.key} value={column.key}>{column.label || column.key}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="saas-header-btn saas-header-btn--secondary"
                                        onClick={() => {
                                            if (typeof onSortChange === 'function') {
                                                onSortChange({
                                                    columnKey: String(sortConfig?.columnKey || ''),
                                                    direction: String(sortConfig?.direction || 'asc') === 'asc' ? 'desc' : 'asc'
                                                });
                                            }
                                        }}
                                        disabled={!String(sortConfig?.columnKey || '').trim()}
                                    >
                                        {String(sortConfig?.direction || 'asc') === 'asc'
                                            ? <ChevronUp size={15} strokeWidth={2} />
                                            : <ChevronDown size={15} strokeWidth={2} />}
                                        <span className="saas-btn-text">
                                            {String(sortConfig?.direction || 'asc') === 'asc' ? 'Asc' : 'Desc'}
                                        </span>
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {filters ? (
                        <button
                            type="button"
                            className="saas-header-btn saas-header-btn--secondary saas-view-header__clear-btn"
                            onClick={() => filters?.onClear?.()}
                            title="Limpiar filtros"
                        >
                            <Trash2 size={15} strokeWidth={2} />
                        </button>
                    ) : null}
                </div>
            </div>
            {extra ? <div className="saas-view-header__extra">{extra}</div> : null}
        </div>
    );
};

export default React.memo(SaasViewHeader);
