import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Check, Columns3, Download, Edit2, Filter, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { buildSortState, clearSortState, createEmptySortItem, normalizeSortState } from './sortUtils';

let filterItemSequence = 0;
const FILTER_OPERATORS = {
  text: [{ value: 'contains', label: 'Contiene' }, { value: 'equals', label: 'Igual a' }, { value: 'not_equals', label: 'Distinto de' }, { value: 'starts_with', label: 'Empieza con' }, { value: 'ends_with', label: 'Termina con' }, { value: 'is_empty', label: 'Vacio' }, { value: 'not_empty', label: 'No vacio' }],
  option: [{ value: 'equals', label: 'Igual a' }, { value: 'not_equals', label: 'Distinto de' }, { value: 'is_empty', label: 'Vacio' }, { value: 'not_empty', label: 'No vacio' }],
  number: [{ value: 'equals', label: '=' }, { value: 'gt', label: '>' }, { value: 'gte', label: '>=' }, { value: 'lt', label: '<' }, { value: 'lte', label: '<=' }, { value: 'is_empty', label: 'Vacio' }, { value: 'not_empty', label: 'No vacio' }],
  date: [{ value: 'on', label: 'En fecha' }, { value: 'before', label: 'Antes de' }, { value: 'after', label: 'Despues de' }, { value: 'is_empty', label: 'Vacio' }, { value: 'not_empty', label: 'No vacio' }]
};

const normalizeActions = (actions = []) => Array.isArray(actions) ? actions.filter((action) => action && typeof action === 'object') : [];
const createEmptyFilterItem = () => ({ id: `filter_${++filterItemSequence}`, columnKey: '', operator: 'contains', value: '' });
const normalizeFilterItem = (item = {}) => ({ id: String(item?.id || createEmptyFilterItem().id), columnKey: String(item?.columnKey || '').trim(), operator: String(item?.operator || 'contains').trim().toLowerCase() || 'contains', value: item?.value ?? '' });
const normalizeFilterItems = (items = null) => Array.isArray(items) ? (items.length > 0 ? items.map(normalizeFilterItem) : [createEmptyFilterItem()]) : (items && typeof items === 'object' ? [normalizeFilterItem(items)] : [createEmptyFilterItem()]);
const isFilterItemActive = (item = {}) => {
  const columnKey = String(item?.columnKey || '').trim();
  const operator = String(item?.operator || 'contains').trim().toLowerCase();
  if (!columnKey) return false;
  if (operator === 'is_empty' || operator === 'not_empty') return true;
  return Boolean(String(item?.value ?? '').trim());
};
const toUpperLabel = (value = '') => String(value || '').trim().toLocaleUpperCase('es');
const toTitleCaseLabel = (value = '') => String(value || '').trim().toLocaleLowerCase('es').split(' ').map((word) => (word ? word.charAt(0).toLocaleUpperCase('es') + word.slice(1) : word)).join(' ');
const resolveHeaderActionVariant = (action = {}) => {
  const explicitVariant = String(action?.variant || '').trim().toLowerCase();
  const key = String(action?.iconKey || action?.key || action?.label || '').trim().toLowerCase();
  if (explicitVariant) return explicitVariant;
  if (/(cerrar|close|delete|eliminar|danger|remove|descartar|desactivar|logout)/.test(key)) return 'danger';
  if (/(create|new|nuevo|nueva|save|guardar|add|agregar|import|select|seleccionar|next|siguiente|sync|sincronizar|edit|editar)/.test(key)) return 'primary';
  return 'secondary';
};
const resolveHeaderActionLabel = (action = {}) => {
  const rawLabel = String(action?.label || 'Accion').trim();
  const normalizedKey = String(action?.key || action?.iconKey || rawLabel).trim().toLowerCase();
  if (/^(add|agregar|nuevo|nueva|new|create|crear)$/.test(rawLabel.toLowerCase()) || /(create|new|add)/.test(normalizedKey)) {
    return 'Nuevo';
  }
  return rawLabel;
};
const resolveHeaderActionIcon = (action = {}) => {
  const key = String(action?.iconKey || action?.key || action?.label || '').trim().toLowerCase();
  if (/(refresh|reload|recargar|actualizar)/.test(key)) return RefreshCw;
  if (/(new|nuevo|nueva|add|agregar|create)/.test(key)) return Plus;
  if (/(column|columna)/.test(key)) return Columns3;
  if (/(filter|filtro)/.test(key)) return Filter;
  if (/(sort|ordenar)/.test(key)) return ArrowUpDown;
  if (/(clear|limpiar|trash)/.test(key)) return Trash2;
  if (/(close|cerrar|cancel|cancelar|descartar)/.test(key)) return X;
  if (/(edit|editar)/.test(key)) return Edit2;
  if (/(save|guardar|confirm)/.test(key)) return Check;
  if (/(export|descargar)/.test(key)) return Download;
  if (/(import|subir)/.test(key)) return Upload;
  return null;
};
const resolveFilterColumnType = (column = null) => {
  const rawType = String(column?.type || '').trim().toLowerCase();
  if (rawType === 'select') return 'option';
  if (Array.isArray(column?.options) && column.options.length > 0) return 'option';
  if (rawType === 'number' || rawType === 'date') return rawType;
  return 'text';
};
const operatorNeedsValue = (operator = '') => {
  const cleanOperator = String(operator || '').trim().toLowerCase();
  return cleanOperator !== 'is_empty' && cleanOperator !== 'not_empty';
};

export default function SaasViewHeader({
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
  hideSortControl = false,
  actionsExtra = null,
  extra = null
}) {
  const safeActions = useMemo(() => normalizeActions(actions), [actions]);
  const [compactActions, setCompactActions] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filtersRef = useRef(null);
  const sortRef = useRef(null);
  const filterColumns = useMemo(() => (Array.isArray(filters?.columns) ? filters.columns.filter((column) => column && column.key) : []), [filters]);
  const sortColumns = useMemo(() => (Array.isArray(sortConfig?.columns) ? sortConfig.columns.filter((column) => column && column.key) : []), [sortConfig]);
  const normalizedSort = useMemo(() => normalizeSortState(sortConfig), [sortConfig]);
  const normalizedSortItems = normalizedSort.items;
  const activeSortItems = normalizedSort.activeItems;
  const supportsMultiFilters = Boolean(Array.isArray(filters?.items) || typeof filters?.onItemsChange === 'function');
  const normalizedFilterItems = useMemo(() => normalizeFilterItems(supportsMultiFilters ? filters?.items : filters?.value), [filters, supportsMultiFilters]);
  const activeFilterItems = useMemo(() => normalizedFilterItems.filter(isFilterItemActive), [normalizedFilterItems]);
  const inlineActions = useMemo(() => (compactActions ? safeActions.slice(0, 2) : safeActions), [compactActions, safeActions]);
  const overflowActions = useMemo(() => (compactActions ? safeActions.slice(2) : []), [compactActions, safeActions]);
  const hasActionControls = inlineActions.length > 0 || Boolean(actionsExtra) || (compactActions && overflowActions.length > 0);

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

  useEffect(() => { if (!compactActions) setOverflowOpen(false); }, [compactActions]);
  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (filtersRef.current && !filtersRef.current.contains(target)) setFiltersOpen(false);
      if (sortRef.current && !sortRef.current.contains(target)) setSortOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const commitFilterItems = useCallback((nextItems) => {
    const normalizedItems = normalizeFilterItems(nextItems);
    if (supportsMultiFilters) {
      filters?.onItemsChange?.(normalizedItems);
      return;
    }
    filters?.onChange?.(normalizedItems[0] || createEmptyFilterItem());
  }, [filters, supportsMultiFilters]);

  const commitSortItems = useCallback((nextItems) => {
    if (typeof onSortChange !== 'function') return;
    onSortChange(buildSortState(Array.isArray(nextItems) && nextItems.length > 0 ? nextItems : [createEmptySortItem()]));
  }, [onSortChange]);

  const clearFiltersOnly = useCallback(() => {
    if (typeof filters?.onClear === 'function') {
      filters.onClear();
      return;
    }
    commitFilterItems([createEmptyFilterItem()]);
  }, [commitFilterItems, filters]);

  const clearSortOnly = useCallback(() => {
    if (typeof onSortChange !== 'function') return;
    onSortChange(clearSortState());
  }, [onSortChange]);

  const updateFilterItem = useCallback((index, patch = {}) => {
    const nextItems = normalizedFilterItems.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const nextColumnKey = Object.prototype.hasOwnProperty.call(patch, 'columnKey') ? String(patch?.columnKey || '').trim() : item.columnKey;
      const selectedColumn = filterColumns.find((column) => String(column?.key || '').trim() === nextColumnKey) || null;
      const columnType = resolveFilterColumnType(selectedColumn);
      const defaultOperator = FILTER_OPERATORS[columnType]?.[0]?.value || 'contains';
      const nextItem = { ...item, ...patch, columnKey: nextColumnKey };
      if (Object.prototype.hasOwnProperty.call(patch, 'columnKey')) {
        nextItem.operator = defaultOperator;
        nextItem.value = '';
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'operator') && !operatorNeedsValue(patch.operator)) nextItem.value = '';
      return normalizeFilterItem(nextItem);
    });
    commitFilterItems(nextItems);
  }, [commitFilterItems, filterColumns, normalizedFilterItems]);

  const updateSortItem = useCallback((index, patch = {}) => {
    const nextItems = normalizedSortItems.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return {
        ...item,
        ...patch,
        columnKey: Object.prototype.hasOwnProperty.call(patch, 'columnKey') ? String(patch?.columnKey || '').trim() : item.columnKey,
        direction: Object.prototype.hasOwnProperty.call(patch, 'direction') ? String(patch?.direction || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc' : item.direction
      };
    });
    commitSortItems(nextItems);
  }, [commitSortItems, normalizedSortItems]);

  const addFilterItem = useCallback(() => commitFilterItems([...normalizedFilterItems, createEmptyFilterItem()]), [commitFilterItems, normalizedFilterItems]);
  const addSortItem = useCallback(() => commitSortItems([...normalizedSortItems, createEmptySortItem()]), [commitSortItems, normalizedSortItems]);

  const removeFilterItem = useCallback((itemId = '') => {
    const nextItems = normalizedFilterItems.filter((item) => String(item?.id || '') !== String(itemId || ''));
    commitFilterItems(nextItems.length > 0 ? nextItems : [createEmptyFilterItem()]);
  }, [commitFilterItems, normalizedFilterItems]);

  const removeSortItem = useCallback((itemId = '') => {
    const nextItems = normalizedSortItems.filter((item) => String(item?.id || '') !== String(itemId || ''));
    commitSortItems(nextItems.length > 0 ? nextItems : [createEmptySortItem()]);
  }, [commitSortItems, normalizedSortItems]);

  const hasActiveSort = activeSortItems.length > 0;

  return (
    <div className="saas-view-header saas-view-header__sticky">
      <div className="saas-view-header__top">
        <div className="saas-view-header__title-group">
          <h3>{toUpperLabel(title || 'Vista')}</h3>
          {count !== null && count !== undefined ? <small>{`${Number(count || 0).toLocaleString('es-PE')} registros`}</small> : null}
        </div>
        {hasActionControls ? (
          <div className="saas-view-header__actions">
            {inlineActions.map((action, index) => {
              const ActionIcon = resolveHeaderActionIcon(action);
              const actionLabel = resolveHeaderActionLabel(action);
              return (
                <button key={String(action.key || action.label || index)} type="button" className={`saas-btn saas-header-btn saas-header-btn--${resolveHeaderActionVariant(action)} saas-view-header__action-btn`} onClick={typeof action.onClick === 'function' ? action.onClick : undefined} disabled={Boolean(action.disabled)} title={actionLabel}>
                  {ActionIcon ? <ActionIcon size={15} strokeWidth={2} /> : null}
                  <span className="saas-btn-text">{actionLabel}</span>
                </button>
              );
            })}
            {actionsExtra}
            {compactActions && overflowActions.length > 0 ? (
              <div className="saas-header-actions-overflow">
                <button type="button" className="saas-btn saas-header-btn saas-header-btn--secondary" onClick={() => setOverflowOpen((prev) => !prev)} aria-expanded={overflowOpen} title="Mas acciones">
                  <MoreHorizontal size={16} strokeWidth={2} />
                </button>
                {overflowOpen ? (
                  <div className="saas-header-actions-overflow__menu">
                    {overflowActions.map((action, index) => {
                      const ActionIcon = resolveHeaderActionIcon(action);
                      const actionLabel = resolveHeaderActionLabel(action);
                      return (
                        <button key={`overflow_${String(action.key || action.label || index)}`} type="button" className={`saas-btn saas-header-btn saas-header-btn--${resolveHeaderActionVariant(action)}`} onClick={() => { setOverflowOpen(false); action?.onClick?.(); }} disabled={Boolean(action.disabled)}>
                          {ActionIcon ? <ActionIcon size={15} strokeWidth={2} /> : null}
                          <span className="saas-btn-text">{actionLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        </div>

      <div className="saas-view-header__controls">
        <div className="saas-view-header__control-bar">
          <div className="saas-view-header__search">
            <Search size={15} strokeWidth={2} className="saas-view-header__search-icon" />
            <input value={searchValue} onChange={(event) => typeof onSearchChange === 'function' && onSearchChange(event.target.value)} placeholder={searchPlaceholder} disabled={searchDisabled} />
          </div>

          {filterColumns.length > 0 ? (
            <div ref={filtersRef} className="saas-view-header__dropdown saas-view-header__filters">
              <button type="button" className={`saas-btn saas-header-btn ${activeFilterItems.length > 0 ? 'saas-header-btn--primary' : 'saas-header-btn--secondary'}`} onClick={() => { setFiltersOpen((prev) => !prev); setSortOpen(false); }} aria-expanded={filtersOpen}>
                <Filter size={15} strokeWidth={2} />
                <span className="saas-btn-text">Filtros</span>
                {activeFilterItems.length > 0 ? <span className="saas-view-header__filter-count">{activeFilterItems.length}</span> : null}
              </button>
              {filtersOpen ? (
                <div className="saas-view-header__dropdown-menu saas-view-header__dropdown-menu--filters">
                  <div className="saas-view-header__dropdown-menu-body saas-view-header__dropdown-menu-body--filters">
                    {normalizedFilterItems.map((item, index) => {
                      const selectedColumn = filterColumns.find((column) => String(column?.key || '') === String(item?.columnKey || '')) || null;
                      const columnType = resolveFilterColumnType(selectedColumn);
                      const operatorOptions = FILTER_OPERATORS[columnType] || FILTER_OPERATORS.text;
                      const needsValue = operatorNeedsValue(item?.operator);
                      const optionList = Array.isArray(selectedColumn?.options) ? selectedColumn.options : [];
                      return (
                        <div key={item.id} className="saas-view-header__filter-row">
                          <select value={item.columnKey} onChange={(event) => updateFilterItem(index, { columnKey: event.target.value })}>
                            <option value="">Selecciona columna</option>
                            {filterColumns.map((column) => <option key={column.key} value={column.key}>{toTitleCaseLabel(column.label || column.key)}</option>)}
                          </select>
                          <select value={item.operator} onChange={(event) => updateFilterItem(index, { operator: event.target.value })} disabled={!item.columnKey}>
                            {operatorOptions.map((option) => <option key={`${item.id}_${option.value}`} value={option.value}>{option.label}</option>)}
                          </select>
                          {needsValue ? (
                            optionList.length > 0 ? (
                              <select value={String(item.value ?? '')} onChange={(event) => updateFilterItem(index, { value: event.target.value })} disabled={!item.columnKey}>
                                <option value="">Selecciona valor</option>
                                {optionList.map((option, optionIndex) => <option key={`${item.id}_opt_${String(option?.value || optionIndex)}`} value={String(option?.value ?? '')}>{String(option?.label ?? option?.value ?? '')}</option>)}
                              </select>
                            ) : (
                              <input value={String(item.value ?? '')} onChange={(event) => updateFilterItem(index, { value: event.target.value })} placeholder="Valor" disabled={!item.columnKey} />
                            )
                          ) : <div className="saas-view-header__filter-placeholder">Sin valor</div>}
                          {(supportsMultiFilters || normalizedFilterItems.length > 1) ? (
                            <button type="button" className="saas-btn saas-btn--secondary saas-btn--sm" onClick={() => removeFilterItem(item.id)} title="Quitar filtro">
                              <X size={14} strokeWidth={2} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="saas-view-header__dropdown-actions">
                    <button type="button" className="saas-btn saas-btn--secondary saas-btn--sm" onClick={addFilterItem}>
                      <Plus size={14} strokeWidth={2} />
                      <span className="saas-btn-text">Agregar filtro</span>
                    </button>
                    <button type="button" className="saas-btn saas-btn--secondary saas-btn--sm" onClick={clearFiltersOnly}>
                      <Trash2 size={14} strokeWidth={2} />
                      <span className="saas-btn-text">Limpiar</span>
                    </button>
                    <button type="button" className="saas-btn saas-btn--primary saas-btn--sm" onClick={() => setFiltersOpen(false)}>
                      <Check size={14} strokeWidth={2} />
                      <span className="saas-btn-text">Aplicar</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {sortColumns.length > 0 && !hideSortControl ? (
            <div ref={sortRef} className="saas-view-header__dropdown saas-view-header__sort">
              <button type="button" className={`saas-btn saas-header-btn ${hasActiveSort ? 'saas-header-btn--primary' : 'saas-header-btn--secondary'}`} onClick={() => { setSortOpen((prev) => !prev); setFiltersOpen(false); }} aria-expanded={sortOpen}>
                <ArrowUpDown size={15} strokeWidth={2} />
                <span className="saas-btn-text">Ordenar</span>
                {activeSortItems.length > 0 ? <span className="saas-view-header__filter-count">{activeSortItems.length}</span> : null}
              </button>
              {sortOpen ? (
                <div className="saas-view-header__dropdown-menu saas-view-header__dropdown-menu--sort">
                  <div className="saas-view-header__dropdown-menu-body saas-view-header__dropdown-menu-body--sort">
                    {normalizedSortItems.map((item, index) => (
                      <div key={item.id} className="saas-view-header__filter-row saas-view-header__sort-row">
                        <div className="saas-view-header__sort-priority-label">P{index + 1}</div>
                        <select value={String(item.columnKey || '')} onChange={(event) => updateSortItem(index, { columnKey: event.target.value })}>
                          <option value="">Selecciona columna</option>
                          {sortColumns.map((column) => <option key={`${item.id}_${column.key}`} value={column.key}>{toTitleCaseLabel(column.label || column.key)}</option>)}
                        </select>
                        <select value={String(item.direction || 'asc')} onChange={(event) => updateSortItem(index, { direction: event.target.value })} disabled={!item.columnKey}>
                          <option value="asc">Ascendente</option>
                          <option value="desc">Descendente</option>
                        </select>
                        {(normalizedSortItems.length > 1 || item.columnKey) ? (
                          <button type="button" className="saas-btn saas-btn--secondary saas-btn--sm" onClick={() => removeSortItem(item.id)} title="Quitar prioridad">
                            <X size={14} strokeWidth={2} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="saas-view-header__dropdown-actions">
                    <button type="button" className="saas-btn saas-btn--secondary saas-btn--sm" onClick={addSortItem}>
                      <Plus size={14} strokeWidth={2} />
                      <span className="saas-btn-text">Agregar prioridad</span>
                    </button>
                    <button type="button" className="saas-btn saas-btn--secondary saas-btn--sm" onClick={clearSortOnly}>
                      <Trash2 size={14} strokeWidth={2} />
                      <span className="saas-btn-text">Limpiar</span>
                    </button>
                    <button type="button" className="saas-btn saas-btn--primary saas-btn--sm" onClick={() => setSortOpen(false)}>
                      <Check size={14} strokeWidth={2} />
                      <span className="saas-btn-text">Aplicar</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {extra ? (
        <div className="saas-view-header__extra">
          {extra}
        </div>
      ) : null}
    </div>
  );
}
