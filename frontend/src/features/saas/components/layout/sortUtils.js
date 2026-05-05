let sortItemSequence = 0;

export function normalizeSortDirection(value = 'asc') {
    return String(value || '').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
}

export function createEmptySortItem() {
    sortItemSequence += 1;
    return {
        id: `sort_${sortItemSequence}`,
        columnKey: '',
        direction: 'asc'
    };
}

export function normalizeSortItem(item = {}, fallbackId = '') {
    const source = item && typeof item === 'object' ? item : {};
    return {
        id: String(source?.id || fallbackId || createEmptySortItem().id),
        columnKey: String(source?.columnKey || '').trim(),
        direction: normalizeSortDirection(source?.direction)
    };
}

export function normalizeSortState(sort = {}) {
    const source = sort && typeof sort === 'object' ? sort : {};
    const rawItems = Array.isArray(source?.items)
        ? source.items
        : (String(source?.columnKey || '').trim() ? [source] : []);
    const normalizedItems = (rawItems.length > 0 ? rawItems : [createEmptySortItem()])
        .map((item, index) => normalizeSortItem(item, `sort_${index + 1}`));
    const dedupedItems = [];
    const seenKeys = new Set();

    normalizedItems.forEach((item) => {
        const key = String(item?.columnKey || '').trim();
        if (key) {
            if (seenKeys.has(key)) return;
            seenKeys.add(key);
        }
        dedupedItems.push(item);
    });

    const items = dedupedItems.length > 0 ? dedupedItems : [createEmptySortItem()];
    const activeItems = items.filter((item) => String(item?.columnKey || '').trim());
    const primary = activeItems[0] || items[0] || createEmptySortItem();

    return {
        items,
        activeItems,
        columnKey: String(primary?.columnKey || '').trim(),
        direction: normalizeSortDirection(primary?.direction)
    };
}

export function buildSortState(items = []) {
    const normalized = normalizeSortState({ items });
    return {
        items: normalized.items,
        columnKey: normalized.columnKey,
        direction: normalized.direction
    };
}

export function clearSortState() {
    return buildSortState([createEmptySortItem()]);
}

export function promoteSortColumn(sort = {}, columnKey = '') {
    const nextColumnKey = String(columnKey || '').trim();
    if (!nextColumnKey) return clearSortState();

    const normalized = normalizeSortState(sort);
    const activeItems = normalized.activeItems;
    const existing = activeItems.find((item) => item.columnKey === nextColumnKey) || null;

    if (existing && activeItems[0]?.columnKey === nextColumnKey) {
        return buildSortState([
            {
                ...existing,
                direction: existing.direction === 'asc' ? 'desc' : 'asc'
            },
            ...activeItems.filter((item) => item.columnKey !== nextColumnKey)
        ]);
    }

    return buildSortState([
        {
            ...(existing || createEmptySortItem()),
            columnKey: nextColumnKey,
            direction: normalizeSortDirection(existing?.direction)
        },
        ...activeItems.filter((item) => item.columnKey !== nextColumnKey)
    ]);
}

function compareSortValues(leftValue, rightValue) {
    if (leftValue === rightValue) return 0;
    if (leftValue === null || leftValue === undefined || leftValue === '') return 1;
    if (rightValue === null || rightValue === undefined || rightValue === '') return -1;

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return leftValue - rightValue;
    }

    const leftDate = new Date(leftValue);
    const rightDate = new Date(rightValue);
    const leftTime = leftDate.getTime();
    const rightTime = rightDate.getTime();

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime - rightTime;
    }

    return String(leftValue).localeCompare(String(rightValue), 'es', {
        numeric: true,
        sensitivity: 'base'
    });
}

export function applyMultiSort(rows = [], sort = {}) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const activeItems = normalizeSortState(sort).activeItems;
    if (activeItems.length === 0) return sourceRows;

    return [...sourceRows].sort((left, right) => {
        for (const item of activeItems) {
            const comparison = compareSortValues(left?.[item.columnKey], right?.[item.columnKey]);
            if (comparison !== 0) {
                return comparison * (item.direction === 'desc' ? -1 : 1);
            }
        }
        return 0;
    });
}
