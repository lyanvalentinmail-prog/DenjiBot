import fs from 'node:fs';
import axios from 'axios';
import chalk from 'chalk';
import config, { onSettingsChange } from '#config';
import db from '#db';
import exif from '#core/exif';
import { DEFAULT_UA, getBuffer } from './simple.ts';
import {
    videoToAudioStickerWebp,
    extractStickerAudio,
    sendAudioSticker
} from './audiosticker.ts';
import type { TikTokS2Mode, TikTokS2Source } from './settings.ts';

const { writeExif } = exif;

const META_KEY = 'tiktok_s2_seen_v1';
const MAX_SEEN_IDS = 300;
const MAX_PER_POLL = 3;
const USER_CACHE_TTL_MS = 30 * 60_000;

export interface ResolvedTikTokVideo {
    id: string;
    videoUrl: string;
    title: string;
    author: string;
    isImageOnly: boolean;
}

export interface TikTokFeedItem {
    id: string;
    videoUrl: string;
    shareUrl: string;
    title: string;
    author: string;
    createTime: number;
}

interface SeenBucket {
    seeded: boolean;
    ids: string[];
    updatedAt: number;
}

type SeenStore = Record<string, SeenBucket>;

const userInfoCache = new Map<string, { userId: string; secUid: string; ts: number }>();

function unlinkSafe(file: string | null | undefined): void {
    try {
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
}

function fixTikwmUrl(u: unknown): string {
    if (!u || typeof u !== 'string') return '';
    if (u.startsWith('http')) return u;
    return `https://www.tikwm.com${u.startsWith('/') ? '' : '/'}${u}`;
}

async function fetchJson(url: string, options: { method?: string; data?: any; headers?: Record<string, string> } = {}): Promise<any> {
    const { data } = await axios({
        url,
        method: (options.method || 'GET') as any,
        data: options.data,
        timeout: 22_000,
        headers: {
            'User-Agent': DEFAULT_UA,
            Accept: 'application/json',
            ...(options.headers || {})
        }
    });
    return data;
}

/**
 * Extrae el primer enlace de video/post de TikTok presente en un texto
 * (ignora enlaces que solo apuntan a un perfil `@usuario` sin video).
 */
export function extractTikTokUrl(text: string): string | null {
    const raw = String(text || '');
    const match = raw.match(/https?:\/\/((?:www|m|vm|vt|lite)\.)?tiktok\.com\/[^\s<>"]+/i);
    if (!match) return null;
    const url = match[0].replace(/[),.!?]+$/, '');
    // Descartar enlaces que solo son perfil de usuario (ej. tiktok.com/@user sin /video/ ni shortlink)
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const pathname = parsed.pathname.replace(/\/+$/, '');
        if ((host === 'www.tiktok.com' || host === 'tiktok.com' || host === 'm.tiktok.com') && /^\/@[a-zA-Z0-9._-]+$/.test(pathname)) {
            return null;
        }
    } catch {
        return null;
    }
    return url;
}

/**
 * Resuelve la URL directa sin marca de agua de un video de TikTok.
 */
export async function resolveTikTokVideo(url: string): Promise<ResolvedTikTokVideo | null> {
    const enc = encodeURIComponent(url);
    const g = globalThis as any;
    const delirius = g.APIs?.delirius?.url || 'https://api.delirius.online';
    const vreden = g.APIs?.vreden?.url || 'https://api.vreden.web.id';
    const yuki = g.APIs?.yuki;

    const providers: Array<() => Promise<ResolvedTikTokVideo | null>> = [
        async () => {
            const res = await fetchJson(`https://www.tikwm.com/api/?url=${enc}&hd=1`);
            const d = res?.data;
            if (!d) return null;
            const images = Array.isArray(d.images) ? d.images.filter(Boolean) : [];
            const videoUrl = fixTikwmUrl(d.hdplay || d.play || d.wmplay);
            if (!images.length && !videoUrl) return null;
            return {
                id: String(d.id || d.aweme_id || url),
                videoUrl,
                title: String(d.title || ''),
                author: String(d.author?.unique_id || d.author?.nickname || ''),
                isImageOnly: images.length > 0
            };
        },
        async () => {
            const res = await fetchJson(`${delirius}/download/tiktok?url=${enc}`);
            const d = res?.data;
            const media = d?.meta?.media?.[0];
            if (!media) return null;
            if (media.type === 'image') {
                return {
                    id: String(d.id || url),
                    videoUrl: '',
                    title: String(d.title || ''),
                    author: String(d.author?.username || d.author?.nickname || ''),
                    isImageOnly: true
                };
            }
            const videoUrl = String(media.org || media.hd || media.wm || '');
            if (!videoUrl) return null;
            return {
                id: String(d.id || url),
                videoUrl,
                title: String(d.title || ''),
                author: String(d.author?.username || d.author?.nickname || ''),
                isImageOnly: false
            };
        },
        async () => {
            const res = await fetchJson(`https://api.starlights.uk/api/download/tiktok?url=${enc}`);
            const d = res?.data || res?.result;
            if (!d) return null;
            const images = Array.isArray(d.images) ? d.images : [];
            const videoUrl = String(d.nowm || d.hd || d.video || d.url || '');
            if (!images.length && !videoUrl) return null;
            return {
                id: String(d.id || url),
                videoUrl,
                title: String(d.title || ''),
                author: String(d.author?.nickname || d.creator || d.author || ''),
                isImageOnly: images.length > 0
            };
        },
        async () => {
            const res = await fetchJson(`${vreden}/api/v1/download/tiktok?url=${enc}`);
            const d = res?.result;
            if (!d) return null;
            const list = Array.isArray(d.data) ? d.data : [];
            const photos = list.filter((x: any) => x.type === 'photo' && x.url);
            const vid =
                list.find((x: any) => x.type === 'nowatermark_hd')?.url ||
                list.find((x: any) => x.type === 'nowatermark')?.url ||
                list.find((x: any) => x.url)?.url ||
                '';
            if (!photos.length && !vid) return null;
            return {
                id: String(d.id || url),
                videoUrl: String(vid),
                title: String(d.title || ''),
                author: String(d.author?.nickname || d.author?.fullname || ''),
                isImageOnly: photos.length > 0
            };
        },
        async () => {
            if (!yuki?.url) return null;
            const res = await fetchJson(`${yuki.url}/download/tiktok?url=${enc}&key=${yuki.key}`);
            const d = res?.data || res?.result;
            if (!d) return null;
            const images = Array.isArray(d.images) ? d.images : [];
            const videoUrl = String(d.hdplay || d.play || d.video || d.url || '');
            if (!images.length && !videoUrl) return null;
            return {
                id: String(d.id || url),
                videoUrl,
                title: String(d.title || ''),
                author: String(d.author?.nickname || d.author || ''),
                isImageOnly: images.length > 0
            };
        }
    ];

    for (const fn of providers) {
        try {
            const out = await fn();
            if (out) return out;
        } catch {}
    }
    return null;
}

async function resolveTikwmUserIds(username: string): Promise<{ userId: string; secUid: string }> {
    const key = username.toLowerCase();
    const cached = userInfoCache.get(key);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL_MS) {
        return { userId: cached.userId, secUid: cached.secUid };
    }
    try {
        const res = await fetchJson(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`);
        const u = res?.data?.user;
        const userId = String(u?.id || '');
        const secUid = String(u?.secUid || '');
        if (userId || secUid) {
            userInfoCache.set(key, { userId, secUid, ts: Date.now() });
        }
        return { userId, secUid };
    } catch {
        return { userId: '', secUid: '' };
    }
}

async function fetchSingleTikwmFeed(
    username: string,
    endpoint: 'repost' | 'posts' | 'favorite',
    ids: { userId: string; secUid: string }
): Promise<TikTokFeedItem[]> {
    const params = new URLSearchParams({
        unique_id: username,
        count: '12',
        cursor: '0',
        hd: '1'
    });
    if (ids.userId) params.set('user_id', ids.userId);
    if (ids.secUid) params.set('secUid', ids.secUid);

    const res = await fetchJson(`https://www.tikwm.com/api/user/${endpoint}?${params.toString()}`);
    const rawList = Array.isArray(res?.data?.videos)
        ? res.data.videos
        : Array.isArray(res?.data)
            ? res.data
            : [];

    const items: TikTokFeedItem[] = [];
    for (const v of rawList) {
        if (!v) continue;
        if (Array.isArray(v.images) && v.images.length > 0) continue;
        const id = String(v.video_id || v.aweme_id || v.id || '').trim();
        const videoUrl = fixTikwmUrl(v.hdplay || v.play || v.wmplay);
        const authorUid = String(v.author?.unique_id || username);
        const shareUrl = id ? `https://www.tiktok.com/@${authorUid}/video/${id}` : '';
        if (!id || (!videoUrl && !shareUrl)) continue;
        items.push({
            id,
            videoUrl,
            shareUrl,
            title: String(v.title || ''),
            author: String(v.author?.unique_id || v.author?.nickname || username),
            createTime: Number(v.create_time || 0)
        });
    }
    return items;
}

/**
 * Obtiene los videos recientes de una cuenta de TikTok según la fuente configurada.
 */
export async function fetchTikTokUserVideos(
    username: string,
    source: TikTokS2Source
): Promise<TikTokFeedItem[]> {
    const clean = username.trim().replace(/^@+/, '');
    if (!clean) return [];

    const ids = await resolveTikwmUserIds(clean);
    const endpoints: Array<'repost' | 'posts' | 'favorite'> =
        source === 'all' ? ['repost', 'posts', 'favorite'] : [source];

    const results = await Promise.allSettled(
        endpoints.map(ep => fetchSingleTikwmFeed(clean, ep, ids))
    );

    const byId = new Map<string, TikTokFeedItem>();
    for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const item of r.value) {
            if (!byId.has(item.id)) byId.set(item.id, item);
        }
    }

    return Array.from(byId.values());
}

function resolveDefaultStickerMeta(authorHint = ''): { packname: string; author: string } {
    const firstOwner = Array.from(config.owner)[0];
    if (firstOwner) {
        try {
            const ownerData = db.getUser(`${firstOwner}@s.whatsapp.net`);
            const m1 = ownerData?.metadatos ? String(ownerData.metadatos).trim() : '';
            const m2 = ownerData?.metadatos2 ? String(ownerData.metadatos2).trim() : '';
            if (m1) return { packname: m1, author: m2 };
        } catch {}
    }
    return {
        packname: config.botName || 'Denji bot',
        author: authorHint ? `@${authorHint.replace(/^@+/, '')}` : config.devName || 'TikTok'
    };
}

/**
 * Convierte un buffer MP4 en sticker con audio (`.s2`) y lo envía al `targetJid`.
 */
export async function convertAndSendTikTokS2(
    sock: any,
    targetJid: string,
    videoBuffer: Buffer,
    opts: { mode?: TikTokS2Mode; authorHint?: string; quoted?: any } = {}
): Promise<void> {
    if (!videoBuffer?.length) {
        throw new Error('No se pudo descargar el video de TikTok.');
    }
    if (videoBuffer.length > 25 * 1024 * 1024) {
        throw new Error('El video de TikTok supera el límite máximo de 25 MB.');
    }

    const mode: TikTokS2Mode = opts.mode || config.tiktokS2.mode || 'normal';
    const { packname, author } = resolveDefaultStickerMeta(opts.authorHint);

    const [rawWebp, audioData] = await Promise.all([
        videoToAudioStickerWebp(videoBuffer, mode),
        extractStickerAudio(videoBuffer)
    ]);

    const stickerPath = await writeExif(
        { mimetype: 'image/webp', data: rawWebp },
        { packname, author, categories: ['🎵'] }
    );

    try {
        const finalWebp = fs.readFileSync(stickerPath);
        const payload = {
            sticker: finalWebp,
            audio: audioData.buffer,
            seconds: audioData.seconds,
            waveform: audioData.waveform
        };
        if (typeof sock?.sendAudioSticker === 'function') {
            await sock.sendAudioSticker(targetJid, payload, opts.quoted);
        } else {
            await sendAudioSticker(sock, targetJid, payload, opts.quoted);
        }
    } finally {
        unlinkSafe(stickerPath);
    }
}

/**
 * Descarga un enlace de TikTok, lo convierte en `.s2` y lo envía al `targetJid`.
 */
export async function convertTikTokUrlToS2(
    sock: any,
    targetJid: string,
    url: string,
    mode?: TikTokS2Mode,
    quoted?: any
): Promise<ResolvedTikTokVideo> {
    const info = await resolveTikTokVideo(url);
    if (!info) {
        throw new Error('No se pudo obtener el video desde ese enlace de TikTok.');
    }
    if (info.isImageOnly || !info.videoUrl) {
        throw new Error('Esa publicación de TikTok es un carrusel de fotos, no un video con audio.');
    }
    const videoBuffer = await getBuffer(info.videoUrl, { timeout: 35_000 });
    await convertAndSendTikTokS2(sock, targetJid, videoBuffer, {
        mode: mode || config.tiktokS2.mode,
        authorHint: info.author,
        quoted
    });
    return info;
}

// ───────────────────── Monitor automático de cuenta TikTok ─────────────────────

let pollTimer: NodeJS.Timeout | null = null;
let pollingNow = false;
let watcherStarted = false;
let sockGetter: (() => any) | null = null;

function loadSeenStore(): SeenStore {
    const raw = db.getMeta<SeenStore>(META_KEY, {});
    return raw && typeof raw === 'object' ? raw : {};
}

function saveSeenStore(store: SeenStore): void {
    const keys = Object.keys(store);
    if (keys.length > 25) {
        keys.sort((a, b) => (store[a]?.updatedAt || 0) - (store[b]?.updatedAt || 0));
        for (const k of keys.slice(0, keys.length - 25)) delete store[k];
    }
    db.setMeta(META_KEY, store);
}

export async function pollTikTokAccountOnce(): Promise<void> {
    if (pollingNow || (globalThis as any).__denjiWiping) return;
    const cfg = config.tiktokS2;
    if (!cfg.enabled || !cfg.username || !cfg.targetJid) return;

    const sock = sockGetter?.();
    if (!sock?.user?.id) return;

    pollingNow = true;
    try {
        const items = await fetchTikTokUserVideos(cfg.username, cfg.source);
        if (!items.length) return;

        const bucketKey = `${cfg.username.toLowerCase()}:${cfg.source}`;
        const store = loadSeenStore();
        const bucket: SeenBucket = store[bucketKey] && Array.isArray(store[bucketKey].ids)
            ? store[bucketKey]
            : { seeded: false, ids: [], updatedAt: Date.now() };

        // Primera vez que se monitorea esta cuenta/fuente: registrar los videos actuales
        // para enviar únicamente los videos NUEVOS a partir de este momento.
        if (!bucket.seeded) {
            bucket.seeded = true;
            bucket.ids = Array.from(new Set([...items.map(i => i.id), ...bucket.ids])).slice(0, MAX_SEEN_IDS);
            bucket.updatedAt = Date.now();
            store[bucketKey] = bucket;
            saveSeenStore(store);
            return;
        }

        const seenSet = new Set(bucket.ids);
        const unseen = items.filter(i => !seenSet.has(i.id));
        if (!unseen.length) return;

        // Enviar en orden cronológico (del más antiguo al más reciente de los nuevos)
        const batch = unseen.reverse().slice(0, MAX_PER_POLL);
        // Marcar todos los detectados como vistos para no reintentar en bucle videos sin audio
        bucket.ids = Array.from(new Set([...unseen.map(i => i.id), ...bucket.ids])).slice(0, MAX_SEEN_IDS);
        bucket.updatedAt = Date.now();
        store[bucketKey] = bucket;
        saveSeenStore(store);

        for (const item of batch) {
            try {
                let videoBuffer: Buffer | null = null;
                if (item.videoUrl) {
                    videoBuffer = await getBuffer(item.videoUrl, { timeout: 35_000 }).catch(() => null);
                }
                if (!videoBuffer?.length && item.shareUrl) {
                    const resolved = await resolveTikTokVideo(item.shareUrl);
                    if (resolved?.videoUrl && !resolved.isImageOnly) {
                        videoBuffer = await getBuffer(resolved.videoUrl, { timeout: 35_000 }).catch(() => null);
                    }
                }
                if (!videoBuffer?.length) continue;

                await convertAndSendTikTokS2(sock, cfg.targetJid, videoBuffer, {
                    mode: cfg.mode,
                    authorHint: item.author || cfg.username
                });
                console.log(
                    chalk.cyan(`[ TikTok→.s2 ] Sticker enviado a ${cfg.targetLabel || cfg.targetJid} (@${cfg.username} · ${item.id})`)
                );
            } catch (err: any) {
                if (err?.code === 'NO_AUDIO_STREAM' || err?.message === 'NO_AUDIO_STREAM') continue;
                console.error(chalk.gray(`[ TikTok→.s2 ] No se pudo convertir ${item.id}: ${err?.message || err}`));
            }
        }
    } catch (err: any) {
        console.error(chalk.gray(`[ TikTok→.s2 ] Error al revisar @${cfg.username}: ${err?.message || err}`));
    } finally {
        pollingNow = false;
    }
}

function scheduleWatcher(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    const cfg = config.tiktokS2;
    if (!cfg.enabled || !cfg.username || !cfg.targetJid) return;

    const intervalMs = Math.max(20, cfg.pollSeconds || 45) * 1000;
    pollTimer = setInterval(() => {
        pollTikTokAccountOnce().catch(() => {});
    }, intervalMs);
    pollTimer.unref();

    // Ejecutar una revisión inicial a los pocos segundos para sembrar/detectar rápido.
    const warmup = setTimeout(() => {
        pollTikTokAccountOnce().catch(() => {});
    }, 3000);
    warmup.unref();
}

export function startTikTokS2Watcher(getSock: () => any): void {
    sockGetter = getSock;
    if (!watcherStarted) {
        watcherStarted = true;
        onSettingsChange(() => {
            scheduleWatcher();
        });
    }
    scheduleWatcher();
}

export default {
    extractTikTokUrl,
    resolveTikTokVideo,
    fetchTikTokUserVideos,
    convertAndSendTikTokS2,
    convertTikTokUrlToS2,
    pollTikTokAccountOnce,
    startTikTokS2Watcher
};
