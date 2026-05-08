let filterItemSequence = 0;

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeOptionList(options = []) {
    if (!Array.isArray(options)) return [];
    return options
        .map((option, index) => {
            if (option && typeof option === 'object') {
                const value = toText(option.value ?? option.id ?? option.label ?? index);
                const label = toText(option.label ?? option.value ?? option.id ?? value);
                return value ? { value, label } : null;
            }
            const text = toText(option);
            return text ? { value: text, label: text } : null;
        })
        .filter(Boolean);
}

function normalizePresetList(presets = []) {
    if (!Array.isArray(presets)) return [];
    return presets
        .map((preset, index) => {
            if (!preset || typeof preset !== 'object') return null;
            const label = toText(preset.label || preset.value || `Preset ${index + 1}`);
            if (!label) return null;
            return {
                ...preset,
                label,
                key: toText(preset.key || preset.value || preset.label || `preset_${index + 1}`)
            };
        })
        .filter(Boolean);
}

export function createEmptyFilterItem() {
    return {
        id: `filter_${++filterItemSequence}`,
        columnKey: '',
        operator: 'contains',
        value: ''
    };
}

export function getFilterDefinitionKey(definition = {}) {
    return toText(definition?.field || definition?.key);
}

function normalizeFilterType(type = '', hasOptions = false) {
    const rawType = toText(type).toLowerCase();
    if (rawType === 'select' || rawType === 'option') return 'multi-select';
    if (rawType === 'date') return 'date-range';
    if (rawType === 'multi-select' || rawType === 'single-select' || rawType === 'date-range' || rawType === 'date-preset') {
        return rawType;
    }
    if (hasOptions) return 'multi-select';
    if (rawType === 'number') return 'number';
    return rawType || 'text';
}

export function normalizeFilterDefinitions(filters = null, columns = []) {
    const explicitFilters = Array.isArray(filters) ? filters.filter((filter) => getFilterDefinitionKey(filter)) : [];
    const explicitByKey = new Map(explicitFilters.map((filter) => [getFilterDefinitionKey(filter), filter]));
    const columnOrder = new Map(
        (Array.isArray(columns) ? columns : [])
            .filter((column) => column && getFilterDefinitionKey(column))
            .map((column, index) => [getFilterDefinitionKey(column), index])
    );
    const inferredFilters = (Array.isArray(columns) ? columns : [])
        .filter((column) => column && getFilterDefinitionKey(column))
        .filter((column) => column.filterable !== false)
        .map((column) => ({
            key: getFilterDefinitionKey(column),
            label: column.menuLabel ?? column.sortLabel ?? column.label ?? getFilterDefinitionKey(column),
            type: column.type,
            options: column.options
        }));
    const combined = [
        ...explicitFilters,
        ...inferredFilters.filter((filter) => !explicitByKey.has(getFilterDefinitionKey(filter)))
    ].sort((left, right) => {
        const leftKey = getFilterDefinitionKey(left);
        const rightKey = getFilterDefinitionKey(right);
        const leftIndex = columnOrder.has(leftKey) ? columnOrder.get(leftKey) : Number.MAX_SAFE_INTEGER;
        const rightIndex = columnOrder.has(rightKey) ? columnOrder.get(rightKey) : Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return explicitFilters.findIndex((filter) => getFilterDefinitionKey(filter) === leftKey)
            - explicitFilters.findIndex((filter) => getFilterDefinitionKey(filter) === rightKey);
    });
    return combined.map((definition) => {
        const key = getFilterDefinitionKey(definition);
        const options = normalizeOptionList(definition?.options);
        const presets = normalizePresetList(definition?.presets);
        return {
            ...definition,
            key,
            field: key,
            label: toText(definition?.label || key),
            type: normalizeFilterType(definition?.type, options.length > 0),
            options,
            presets
        };
    });
}

export function normalizeFilterItem(item = {}) {
    return {
        id: toText(item?.id || createEmptyFilterItem().id),
        columnKey: toText(item?.columnKey || item?.field || item?.key),
        operator: toText(item?.operator || 'contains').toLowerCase() || 'contains',
        value: item?.value ?? ''
    };
}

export function normalizeFilterItems(items = null) {
    if (Array.isArray(items)) {
        return items.length > 0 ? items.map(normalizeFilterItem) : [createEmptyFilterItem()];
    }
    if (items && typeof items === 'object') return [normalizeFilterItem(items)];
    return [createEmptyFilterItem()];
}

function normalizeDateRangeValue(value = null) {
    const from = toText(value?.from);
    const to = toText(value?.to);
    return {
        from,
        to
    };
}

function normalizeMultiSelectValue(value = null) {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => toText(entry)).filter(Boolean);
}

function getPresetByValue(definition = {}, value = null) {
    const presets = Array.isArray(definition?.presets) ? definition.presets : [];
    if (!value) return null;
    if (typeof value === 'object') {
        const key = toText(value.key || value.value || value.label);
        if (!key) return null;
        return presets.find((preset) => preset.key === key) || null;
    }
    const key = toText(value);
    if (!key) return null;
    return presets.find((preset) => preset.key === key) || null;
}

export function isFilterItemActive(item = {}, definitions = []) {
    const normalized = normalizeFilterItem(item);
    const columnKey = normalized.columnKey;
    if (!columnKey) return false;
    const definition = (Array.isArray(definitions) ? definitions : []).find((entry) => getFilterDefinitionKey(entry) === columnKey) || null;
    const type = normalizeFilterType(definition?.type, Array.isArray(definition?.options) && definition.options.length > 0);
    if (type === 'multi-select') return normalizeMultiSelectValue(normalized.value).length > 0;
    if (type === 'date-range') {
        const value = normalizeDateRangeValue(normalized.value);
        return Boolean(value.from || value.to);
    }
    if (type === 'date-preset') return Boolean(getPresetByValue(definition, normalized.value));
    if (type === 'single-select') return Boolean(toText(normalized.value));
    if (normalized.operator === 'is_empty' || normalized.operator === 'not_empty') return true;
    return Boolean(toText(normalized.value));
}

function parseDate(value = null) {
    const raw = toText(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function parseNumber(value = null) {
    const normalized = String(value ?? '')
        .replace(/,/g, '.')
        .replace(/[^\d.-]/g, '')
        .trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function matchesLegacyFilter(rowValue, definition = {}, item = {}) {
    const operator = toText(item?.operator || 'contains').toLowerCase() || 'contains';
    const expected = toText(item?.value).toLowerCase();
    const type = normalizeFilterType(definition?.type, Array.isArray(definition?.options) && definition.options.length > 0);
    const actualText = toText(rowValue).toLowerCase();
    if (operator === 'is_empty') return !actualText;
    if (operator === 'not_empty') return Boolean(actualText);
    if (!expected) return true;
    if (type === 'number') {
        const left = parseNumber(rowValue);
        const right = parseNumber(expected);
        if (left === null || right === null) return false;
        if (operator === 'gt') return left > right;
        if (operator === 'gte') return left >= right;
        if (operator === 'lt') return left < right;
        if (operator === 'lte') return left <= right;
        return left === right;
    }
    if (type === 'date') {
        const left = parseDate(rowValue);
        const right = parseDate(expected);
        if (!left || !right) return false;
        if (operator === 'before') return left < right;
        if (operator === 'after') return left > right;
        return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
    }
    if (operator === 'equals') return actualText === expected;
    if (operator === 'not_equals') return actualText !== expected;
    if (operator === 'starts_with') return actualText.startsWith(expected);
    if (operator === 'ends_with') return actualText.endsWith(expected);
    return actualText.includes(expected);
}

function matchesSingleSelect(row = {}, definition = {}, value = '') {
    const selected = toText(value);
    if (!selected) return true;
    if (typeof definition?.rangeFilter === 'function') {
        return Boolean(definition.rangeFilter(row, selected));
    }
    const rowValue = toText(row?.[definition.field]);
    return rowValue === selected;
}

function matchesMultiSelect(row = {}, definition = {}, value = null) {
    const selectedValues = normalizeMultiSelectValue(value);
    if (selectedValues.length === 0) return true;
    if (typeof definition?.rangeFilter === 'function') {
        return selectedValues.some((selectedValue) => Boolean(definition.rangeFilter(row, selectedValue)));
    }
    const rowValue = toText(row?.[definition.field]);
    return selectedValues.includes(rowValue);
}

function matchesDateRange(row = {}, definition = {}, value = null) {
    const range = normalizeDateRangeValue(value);
    if (!range.from && !range.to) return true;
    const rowDate = parseDate(row?.[definition.field]);
    if (!rowDate) return !range.from && !range.to;
    if (range.from) {
        const fromDate = parseDate(range.from);
        if (fromDate && rowDate < fromDate) return false;
    }
    if (range.to) {
        const toDate = parseDate(`${range.to}T23:59:59`);
        if (toDate && rowDate > toDate) return false;
    }
    return true;
}

function matchesDatePreset(row = {}, definition = {}, value = null) {
    const preset = getPresetByValue(definition, value);
    if (!preset) return true;
    const rowDate = parseDate(row?.[definition.field]);
    if (!rowDate) return false;
    const diffDays = (Date.now() - rowDate.getTime()) / 86400000;
    if (Number.isFinite(Number(preset.days))) return diffDays <= Number(preset.days);
    if (Number.isFinite(Number(preset.daysMin))) return diffDays > Number(preset.daysMin);
    return true;
}

export function applyEntityFilters(rows = [], filterItems = [], filterDefinitions = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const definitions = normalizeFilterDefinitions(filterDefinitions);
    const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
    const activeItems = normalizeFilterItems(filterItems).filter((item) => isFilterItemActive(item, definitions));
    if (activeItems.length === 0) return safeRows;
    return safeRows.filter((row) => activeItems.every((item) => {
        const definition = definitionsByKey.get(item.columnKey) || {
            key: item.columnKey,
            field: item.columnKey,
            label: item.columnKey,
            type: 'text',
            options: [],
            presets: []
        };
        if (definition.type === 'multi-select') return matchesMultiSelect(row, definition, item.value);
        if (definition.type === 'single-select') return matchesSingleSelect(row, definition, item.value);
        if (definition.type === 'date-range') return matchesDateRange(row, definition, item.value);
        if (definition.type === 'date-preset') return matchesDatePreset(row, definition, item.value);
        return matchesLegacyFilter(row?.[definition.field], definition, item);
    }));
}

export function getFilterItemSummary(item = {}, definition = {}) {
    if (!definition || !getFilterDefinitionKey(definition)) return '';
    if (!isFilterItemActive(item, [definition])) return '';
    const optionMap = new Map((Array.isArray(definition?.options) ? definition.options : []).map((option) => [toText(option?.value), toText(option?.label || option?.value)]));
    if (definition.type === 'multi-select') {
        const values = normalizeMultiSelectValue(item.value);
        if (values.length === 1) return `${definition.label}: ${optionMap.get(values[0]) || values[0]}`;
        return `${definition.label}: ${values.length} seleccionados`;
    }
    if (definition.type === 'date-range') {
        const { from, to } = normalizeDateRangeValue(item.value);
        if (from && to) return `${from.slice(8, 10)}/${from.slice(5, 7)} - ${to.slice(8, 10)}/${to.slice(5, 7)}/${to.slice(0, 4)}`;
        if (from) return `Desde ${from.slice(8, 10)}/${from.slice(5, 7)}/${from.slice(0, 4)}`;
        if (to) return `Hasta ${to.slice(8, 10)}/${to.slice(5, 7)}/${to.slice(0, 4)}`;
        return '';
    }
    if (definition.type === 'date-preset') {
        const preset = getPresetByValue(definition, item.value);
        return preset ? `${definition.label}: ${preset.label}` : '';
    }
    if (definition.type === 'single-select') {
        const value = toText(item.value);
        return `${definition.label}: ${optionMap.get(value) || value}`;
    }
    return `${definition.label}: ${toText(item.value)}`;
}
