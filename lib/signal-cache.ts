export interface MemoryCacheOptions {
    stdTTL?: number;
    checkperiod?: number;
    useClones?: boolean;
}

/**
 * Caché en memoria con TTL compatible con `CacheStore` de Baileys
 * (reemplazo ligero y sin dependencias externas de `node-cache`).
 */
export class MemoryCache<T = any> {
    #store = new Map<string, { value: T; expiresAt: number }>();
    #stdTTL: number;
    #timer: NodeJS.Timeout | null = null;

    constructor(options: MemoryCacheOptions = {}) {
        this.#stdTTL = typeof options.stdTTL === 'number' && options.stdTTL > 0 ? options.stdTTL : 0;
        const period = typeof options.checkperiod === 'number' && options.checkperiod > 0 ? options.checkperiod : 0;
        if (period > 0) {
            this.#timer = setInterval(() => this.#prune(), period * 1000);
            this.#timer.unref();
        }
    }

    #prune(): void {
        const now = Date.now();
        for (const [key, entry] of this.#store) {
            if (entry.expiresAt > 0 && now >= entry.expiresAt) {
                this.#store.delete(key);
            }
        }
    }

    set<V = T>(key: string, value: V, ttl?: number): boolean {
        if (value === undefined) {
            this.#store.delete(key);
            return true;
        }
        const sec = typeof ttl === 'number' ? ttl : this.#stdTTL;
        const expiresAt = sec > 0 ? Date.now() + sec * 1000 : 0;
        this.#store.set(key, { value: value as unknown as T, expiresAt });
        return true;
    }

    get<V = T>(key: string): V | undefined {
        const entry = this.#store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt > 0 && Date.now() >= entry.expiresAt) {
            this.#store.delete(key);
            return undefined;
        }
        return entry.value as unknown as V;
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    del(keys: string | string[]): number {
        const list = Array.isArray(keys) ? keys : [keys];
        let removed = 0;
        for (const k of list) {
            if (this.#store.delete(k)) removed++;
        }
        return removed;
    }

    flushAll(): void {
        this.#store.clear();
    }

    close(): void {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
        this.#store.clear();
    }
}

export const SIGNAL_CACHE_OPTIONS: MemoryCacheOptions = {
    stdTTL: 600,
    checkperiod: 120,
    useClones: false
};

export function createSignalCache(
    CacheClass: new (opts?: MemoryCacheOptions) => any = MemoryCache,
    options: MemoryCacheOptions = SIGNAL_CACHE_OPTIONS
): any {
    const cache = new CacheClass(options);
    const set = cache.set.bind(cache);
    const get = cache.get.bind(cache);
    const del = cache.del.bind(cache);
    const flushAll = cache.flushAll.bind(cache);
    cache.set = (key: string, value: any, ttl?: number) =>
        value === undefined ? (del(key), true) : ttl === undefined ? set(key, value) : set(key, value, ttl);
    cache.get = (key: string) => get(key);
    cache.del = (key: string) => del(key);
    cache.flushAll = () => flushAll();
    return cache;
}

export default MemoryCache;
