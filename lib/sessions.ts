import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SESSIONS_DIR, isValidSessionName, loadSettings } from './settings.ts';

/**
 * Gestión de sesiones de WhatsApp. Cada sesión vive en `sessions/<nombre>/`
 * y el bot usa la que esté marcada como activa en los ajustes.
 */

export interface SessionInfo {
    name: string;
    dir: string;
    active: boolean;
    exists: boolean;
    registered: boolean;
    number: string;
    pushName: string;
    files: number;
    size: number;
    modified: number;
}

export interface DirUsage {
    size: number;
    files: number;
    modified: number;
}

/** Tamaño total, número de archivos y última modificación de una carpeta. */
export function dirUsage(dir: string, skip: Set<string> = new Set()): DirUsage {
    const usage: DirUsage = { size: 0, files: 0, modified: 0 };
    const stack = [dir];

    while (stack.length) {
        const current = stack.pop()!;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (skip.has(entry.name)) continue;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            try {
                const st = fs.statSync(full);
                usage.size += st.size;
                usage.files++;
                if (st.mtimeMs > usage.modified) usage.modified = st.mtimeMs;
            } catch {}
        }
    }
    return usage;
}

export const sessionDir = (name: string): string => path.join(SESSIONS_DIR, name);

/**
 * Las versiones anteriores guardaban una única sesión en `Session/`.
 * Si existe, se mueve a `sessions/principal` para no perder la vinculación.
 */
export function migrateLegacySession(): boolean {
    const legacy = path.join(ROOT, 'Session');
    const target = sessionDir('principal');
    try {
        if (!fs.existsSync(path.join(legacy, 'creds.json')) || fs.existsSync(target)) return false;
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        fs.renameSync(legacy, target);
        return true;
    } catch {
        return false;
    }
}

export function readSession(name: string, activeName?: string): SessionInfo {
    const dir = sessionDir(name);
    const info: SessionInfo = {
        name,
        dir,
        active: name === (activeName ?? loadSettings().activeSession),
        exists: fs.existsSync(dir),
        registered: false,
        number: '',
        pushName: '',
        files: 0,
        size: 0,
        modified: 0
    };
    if (!info.exists) return info;

    try {
        const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
        // Vinculada por código (`registered`) o por QR (`account`).
        info.registered = Boolean(creds?.registered || creds?.account);
        info.number = String(creds?.me?.id || '').split('@')[0]!.split(':')[0]!;
        info.pushName = String(creds?.me?.name || '');
    } catch {}

    Object.assign(info, dirUsage(dir));
    return info;
}

/** Todas las sesiones guardadas; la activa aparece siempre (aunque aún no exista). */
export function listSessions(): SessionInfo[] {
    const active = loadSettings().activeSession;
    const names = new Set<string>([active]);

    try {
        for (const entry of fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })) {
            if (entry.isDirectory() && isValidSessionName(entry.name)) names.add(entry.name);
        }
    } catch {}

    return Array.from(names)
        .sort((a, b) => (a === active ? -1 : b === active ? 1 : a.localeCompare(b)))
        .map(name => readSession(name, active));
}

export function deleteSession(name: string): boolean {
    if (!isValidSessionName(name)) return false;
    const dir = sessionDir(name);
    // Seguridad: nunca borrar nada fuera de la carpeta de sesiones.
    if (path.dirname(dir) !== SESSIONS_DIR) return false;
    try {
        fs.rmSync(dir, { recursive: true, force: true });
        return !fs.existsSync(dir);
    } catch {
        return false;
    }
}
