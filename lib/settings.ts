import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ajustes personalizables de Denji bot.
 *
 * Se guardan en `settings.json` (ignorado por git) para que el panel de
 * `npm start` pueda cambiarlos sin tocar el código y sin provocar conflictos
 * al actualizar con `git pull`. El bot los recarga en caliente.
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SETTINGS_FILE = path.join(ROOT, 'settings.json');
export const SESSIONS_DIR = path.join(ROOT, 'sessions');
export const SUBS_DIR = path.join(ROOT, 'Sessions', 'Subs');
export const DATABASE_DIR = path.join(ROOT, 'database');
export const TMP_DIR = path.join(ROOT, 'tmp');
export const DEFAULT_BANNER = 'assets/banner.jpg';

/** Formato del menú: lista interactiva, resumen de categorías o lista completa plegada. */
export type MenuStyle = 'lista' | 'categorias' | 'texto';
/** Estilo (diseño visual) del menú. */
export type MenuTheme =
    | 'yuki'
    | 'denji'
    | 'chainsaw'
    | 'mystic'
    | 'gata'
    | 'alya'
    | 'michi'
    | 'loli'
    | 'shadow'
    | 'simple';
export type LogMode = 'detallado' | 'compacto' | 'apagado';
export type TikTokS2Source = 'repost' | 'posts' | 'favorite' | 'all';
export type TikTokS2Mode = 'escalado' | 'normal' | 'borrarn';

/** Momentos en los que el bot reacciona al mensaje de quien usa un comando. */
export type ReactionEvent = 'wait' | 'done' | 'error' | 'denied' | 'unknown';

export interface Reactions {
    enabled: boolean;
    /** Emoji de cada momento; vacío = sin reacción. */
    events: Record<ReactionEvent, string>;
    /** Emoji propio de un comando: sustituye al de "listo" cuando ese comando termina. */
    commands: Record<string, string>;
}

export interface TikTokS2Settings {
    enabled: boolean;
    /** Usuario de TikTok sin @ (ej. "miusuario"); vacío = no monitorear cuenta. */
    username: string;
    /** Qué sección pública de la cuenta revisar. */
    source: TikTokS2Source;
    /** JID del grupo (@g.us) o chat (@s.whatsapp.net) donde se enviarán los .s2. */
    targetJid: string;
    /** Nombre legible del grupo o chat para mostrar en el panel. */
    targetLabel: string;
    /** Modo de .s2 a usar: escalado, normal o borrarn. */
    mode: TikTokS2Mode;
    /** Convertir enlaces de TikTok enviados al privado del bot sin usar comando. */
    privateLinks: boolean;
    /** Cada cuántos segundos revisar la cuenta de TikTok. */
    pollSeconds: number;
}

export interface Settings {
    botName: string;
    devName: string;
    prefix: string;
    coin: string;
    owners: string[];
    banner: string;
    menuStyle: MenuStyle;
    menuTheme: MenuTheme;
    /** Banner propio de cada estilo de menú; vacío = banner principal. */
    menuBanners: Record<MenuTheme, string>;
    reactions: Reactions;
    tiktokS2: TikTokS2Settings;
    logMode: LogMode;
    autoRestart: boolean;
    activeSession: string;
}

export const MENU_STYLES: MenuStyle[] = ['lista', 'categorias', 'texto'];
export const MENU_STYLE_NAMES: Record<MenuStyle, string> = {
    lista: 'Lista interactiva',
    categorias: 'Resumen por categorías',
    texto: 'Menú completo compacto'
};
export const MENU_STYLE_HINTS: Record<MenuStyle, string> = {
    lista: 'Envía una tarjeta corta con botón desplegable para elegir categoría (el más limpio).',
    categorias: 'Muestra solo el índice de categorías en texto ligero; se abre cada sección con .menu <categoría>.',
    texto: 'Envía todos los comandos resumidos en una línea por comando, plegados con "Leer más".'
};

export const MENU_THEMES: MenuTheme[] = [
    'yuki',
    'denji',
    'chainsaw',
    'mystic',
    'gata',
    'alya',
    'michi',
    'loli',
    'shadow',
    'simple'
];
export const MENU_THEME_NAMES: Record<MenuTheme, string> = {
    yuki: 'Yuki style',
    denji: 'Denji style',
    chainsaw: 'Chainsaw man style',
    mystic: 'Mystic style',
    gata: 'Gata style',
    alya: 'Alya style',
    michi: 'Michi style',
    loli: 'Loli style',
    shadow: 'Shadow style',
    simple: 'Simple style'
};

export const REACTION_EVENTS: ReactionEvent[] = ['wait', 'done', 'error', 'denied', 'unknown'];
export const REACTION_EVENT_NAMES: Record<ReactionEvent, string> = {
    wait: 'Espera / cargando',
    done: 'Listo',
    error: 'Error',
    denied: 'Sin permiso',
    unknown: 'Comando desconocido'
};
export const REACTION_EVENT_HINTS: Record<ReactionEvent, string> = {
    wait: 'Mientras el bot prepara la respuesta de un comando.',
    done: 'Cuando el comando termina.',
    error: 'Cuando el comando falla por un error del bot.',
    denied: 'Cuando alguien usa un comando que no tiene permitido (solo dueño, solo admins, solo grupos).',
    unknown: 'Cuando alguien escribe un comando que no existe.'
};
export const MAX_COMMAND_REACTIONS = 100;

export const LOG_MODES: LogMode[] = ['detallado', 'compacto', 'apagado'];

export const TIKTOK_S2_SOURCES: TikTokS2Source[] = ['repost', 'posts', 'favorite', 'all'];
export const TIKTOK_S2_SOURCE_NAMES: Record<TikTokS2Source, string> = {
    repost: 'Republicados (Reposts)',
    posts: 'Videos subidos',
    favorite: 'Me gusta públicos',
    all: 'Todo (republicados, subidos y likes)'
};
export const TIKTOK_S2_SOURCE_HINTS: Record<TikTokS2Source, string> = {
    repost: 'Cada vez que la cuenta republique un video en TikTok se hará .s2 automáticamente.',
    posts: 'Cada vez que la cuenta suba un video nuevo se convertirá en .s2.',
    favorite: 'Cada vez que la cuenta dé "Me gusta" (con likes visibles en el perfil) se hará .s2.',
    all: 'Revisa republicados, videos subidos y "Me gusta" públicos a la vez.'
};

export const TIKTOK_S2_MODES: TikTokS2Mode[] = ['normal', 'borrarn', 'escalado'];
export const TIKTOK_S2_MODE_NAMES: Record<TikTokS2Mode, string> = {
    normal: 'Normal (escala del video)',
    borrarn: 'BorrarN (sin esquinas negras)',
    escalado: 'Escalado (512x512)'
};
export const TIKTOK_S2_MODE_HINTS: Record<TikTokS2Mode, string> = {
    normal: 'Conserva la escala/proporción original del video (por defecto).',
    borrarn: 'Borra bordes y esquinas negras del video al crear el sticker con audio.',
    escalado: 'Escala el sticker directamente a 512x512.'
};

export const defaultSettings: Settings = {
    botName: 'Denji bot',
    devName: 'Denji Dev',
    prefix: '.',
    coin: 'Yenes',
    owners: [],
    banner: DEFAULT_BANNER,
    menuStyle: 'lista',
    menuTheme: 'yuki',
    menuBanners: {
        yuki: '',
        denji: '',
        chainsaw: '',
        mystic: '',
        gata: '',
        alya: '',
        michi: '',
        loli: '',
        shadow: '',
        simple: ''
    },
    reactions: {
        enabled: true,
        events: { wait: '🕘', done: '⭐️', error: '', denied: '', unknown: '' },
        commands: {}
    },
    tiktokS2: {
        enabled: false,
        username: '',
        source: 'repost',
        targetJid: '',
        targetLabel: '',
        mode: 'normal',
        privateLinks: true,
        pollSeconds: 45
    },
    logMode: 'detallado',
    autoRestart: true,
    activeSession: 'principal'
};

export const cleanNumber = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

export const isValidSessionName = (name: string): boolean => /^[a-zA-Z0-9_-]{1,24}$/.test(name);

const cleanText = (value: unknown, fallback: string, max: number): string => {
    if (typeof value !== 'string') return fallback;
    const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
    return text || fallback;
};

const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });

/** Devuelve el emoji si el texto es exactamente un emoji (lo que WhatsApp admite como reacción); si no, ''. */
export function cleanEmoji(value: unknown): string {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text || text.length > 32) return '';
    if (Array.from(segmenter.segment(text)).length !== 1) return '';
    return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text) ? text : '';
}

/** Nombre de comando normalizado (sin prefijo, minúsculas); '' si no es válido. */
export function cleanCommandName(value: unknown): string {
    if (typeof value !== 'string') return '';
    const name = value.trim().toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '');
    return /^[\p{L}\p{N}_-]{1,32}$/u.test(name) ? name : '';
}

function normalizeReactions(raw: any): Reactions {
    const src = raw && typeof raw === 'object' ? raw : {};
    const d = defaultSettings.reactions;

    const events = { ...d.events };
    if (src.events && typeof src.events === 'object') {
        for (const event of REACTION_EVENTS) {
            const value = src.events[event];
            if (value === '') events[event] = '';
            else if (value !== undefined) events[event] = cleanEmoji(value) || d.events[event];
        }
    }

    const commands: Record<string, string> = {};
    if (src.commands && typeof src.commands === 'object') {
        for (const [key, value] of Object.entries(src.commands)) {
            const name = cleanCommandName(key);
            const emoji = cleanEmoji(value);
            if (name && emoji && Object.keys(commands).length < MAX_COMMAND_REACTIONS) commands[name] = emoji;
        }
    }

    return {
        enabled: typeof src.enabled === 'boolean' ? src.enabled : d.enabled,
        events,
        commands
    };
}

function normalizeMenuBanners(raw: any): Record<MenuTheme, string> {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = { ...defaultSettings.menuBanners };
    for (const theme of MENU_THEMES) out[theme] = cleanText(src[theme], '', 500);
    return out;
}

/** Extrae el nombre de usuario de TikTok desde "@usuario", "usuario" o una URL de perfil. */
export function cleanTikTokUsername(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const urlMatch = trimmed.match(/tiktok\.com\/@([a-zA-Z0-9._-]{2,32})/i);
    const candidate = urlMatch ? urlMatch[1] : trimmed.replace(/^@+/, '').split(/[/?#\s]/)[0];
    return /^[a-zA-Z0-9._-]{2,32}$/.test(candidate) ? candidate : '';
}

/** Normaliza un JID de grupo (@g.us), usuario (@s.whatsapp.net) o número telefónico. */
export function cleanTargetJid(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^[0-9-]{8,36}@g\.us$/i.test(trimmed)) return trimmed.toLowerCase();
    if (/^[0-9]{7,20}@s\.whatsapp\.net$/i.test(trimmed)) {
        return `${cleanNumber(trimmed.split('@')[0])}@s.whatsapp.net`;
    }
    const digits = cleanNumber(trimmed);
    if (digits.length >= 7 && digits.length <= 20) return `${digits}@s.whatsapp.net`;
    return '';
}

function normalizeTikTokS2(raw: any): TikTokS2Settings {
    const src = raw && typeof raw === 'object' ? raw : {};
    const d = defaultSettings.tiktokS2;
    const pollNum = Number(src.pollSeconds);
    const pollSeconds = Number.isFinite(pollNum) ? Math.min(600, Math.max(20, Math.round(pollNum))) : d.pollSeconds;
    const targetJid = src.targetJid === '' ? '' : cleanTargetJid(src.targetJid);
    return {
        enabled: typeof src.enabled === 'boolean' ? src.enabled : d.enabled,
        username: src.username === '' ? '' : cleanTikTokUsername(src.username),
        source: TIKTOK_S2_SOURCES.includes(src.source) ? src.source : d.source,
        targetJid,
        targetLabel: targetJid ? cleanText(src.targetLabel, '', 80) : '',
        mode: TIKTOK_S2_MODES.includes(src.mode) ? src.mode : d.mode,
        privateLinks: typeof src.privateLinks === 'boolean' ? src.privateLinks : d.privateLinks,
        pollSeconds
    };
}

/** Devuelve siempre un objeto de ajustes completo y válido. */
export function normalizeSettings(raw: any): Settings {
    const src = raw && typeof raw === 'object' ? raw : {};
    const d = defaultSettings;

    const owners: string[] = Array.isArray(src.owners)
        ? Array.from(new Set<string>(src.owners.map(cleanNumber).filter((n: string) => n.length >= 7 && n.length <= 20)))
        : [...d.owners];

    const prefix: string = typeof src.prefix === 'string' && src.prefix.trim()
        ? Array.from<string>(src.prefix.trim())[0]!
        : d.prefix;

    return {
        botName: cleanText(src.botName, d.botName, 40),
        devName: cleanText(src.devName, d.devName, 40),
        prefix,
        coin: cleanText(src.coin, d.coin, 24),
        owners,
        banner: cleanText(src.banner, d.banner, 500),
        menuStyle: MENU_STYLES.includes(src.menuStyle) ? src.menuStyle : d.menuStyle,
        menuTheme: MENU_THEMES.includes(src.menuTheme) ? src.menuTheme : d.menuTheme,
        menuBanners: normalizeMenuBanners(src.menuBanners),
        reactions: normalizeReactions(src.reactions),
        tiktokS2: normalizeTikTokS2(src.tiktokS2),
        logMode: LOG_MODES.includes(src.logMode) ? src.logMode : d.logMode,
        autoRestart: typeof src.autoRestart === 'boolean' ? src.autoRestart : d.autoRestart,
        activeSession: typeof src.activeSession === 'string' && isValidSessionName(src.activeSession)
            ? src.activeSession
            : d.activeSession
    };
}

export function loadSettings(): Settings {
    try {
        return normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
    } catch {
        return normalizeSettings({});
    }
}

/** Guarda los ajustes de forma atómica (escribe a un temporal y renombra). */
export function saveSettings(next: Partial<Settings>): Settings {
    const merged = normalizeSettings({ ...loadSettings(), ...next });
    const tmp = `${SETTINGS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n');
    fs.renameSync(tmp, SETTINGS_FILE);
    return merged;
}

export function resetSettings(keep: Partial<Settings> = {}): Settings {
    const merged = normalizeSettings({ ...defaultSettings, ...keep });
    const tmp = `${SETTINGS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n');
    fs.renameSync(tmp, SETTINGS_FILE);
    return merged;
}

/** Carpeta de la sesión que usa el bot en este proceso. */
export function getSessionDir(): string {
    const fromEnv = process.env.DENJI_SESSION_DIR;
    if (fromEnv) return path.resolve(fromEnv);
    return path.join(SESSIONS_DIR, loadSettings().activeSession);
}

/** Ruta absoluta (o URL) del banner configurado; vuelve al banner por defecto si el archivo no existe. */
export function resolveBanner(banner: string): string {
    if (/^https?:\/\//i.test(banner)) return banner;
    const abs = path.isAbsolute(banner) ? banner : path.join(ROOT, banner);
    if (fs.existsSync(abs)) return abs;
    return path.join(ROOT, DEFAULT_BANNER);
}

/** Banner del menú para un estilo: el propio del estilo o, si no tiene, el principal. */
export function resolveMenuBanner(settings: Settings, theme: MenuTheme = settings.menuTheme): string {
    return resolveBanner(settings.menuBanners[theme] || settings.banner);
}

/** Observa `settings.json` y avisa cuando cambia (lo usa el proceso del bot). */
export function watchSettings(onChange: (settings: Settings) => void): void {
    fs.watchFile(SETTINGS_FILE, { interval: 1500, persistent: false }, () => {
        try {
            onChange(loadSettings());
        } catch {}
    });
}
