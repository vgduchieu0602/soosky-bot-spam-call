export default function formatResponseData (value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return Number.isFinite(value) ? value : "n/a";
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.map(formatResponseData);
    if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, formatResponseData(item)]));
    }
    return value;
}
