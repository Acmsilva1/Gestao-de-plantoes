const cache = new Map();

export const cacheModel = {
    get(key) {
        const entry = cache.get(key);

        if (!entry) {
            return null;
        }

        if (entry.expiresAt && entry.expiresAt < Date.now()) {
            cache.delete(key);
            return null;
        }

        return entry.value;
    },
    set(key, value, ttlMs = 60_000) {
        cache.set(key, {
            value,
            expiresAt: ttlMs ? Date.now() + ttlMs : null
        });

        return value;
    },
    delete(key) {
        cache.delete(key);
    },
    clear() {
        cache.clear();
    }
};
