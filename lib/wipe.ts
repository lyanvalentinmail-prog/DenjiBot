import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, defaultSettings, resetSettings, loadSettings, isValidSessionName } from './settings.ts';
import { dirUsage } from './sessions.ts';

/**
 * Inspección y eliminación segura de los datos locales de Denji bot.
 *
 * Compartido entre el panel de terminal (`launcher.ts` / `lib/panel/bot.ts`) y
 * el comando de propietario (`commands/owner/resetbot.js`). Nunca toca el
 * código del bot, `assets/`, `core/`, `.git/` ni `node_modules/`.
 */

export interface WipeOptions {
    /** Base de datos SQLite y archivos guardados en `database/`. */
    database?: boolean;
    /** Sesiones principales de WhatsApp (`sessions/` y legado `Session/`). */
    sessions?: boolean;
    /** Sesiones de sub-bots (`Sessions/`). */
    subs?: boolean;
    /** Archivo de ajustes (`settings.json`). */
    settings?: boolean;
    /** Archivos temporales y registros (`tmp/`, `logs/`, `*.log`). */
    temp?: boolean;
    /** Si `settings` es true, conserva los dueños configurados en vez de borrar `settings.json`. */
    keepOwners?: boolean;
    /** Si `settings` es true, conserva el nombre de la sesión activa. */
    keepActiveSession?: boolean;
}

export const WIPE_PRESETS = {
    /** Restablecimiento total de fábrica: deja el bot como recién instalado. */
    all: {
        database: true,
        sessions: true,
        subs: true,
        settings: true,
        temp: true
    } satisfies WipeOptions,
    /** Borra base de datos, sub-bots, temporales y restablece ajustes conservando sesión y dueños. */
    keepSession: {
        database: true,
        sessions: false,
        subs: true,
        settings: true,
        temp: true,
        keepOwners: true,
        keepActiveSession: true
    } satisfies WipeOptions,
    /** Solo base de datos y caché temporal. */
    database: {
        database: true,
        temp: true
    } satisfies WipeOptions,
    /** Solo sesiones de sub-bots. */
    subs: {
        subs: true
    } satisfies WipeOptions,
    /** Solo archivo de ajustes (`settings.json`). */
    settings: {
        settings: true
    } satisfies WipeOptions,
    /** Solo archivos temporales y registros. */
    temp: {
        temp: true
    } satisfies WipeOptions
} as const;

export interface BotDataSummary {
    database: {
        exists: boolean;
        bytes: number;
        files: number;
        users: number;
        groups: number;
        chats: number;
        characters: number;
        packs: number;
    };
    sessions: {
        exists: boolean;
        bytes: number;
        files: number;
        count: number;
        names: string[];
    };
    subs: {
        exists: boolean;
        bytes: number;
        files: number;
        count: number;
        ids: string[];
    };
    settings: {
        exists: boolean;
        bytes: number;
    };
    temp: {
        exists: boolean;
        bytes: number;
        files: number;
    };
    totalBytes: number;
    hasAnyData: boolean;
}

export interface WipeResult {
    ok: boolean;
    removed: string[];
    failed: string[];
    freedBytes: number;
}

const PROTECTED_ROOT_NAMES = new Set([
    '.git',
    'node_modules',
    'assets',
    'core',
    'commands',
    'lib',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'index.ts',
    'handler.ts',
    'config.ts',
    'launcher.ts',
    'README.md',
    '.gitignore'
]);

function isSafeTarget(root: string, target: string): boolean {
    const absRoot = path.resolve(root);
    const absTarget = path.resolve(target);
    if (absTarget === absRoot) return false;
    if (!absTarget.startsWith(absRoot + path.sep)) return false;
    const rel = path.relative(absRoot, absTarget);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const top = rel.split(path.sep)[0]!;
    if (PROTECTED_ROOT_NAMES.has(top)) return false;
    return true;
}

function statSize(filePath: string): number {
    try {
        const st = fs.statSync(filePath);
        return st.isFile() ? st.size : 0;
    } catch {
        return 0;
    }
}

function listRootTempFiles(root: string): string[] {
    const out: string[] = [];
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            if (entry.name.endsWith('.log') || entry.name === '.tsbuildinfo') {
                out.push(path.join(root, entry.name));
            }
        }
    } catch {}
    return out;
}

function listSettingsTmpFiles(root: string): string[] {
    const out: string[] = [];
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isFile() && /^settings\.json\.\d+\.tmp$/.test(entry.name)) {
                out.push(path.join(root, entry.name));
            }
        }
    } catch {}
    return out;
}

export function formatDataBytes(bytes: number): string {
    const n = Number(bytes) || 0;
    if (n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const val = n / 1024 ** i;
    return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

/** Inspecciona todos los datos locales del bot sin crear ni modificar archivos. */
export function inspectBotData(root: string = ROOT): BotDataSummary {
    const absRoot = path.resolve(root);
    const dbDir = path.join(absRoot, 'database');
    const dbFile = path.join(dbDir, 'database.db');
    const sessionsDir = path.join(absRoot, 'sessions');
    const legacySessionDir = path.join(absRoot, 'Session');
    const subsRootDir = path.join(absRoot, 'Sessions');
    const subsDir = path.join(subsRootDir, 'Subs');
    const settingsFile = path.join(absRoot, 'settings.json');
    const tmpDir = path.join(absRoot, 'tmp');
    const logsDir = path.join(absRoot, 'logs');

    // 1. Base de datos
    const dbUsage = dirUsage(dbDir);
    let users = 0;
    let chats = 0;
    let groups = 0;
    let characters = 0;
    let packs = 0;

    if (fs.existsSync(dbFile)) {
        let ro: DatabaseSync | null = null;
        try {
            ro = new DatabaseSync(dbFile, { readOnly: true });
            const count = (sql: string): number => {
                try {
                    const row = ro!.prepare(sql).get() as any;
                    return Number(row?.n) || 0;
                } catch {
                    return 0;
                }
            };
            users = count('SELECT COUNT(*) AS n FROM users');
            chats = count('SELECT COUNT(*) AS n FROM chats');
            groups = count("SELECT COUNT(*) AS n FROM chats WHERE id LIKE '%@g.us'");
            characters = count('SELECT COUNT(*) AS n FROM characters');
            packs = count('SELECT COUNT(*) AS n FROM sticker_packs');
        } catch {
            // Si la BD está ocupada o dañada, seguimos mostrando su tamaño en disco.
        } finally {
            try { ro?.close(); } catch {}
        }
    }

    // 2. Sesiones principales
    const sessionNames: string[] = [];
    try {
        for (const entry of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
            if (entry.isDirectory() && isValidSessionName(entry.name)) {
                sessionNames.push(entry.name);
            }
        }
    } catch {}
    const sessUsage = dirUsage(sessionsDir);
    const legacyUsage = dirUsage(legacySessionDir);
    if (legacyUsage.files > 0) sessionNames.push('Session (legado)');
    const sessionsBytes = sessUsage.size + legacyUsage.size;
    const sessionsFiles = sessUsage.files + legacyUsage.files;

    // 3. Sub-bots
    const subIds: string[] = [];
    try {
        for (const entry of fs.readdirSync(subsDir, { withFileTypes: true })) {
            if (entry.isDirectory()) subIds.push(entry.name);
        }
    } catch {}
    const subsUsage = dirUsage(subsRootDir);

    // 4. Ajustes
    const settingsExists = fs.existsSync(settingsFile);
    const settingsBytes = statSize(settingsFile);

    // 5. Temporales, caché y logs
    const tmpUsage = dirUsage(tmpDir);
    const logsUsage = dirUsage(logsDir);
    const cacheUsage = dirUsage(path.join(absRoot, '.cache'));
    const rootLogs = listRootTempFiles(absRoot);
    let rootLogBytes = 0;
    for (const f of rootLogs) rootLogBytes += statSize(f);
    const tempBytes = tmpUsage.size + logsUsage.size + cacheUsage.size + rootLogBytes;
    const tempFiles = tmpUsage.files + logsUsage.files + cacheUsage.files + rootLogs.length;

    const totalBytes = dbUsage.size + sessionsBytes + subsUsage.size + settingsBytes + tempBytes;
    const hasAnyData =
        dbUsage.files > 0 ||
        sessionsFiles > 0 ||
        sessionNames.length > 0 ||
        subsUsage.files > 0 ||
        subIds.length > 0 ||
        settingsExists ||
        tempFiles > 0;

    return {
        database: {
            exists: dbUsage.files > 0,
            bytes: dbUsage.size,
            files: dbUsage.files,
            users,
            groups,
            chats,
            characters,
            packs
        },
        sessions: {
            exists: sessionsFiles > 0 || sessionNames.length > 0,
            bytes: sessionsBytes,
            files: sessionsFiles,
            count: sessionNames.length,
            names: sessionNames
        },
        subs: {
            exists: subsUsage.files > 0 || subIds.length > 0,
            bytes: subsUsage.size,
            files: subsUsage.files,
            count: subIds.length,
            ids: subIds
        },
        settings: {
            exists: settingsExists,
            bytes: settingsBytes
        },
        temp: {
            exists: tempFiles > 0,
            bytes: tempBytes,
            files: tempFiles
        },
        totalBytes,
        hasAnyData
    };
}

function removeTarget(root: string, target: string, label: string, removed: string[], failed: string[]): number {
    if (!isSafeTarget(root, target) || !fs.existsSync(target)) return 0;
    let bytes = 0;
    try {
        const st = fs.statSync(target);
        bytes = st.isDirectory() ? dirUsage(target).size : st.size;
    } catch {}
    try {
        fs.rmSync(target, { recursive: true, force: true });
        if (fs.existsSync(target)) {
            failed.push(label);
            return 0;
        }
        if (label && !removed.includes(label)) removed.push(label);
        return bytes;
    } catch {
        failed.push(label);
        return 0;
    }
}

/**
 * Elimina del disco los datos locales seleccionados.
 * Para borrar `database/` asegúrate de haber detenido el bot o llamado a `closeDB()`.
 */
export function wipeBotData(options: WipeOptions, root: string = ROOT): WipeResult {
    const absRoot = path.resolve(root);
    const removed: string[] = [];
    const failed: string[] = [];
    let freedBytes = 0;

    if (options.database) {
        freedBytes += removeTarget(absRoot, path.join(absRoot, 'database'), 'Base de datos', removed, failed);
    }

    if (options.sessions) {
        freedBytes += removeTarget(absRoot, path.join(absRoot, 'sessions'), 'Sesiones', removed, failed);
        freedBytes += removeTarget(absRoot, path.join(absRoot, 'Session'), 'Sesiones', removed, failed);
    }

    if (options.subs) {
        freedBytes += removeTarget(absRoot, path.join(absRoot, 'Sessions'), 'Sub-Bots', removed, failed);
    }

    if (options.settings) {
        const settingsFile = path.join(absRoot, 'settings.json');
        for (const tmp of listSettingsTmpFiles(absRoot)) {
            freedBytes += removeTarget(absRoot, tmp, '', removed, failed);
        }
        if ((options.keepOwners || options.keepActiveSession) && absRoot === path.resolve(ROOT)) {
            try {
                const current = loadSettings();
                const keep: Record<string, any> = {};
                if (options.keepOwners) keep.owners = current.owners;
                if (options.keepActiveSession) keep.activeSession = current.activeSession;
                resetSettings(keep);
                removed.push('Ajustes (restablecidos)');
            } catch {
                failed.push('Ajustes');
            }
        } else if ((options.keepOwners || options.keepActiveSession) && fs.existsSync(settingsFile)) {
            try {
                const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
                const next = {
                    ...structuredClone(defaultSettings),
                    ...(options.keepOwners && Array.isArray(raw?.owners) ? { owners: raw.owners } : {}),
                    ...(options.keepActiveSession && typeof raw?.activeSession === 'string'
                        ? { activeSession: raw.activeSession }
                        : {})
                };
                fs.writeFileSync(settingsFile, JSON.stringify(next, null, 2) + '\n');
                removed.push('Ajustes (restablecidos)');
            } catch {
                failed.push('Ajustes');
            }
        } else {
            freedBytes += removeTarget(absRoot, settingsFile, 'Ajustes (settings.json)', removed, failed);
        }
    }

    if (options.temp) {
        let tmpRemoved = false;
        for (const dirName of ['tmp', 'logs', '.cache']) {
            const p = path.join(absRoot, dirName);
            if (fs.existsSync(p)) {
                const before = failed.length;
                freedBytes += removeTarget(absRoot, p, '', removed, failed);
                if (failed.length === before) tmpRemoved = true;
            }
        }
        for (const logFile of listRootTempFiles(absRoot)) {
            const before = failed.length;
            freedBytes += removeTarget(absRoot, logFile, '', removed, failed);
            if (failed.length === before) tmpRemoved = true;
        }
        if (tmpRemoved) removed.push('Caché y registros');
    }

    return {
        ok: failed.length === 0,
        removed: removed.filter(Boolean),
        failed: Array.from(new Set(failed.filter(Boolean))),
        freedBytes
    };
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
    return new Promise(resolve => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
        promise.then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); resolve(); });
    });
}

/** Cierra de forma segura todos los sub-bots activos en memoria (`globalThis.conns`). */
export async function disconnectSubBots(opts: { logout?: boolean } = {}): Promise<number> {
    const g = globalThis as any;
    const list: any[] = Array.isArray(g.conns) ? [...g.conns] : [];
    g.conns = [];
    if (!list.length) return 0;

    await Promise.allSettled(
        list.map(async sub => {
            try { sub?.ev?.removeAllListeners?.(); } catch {}
            try { sub?.msgRetryCounterCache?.close?.(); } catch {}
            if (opts.logout && typeof sub?.logout === 'function') {
                await withTimeout(Promise.resolve().then(() => sub.logout()), 2000);
            }
            try { sub?.ws?.close?.(); } catch {}
            try { sub?.end?.(undefined); } catch {}
        })
    );
    return list.length;
}

/** Cierra y opcionalmente desvincula el socket principal de WhatsApp sin disparar reconexiones. */
export async function disconnectMainSocket(sock: any, opts: { logout?: boolean } = {}): Promise<void> {
    if (!sock) return;
    try { sock?.ev?.removeAllListeners?.(); } catch {}
    if (opts.logout && typeof sock?.logout === 'function') {
        await withTimeout(Promise.resolve().then(() => sock.logout()), 2500);
    }
    try { sock?.ws?.close?.(); } catch {}
    try { sock?.end?.(undefined); } catch {}
}
