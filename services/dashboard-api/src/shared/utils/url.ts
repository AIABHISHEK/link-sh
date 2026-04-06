export function getValidatedUrl(value: unknown): string | null {
    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }

    try {
        new URL(value);
        return value;
    } catch {
        return null;
    }
}
