import axios from 'axios';

/**
 * Utilidades para buscar paquetes y stickers individuales en Sticker.ly,
 * con respaldo a las APIs de Delirius/Yuki cuando la API oficial no responde.
 */

export const STICKERLY_UA = 'androidapp.stickerly/3.17.0 (Pixel 8; U; Android 14; es-ES; es;)';

export interface StickerLySticker {
    url: string;
    isAnimated: boolean;
}

export interface StickerLyPack {
    name: string;
    author: string;
    isAnimated: boolean;
    stickers: StickerLySticker[];
}

function packsFromSearchPayload(data: any, fallbackName: string): StickerLyPack[] {
    const list =
        (Array.isArray(data?.result?.stickerPacks) && data.result.stickerPacks) ||
        (Array.isArray(data?.stickerPacks) && data.stickerPacks) ||
        (Array.isArray(data?.data) && data.data) ||
        [];
    const out: StickerLyPack[] = [];
    for (const p of list) {
        if (!p || p.nsfw) continue;
        const prefix = p.resourceUrlPrefix || '';
        const files = Array.isArray(p.resourceFiles) ? p.resourceFiles : [];
        const stickers = files
            .map((f: any) => ({
                url: `${prefix}${typeof f === 'string' ? f : f?.fileName || ''}`,
                isAnimated: Boolean(p.isAnimated ?? p.animated)
            }))
            .filter((s: StickerLySticker) => s.url);
        if (!stickers.length) continue;
        out.push({
            name: p.name || fallbackName,
            author: p.authorName || p.username || 'Sticker.ly',
            isAnimated: Boolean(p.isAnimated ?? p.animated),
            stickers
        });
    }
    return out;
}

/** Búsqueda directa en la API v4 de Sticker.ly. Lanza en caso de error de red. */
export async function searchStickerLyDirect(query: string): Promise<StickerLyPack[]> {
    const { data } = await axios.post(
        'https://api.sticker.ly/v4/stickerPack/smartSearch',
        {
            keyword: query,
            enabledKeywordSearch: true,
            filter: {
                extendSearchResult: false,
                sortBy: 'RECOMMENDED',
                languages: ['ALL'],
                minStickerCount: 5,
                searchBy: 'ALL',
                stickerType: 'ALL'
            }
        },
        {
            timeout: 15_000,
            headers: {
                'User-Agent': STICKERLY_UA,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        }
    );
    return packsFromSearchPayload(data, query);
}

/** Detalle de un paquete por su código (sticker.ly/s/<code>). Lanza en caso de error de red. */
export async function getPackDetail(code: string): Promise<StickerLyPack | null> {
    const { data } = await axios.get(
        `https://api.sticker.ly/v4/stickerPack/${encodeURIComponent(code)}?needRelation=false`,
        {
            timeout: 15_000,
            headers: { 'User-Agent': STICKERLY_UA, Accept: 'application/json' }
        }
    );
    const p = data?.result;
    if (!p || !Array.isArray(p.stickers) || !p.stickers.length) return null;
    const prefix = p.resourceUrlPrefix || '';
    const stickers = p.stickers
        .map((s: any) => ({
            url: s?.fileName ? `${prefix}${s.fileName}` : s?.resourceUrl || '',
            isAnimated: Boolean(s?.isAnimated ?? p?.isAnimated ?? p?.animated)
        }))
        .filter((s: StickerLySticker) => s.url);
    if (!stickers.length) return null;
    return {
        name: p.name || 'Stickers',
        author: p.user?.displayName || p.user?.userName || p.authorName || 'Sticker.ly',
        isAnimated: Boolean(p.isAnimated ?? p.animated),
        stickers
    };
}

function extractPackCode(url: string): string | null {
    return String(url || '').match(/sticker\.ly\/(?:s\/)?([a-zA-Z0-9]+)/i)?.[1] || null;
}

export function isStickerlyUrl(text: string): boolean {
    return /sticker\.ly\//i.test(String(text || ''));
}

export function stickerlyUrlOf(text: string): string | null {
    const code = extractPackCode(text);
    return code ? `https://sticker.ly/s/${code}` : null;
}

/**
 * Resuelve un pack a partir de su URL (y opcionalmente su código).
 * Primero intenta la API oficial; si falla, cae a Delirius/Yuki.
 */
export async function getPackFromUrl(url: string, code?: string | null): Promise<StickerLyPack | null> {
    const resolvedCode = code || extractPackCode(url);
    if (resolvedCode) {
        try {
            const direct = await getPackDetail(resolvedCode);
            if (direct?.stickers?.length) return direct;
        } catch {}
    }

    const yuki = (globalThis as any).APIs?.yuki;
    const delirius = (globalThis as any).APIs?.delirius?.url || 'https://api.delirius.online';

    const fallbacks: (() => Promise<StickerLyPack | null>)[] = [
        async () => {
            const { data } = await axios.get(
                `${delirius}/download/stickerly?url=${encodeURIComponent(url)}`,
                { timeout: 15_000 }
            );
            const d = data?.data;
            if (!Array.isArray(d?.stickers) || !d.stickers.length) return null;
            const stickers = d.stickers
                .map((u: any) => ({
                    url: typeof u === 'string' ? u : u?.url || '',
                    isAnimated: false
                }))
                .filter((s: StickerLySticker) => s.url);
            if (!stickers.length) return null;
            return {
                name: d.name || 'Stickers',
                author: d.author || d.username || 'Sticker.ly',
                isAnimated: false,
                stickers
            };
        },
        async () => {
            if (!yuki?.url) return null;
            const { data } = await axios.get(`${yuki.url}/stickerly/detail`, {
                params: { url, key: yuki.key },
                timeout: 15_000
            });
            const d = data?.detalles;
            if (!Array.isArray(d?.stickers) || !d.stickers.length) return null;
            const stickers = d.stickers
                .filter((s: any) => s?.imageUrl)
                .map((s: any) => ({ url: s.imageUrl, isAnimated: Boolean(s.isAnimated) }));
            if (!stickers.length) return null;
            return {
                name: d.name || 'Stickers',
                author: d.author?.name || d.author?.username || 'Sticker.ly',
                isAnimated: Boolean(d.isAnimated),
                stickers
            };
        }
    ];

    for (const fn of fallbacks) {
        try {
            const out = await fn();
            if (out?.stickers?.length) return out;
        } catch {}
    }
    return null;
}

export interface PackSearchResult {
    packs: StickerLyPack[];
    /** Cuántas fuentes fallaron por error de red. */
    failures: number;
    /** true si al menos una fuente respondió sin error (aunque no haya resultados). */
    responded: boolean;
}

/**
 * Busca packs por texto. Devuelve los packs encontrados y cuántas fuentes
 * fallaron, para poder distinguir "sin resultados" de "sin conexión".
 */
export async function searchPacks(query: string): Promise<PackSearchResult> {
    let failures = 0;
    let responded = false;
    let packs: StickerLyPack[] = [];
    try {
        packs = await searchStickerLyDirect(query);
        responded = true;
    } catch {
        failures += 1;
    }
    if (packs.length) return { packs, failures, responded };

    const delirius = (globalThis as any).APIs?.delirius?.url || 'https://api.delirius.online';
    const yuki = (globalThis as any).APIs?.yuki;

    try {
        const { data } = await axios.get(
            `${delirius}/search/stickerly?query=${encodeURIComponent(query)}`,
            { timeout: 15_000 }
        );
        responded = true;
        const list = Array.isArray(data?.data) ? data.data : [];
        for (const item of list.slice(0, 3)) {
            const url = item?.url || '';
            const code = extractPackCode(url);
            const detail = await getPackFromUrl(url, code);
            if (detail?.stickers?.length) packs.push(detail);
            if (packs.length >= 3) break;
        }
    } catch {
        failures += 1;
    }

    if (yuki?.url && packs.length === 0) {
        try {
            const { data } = await axios.get(`${yuki.url}/stickerly/search`, {
                params: { query, key: yuki.key },
                timeout: 15_000
            });
            responded = true;
            const list = Array.isArray(data?.resultados) ? data.resultados : [];
            for (const item of list.slice(0, 4)) {
                const url = item?.url || '';
                const code = extractPackCode(url);
                const detail = await getPackFromUrl(url, code);
                if (detail?.stickers?.length) packs.push(detail);
                if (packs.length >= 3) break;
            }
        } catch {
            failures += 1;
        }
    }

    return { packs, failures, responded };
}

export interface SingleStickerResult {
    url: string;
    isAnimated: boolean;
    packName: string;
    author: string;
}

/** Escoge un sticker individual al azar entre los packs mejor posicionados. */
export async function findSingleSticker(query: string): Promise<{ sticker: SingleStickerResult | null; failures: number; responded: boolean }> {
    if (isStickerlyUrl(query)) {
        const pack = await getPackFromUrl(stickerlyUrlOf(query) || query);
        const pick = pack?.stickers?.length
            ? pack.stickers[Math.floor(Math.random() * pack.stickers.length)]
            : null;
        return {
            sticker: pick ? { ...pick, packName: pack!.name, author: pack!.author } : null,
            failures: pack ? 0 : 1,
            responded: Boolean(pack)
        };
    }
    const { packs, failures, responded } = await searchPacks(query);
    if (!packs.length) return { sticker: null, failures, responded };
    const all: SingleStickerResult[] = packs.slice(0, 4).flatMap(p =>
        p.stickers.map(s => ({ ...s, packName: p.name, author: p.author }))
    );
    if (!all.length) return { sticker: null, failures, responded };
    return { sticker: all[Math.floor(Math.random() * all.length)], failures, responded };
}
