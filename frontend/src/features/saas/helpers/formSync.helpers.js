function isObjectLike(value) {
    return value !== null && typeof value === 'object';
}

export function isDeepEqual(left, right) {
    if (Object.is(left, right)) return true;

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false;
        if (left.length !== right.length) return false;
        for (let index = 0; index < left.length; index += 1) {
            if (!isDeepEqual(left[index], right[index])) return false;
        }
        return true;
    }

    if (!isObjectLike(left) || !isObjectLike(right)) return false;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
        if (!isDeepEqual(left[key], right[key])) return false;
    }

    return true;
}

export function setIfChanged(setter, nextValue) {
    setter((previousValue) => (isDeepEqual(previousValue, nextValue) ? previousValue : nextValue));
}
