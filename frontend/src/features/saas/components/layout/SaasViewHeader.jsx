import React, { useMemo } from 'react';

const DEFAULT_OPERATORS = [
    { value: 'contains', label: 'Contiene' },
    { value: 'equals', label: 'Igual a' },
    { value: 'starts_with', label: 'Empieza con' },
    { value: 'ends_with', label: 'Termina con' },
    { value: 'is_empty', label: 'Vacío' },
    { value: 'not_empty', label: 'No vacío' }
];

const OPERATORS_BY_TYPE = {
    text: [
        { value: 'contains', label: 'Contiene' },
        { value: 'equals', label: 'Igual a' },
        { value: 'starts_with', label: 'Empieza con' },
        { value: 'ends_with', label: 'Termina con' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No vacío' }
    ],
    option: [
        { value: 'equals', label: 'IGUAL A' },
        { value: 'not_equals', label: 'DISTINTO DE' },
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
        { value: 'after', label: 'DESPUÉS DE' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No vacío' }
    ]
};

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
        { value: 'equals', label: 'Igual A' },
        { value: 'starts_with', label: 'Empieza Con' },
        { value: 'ends_with', label: 'Termina Con' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No Vacío' }
    ],
    option: [
        { value: 'equals', label: 'Igual A' },
        { value: 'not_equals', label: 'Distinto De' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No Vacío' }
    ],
    number: [
        { value: 'equals', label: '=' },
        { value: 'gt', label: '>' },
        { value: 'gte', label: '>=' },
        { value: 'lt', label: '<' },
        { value: 'lte', label: '<=' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No Vacío' }
    ],
    date: [
        { value: 'on', label: 'En Fecha' },
        { value: 'before', label: 'Antes De' },
        { value: 'after', label: 'Después De' },
        { value: 'is_empty', label: 'Vacío' },
        { value: 'not_empty', label: 'No Vacío' }
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

    return (
        <div className="saas-view-header saas-view-header__sticky">
            <div className="saas-view-header__top">
                <div className="saas-view-header__title-group">
                    <h3>{toUpperLabel(title || 'Vista')}</h3>
                    {count !== null && count !== undefined ? <small>{`${Number(count || 0).toLocaleString('es-PE')} registros`}</small> : null}
                </div>
                <div className="saas-view-header__actions">
                    {safeActions.map((action, index) => (
                        <button
                            key={String(action.key || action.label || index)}
                            type="button"
                            className={`saas-header-btn saas-header-btn--${resolveHeaderActionVariant(action)} saas-view-header__action-btn`}
                            onClick={typeof action.onClick === 'function' ? action.onClick : undefined}
                            disabled={Boolean(action.disabled)}
                        >
                            {action.label || 'Acción'}
                        </button>
                    ))}
                    {actionsExtra}
                </div>
            </div>

            <div className="saas-view-header__controls">
                <div className="saas-view-header__search">
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
                    <div className="saas-view-header__filters">
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
                                        const optionLabelSource = String((optionItem?.label ?? optionValue) || `Opcion ${optionIndex + 1}`).trim();
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
                                    placeholder="valor de filtro"
                                />
                            )
                        ) : (
                            <div className="saas-view-header__filter-placeholder">Sin valor</div>
                        )}

                        <button type="button" className="saas-header-btn saas-header-btn--secondary" onClick={filters?.onClear}>Limpiar</button>
                    </div>
                ) : null}

                {sortConfig ? (
                    <div className="saas-view-header__sort">
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
                            {String(sortConfig?.direction || 'asc') === 'asc' ? 'Asc' : 'Desc'}
                        </button>
                    </div>
                ) : null}
            </div>
            {extra ? <div className="saas-view-header__extra">{extra}</div> : null}
        </div>
    );
};

export default React.memo(SaasViewHeader);
