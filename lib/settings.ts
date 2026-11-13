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
export const DATABASE_DIR = path.join(ROOT, 'database');
export const DEFAULT_BANNER = 'assets/banner.jpg';

/** Formato del menú: lista interactiva o todo en un mensaje de texto. */
export type MenuStyle = 'lista' | 'texto';
/** Estilo (diseño) del menú. */
export type MenuTheme = 'denji' | 'chainsaw' | 'simple';
export type LogMode = 'detallado' | 'compacto' | 'apagado';
/** Cómo responde el comando de la hora: vista HTML en el chat, imagen, las dos cosas o archivo. */
export type ClockView = 'auto' | 'chat' | 'imagen' | 'archivo';

/** Momentos en los que el bot reacciona al mensaje de quien usa un comando. */
export type ReactionEvent = 'wait' | 'done' | 'error' | 'denied' | 'unknown';

export interface Reactions {
    enabled: boolean;
    /** Emoji de cada momento; vacío = sin reacción. */
    events: Record<ReactionEvent, string>;
    /** Emoji propio de un comando: sustituye al de "listo" cuando ese comando termina. */
    commands: Record<string, string>;
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
    clockView: ClockView;
    /**
     * Servidores de mensajes (MQTT sobre `wss://`) por los que los juegos HTML
     * guardan el progreso y se conectan entre sí. Lista vacía = sin conexión:
     * los juegos se guardan solo con el código de `.canjear`.
     */
    gameServers: string[];
    logMode: LogMode;
    autoRestart: boolean;
    activeSession: string;
}

export const MENU_STYLES: MenuStyle[] = ['lista', 'texto'];
export const MENU_THEMES: MenuTheme[] = ['denji', 'chainsaw', 'simple'];
export const MENU_THEME_NAMES: Record<MenuTheme, string> = {
    denji: 'Denji style',
    chainsaw: 'Chainsaw man style',
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

export const CLOCK_VIEWS: ClockView[] = ['auto', 'chat', 'imagen', 'archivo'];
export const CLOCK_VIEW_NAMES: Record<ClockView, string> = {
    auto: 'Reloj en vivo + imagen',
    chat: 'Solo reloj en vivo',
    imagen: 'Solo imagen',
    archivo: 'Archivo .html'
};
export const CLOCK_VIEW_HINTS: Record<ClockView, string> = {
    auto: 'Envía el reloj HTML dentro del chat y, debajo, una imagen del reloj. La imagen se ve en cualquier WhatsApp, así que siempre hay un reloj a la vista.',
    chat: 'Envía solo el reloj HTML dentro del chat y un texto con la hora. Elígelo si en tu WhatsApp el reloj en vivo se ve bien y la imagen te sobra.',
    imagen: 'Envía solo la imagen del reloj. Elígelo si en tu WhatsApp el reloj en vivo no aparece.',
    archivo: 'Envía el reloj como archivo .html, que se abre con el navegador del teléfono.'
};
export const LOG_MODES: LogMode[] = ['detallado', 'compacto', 'apagado'];

export const defaultSettings: Settings = {
    botName: 'Denji bot',
    devName: 'Ryuzei-Ts',
    prefix: '.',
    coin: '¥enes',
    owners: [],
    banner: DEFAULT_BANNER,
    menuStyle: 'lista',
    menuTheme: 'denji',
    menuBanners: { denji: '', chainsaw: '', simple: '' },
    reactions: {
        enabled: true,
        events: { wait: '🕘', done: '⭐️', error: '', denied: '', unknown: '' },
        commands: {}
    },
    clockView: 'auto',
    gameServers: [
        'wss://broker.emqx.io:8084/mqtt',
        'wss://broker.hivemq.com:8884/mqtt',
        'wss://test.mosquitto.org:8081/mqtt'
    ],
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
            // Un texto vacío es válido: significa "sin reacción".
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
        clockView: CLOCK_VIEWS.includes(src.clockView) ? src.clockView : d.clockView,
        gameServers: Array.isArray(src.gameServers)
            ? Array.from(new Set<string>(src.gameServers
                .filter((url: any) => typeof url === 'string' && /^wss?:\/\/[^\s"'<>]+$/i.test(url.trim()))
                .map((url: string) => url.trim()))).slice(0, 5)
            : [...d.gameServers],
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
    fs.watchFile(SETTINGS_FILE, { interval: 1500 }, () => {
        try {
            onChange(loadSettings());
        } catch {}
    });
}
