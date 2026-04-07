import React, { useMemo } from 'react';

const DEFAULT_OPERATORS = [
    { value: 'contains', label: 'Contiene' },
    { value: 'equals', label: 'Igual a' },
    { value: 'starts_with', label: 'Empieza con' },
    { value: 'ends_with', label: 'Termina con' },
    { value: 'is_empty', label: 'Vacio' },
    { value: 'not_empty', label: 'No vacio' }
];

const normalizeActions = (actions = []) => (
    Array.isArray(actions)
        ? actions.filter((action) => action && typeof action === 'object')
        : []
);

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
    onSortChange = null
}) => {
    const safeActions = useMemo(() => normalizeActions(actions), [actions]);
    const filterColumns = useMemo(
        () => (Array.isArray(filters?.columns) ? filters.columns.filter((column) => column && column.key) : []),
        [filters]
    );
    const operatorOptions = useMemo(
        () => (Array.isArray(filters?.operators) && filters.operators.length > 0 ? filters.operators : DEFAULT_OPERATORS),
        [filters]
    );
    const showFilterValue = !['is_empty', 'not_empty'].includes(String(filters?.value?.operator || '').trim());
    const sortColumns = useMemo(
        () => (Array.isArray(sortConfig?.columns) ? sortConfig.columns.filter((column) => column && column.key) : []),
        [sortConfig]
    );

    return (
        <div className="saas-view-header saas-view-header__sticky">
            <div className="saas-view-header__top">
                <div className="saas-view-header__title-group">
                    <h3>{title || 'Vista'}</h3>
                    {count !== null && count !== undefined ? <small>{Number(count) || 0} registros</small> : null}
                </div>
                <div className="saas-view-header__actions">
                    {safeActions.map((action, index) => (
                        <button
                            key={String(action.key || action.label || index)}
                            type="button"
                            className={`saas-view-header__action-btn ${action.variant ? `is-${action.variant}` : ''}`}
                            onClick={typeof action.onClick === 'function' ? action.onClick : undefined}
                            disabled={Boolean(action.disabled)}
                        >
                            {action.label || 'Accion'}
                        </button>
                    ))}
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
                                <option key={column.key} value={column.key}>{column.label || column.key}</option>
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
                            <input
                                value={String(filters?.value?.value || '')}
                                onChange={(event) => filters?.onChange?.({ ...filters.value, value: event.target.value })}
                                placeholder="Valor filtro"
                            />
                        ) : (
                            <div className="saas-view-header__filter-placeholder">Sin valor</div>
                        )}

                        <button type="button" onClick={filters?.onClear}>Limpiar</button>
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
        </div>
    );
};

export default React.memo(SaasViewHeader);
