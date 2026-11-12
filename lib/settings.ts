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

export type MenuStyle = 'lista' | 'texto';
export type LogMode = 'detallado' | 'compacto' | 'apagado';

export interface Settings {
    botName: string;
    devName: string;
    prefix: string;
    coin: string;
    owners: string[];
    banner: string;
    menuStyle: MenuStyle;
    logMode: LogMode;
    autoRestart: boolean;
    activeSession: string;
}

export const MENU_STYLES: MenuStyle[] = ['lista', 'texto'];
export const LOG_MODES: LogMode[] = ['detallado', 'compacto', 'apagado'];

export const defaultSettings: Settings = {
    botName: 'Denji bot',
    devName: 'Ryuzei-Ts',
    prefix: '.',
    coin: '¥enes',
    owners: [],
    banner: DEFAULT_BANNER,
    menuStyle: 'lista',
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

/** Observa `settings.json` y avisa cuando cambia (lo usa el proceso del bot). */
export function watchSettings(onChange: (settings: Settings) => void): void {
    fs.watchFile(SETTINGS_FILE, { interval: 1500 }, () => {
        try {
            onChange(loadSettings());
        } catch {}
    });
}
