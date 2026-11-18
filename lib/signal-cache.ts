import NodeCache from 'node-cache';

export const SIGNAL_CACHE_OPTIONS = { stdTTL: 600, checkperiod: 120, useClones: false };

export function createSignalCache(CacheClass: any = NodeCache, options = SIGNAL_CACHE_OPTIONS): any {
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
