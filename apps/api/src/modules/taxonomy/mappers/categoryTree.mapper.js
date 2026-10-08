// Serialize nested trees iteratively: ordinary JSON.stringify overflows on deep
// valid hierarchies. Only the already-mapped category metadata is serialized.
export function serializeCategoryList(result) {
    if (result.pagination) return JSON.stringify(result);
    const parts = ['{"items":'];
    const stack = ['}', result.items];
    while (stack.length) {
        const entry = stack.pop();
        if (typeof entry === 'string') parts.push(entry);
        else if (Array.isArray(entry)) {
            parts.push('[');
            stack.push(']');
            for (let index = entry.length - 1; index >= 0; index--) {
                stack.push(entry[index]);
                if (index > 0) stack.push(',');
            }
        } else {
            const { children, ...metadata } = entry;
            parts.push(JSON.stringify(metadata).slice(0, -1), ',"children":');
            stack.push('}', children);
        }
    }
    return parts.join('');
}
