import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, DATABASE_DIR, SESSIONS_DIR } from './settings.ts';
import { dirUsage } from './sessions.ts';

/**
 * Estadísticas para el dashboard del panel. Lee la base de datos SQLite en
 * modo solo lectura, así que funciona con el bot encendido o apagado.
 */

export interface TopUser {
    id: string;
    name: string;
    bytes: number;
    commands: number;
    chats: number;
}

export interface Stats {
    takenAt: number;
    dbAvailable: boolean;
    users: number;
    chats: number;
    groups: number;
    privateChats: number;
    memberships: number;
    active24h: number;
    active7d: number;
    totalCommands: number;
    totalMessages: number;
    totalCoins: number;
    storage: {
        database: number;
        userData: number;
        perUser: number;
        sessions: number;
        project: number;
        diskFree: number;
        diskTotal: number;
    };
    topUsers: TopUser[];
    system: {
        memTotal: number;
        memUsed: number;
        load: number;
        cpus: number;
        node: string;
        platform: string;
    };
}

const fileSize = (file: string): number => {
    try {
        return fs.statSync(file).size;
    } catch {
        return 0;
    }
};

const rowBytes = (row: Record<string, unknown>): number => {
    let total = 0;
    for (const value of Object.values(row)) {
        if (value === null || value === undefined) continue;
        total += typeof value === 'string' ? Buffer.byteLength(value) : 8;
    }
    return total;
};

function emptyStats(): Stats {
    return {
        takenAt: Date.now(),
        dbAvailable: false,
        users: 0,
        chats: 0,
        groups: 0,
        privateChats: 0,
        memberships: 0,
        active24h: 0,
        active7d: 0,
        totalCommands: 0,
        totalMessages: 0,
        totalCoins: 0,
        storage: { database: 0, userData: 0, perUser: 0, sessions: 0, project: 0, diskFree: 0, diskTotal: 0 },
        topUsers: [],
        system: {
            memTotal: os.totalmem(),
            memUsed: os.totalmem() - os.freemem(),
            load: os.loadavg()[0] || 0,
            cpus: os.cpus().length,
            node: process.version,
            platform: `${os.platform()} ${os.arch()}`
        }
    };
}

async function readDatabase(stats: Stats, dbPath: string): Promise<void> {
    if (!fs.existsSync(dbPath)) return;

    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });

    try {
        const count = (sql: string, ...params: any[]): number => {
            try {
                const row = db.prepare(sql).get(...params) as any;
                return Number(row?.n) || 0;
            } catch {
                return 0;
            }
        };

        const now = Date.now();
        stats.users = count('SELECT COUNT(*) AS n FROM users');
        stats.chats = count('SELECT COUNT(*) AS n FROM chats');
        stats.groups = count("SELECT COUNT(*) AS n FROM chats WHERE id LIKE '%@g.us'");
        stats.privateChats = stats.chats - stats.groups;
        stats.memberships = count('SELECT COUNT(*) AS n FROM chat_users');
        stats.active24h = count('SELECT COUNT(DISTINCT user_id) AS n FROM chat_users WHERE lastSeen >= ?', now - 86_400_000);
        stats.active7d = count('SELECT COUNT(DISTINCT user_id) AS n FROM chat_users WHERE lastSeen >= ?', now - 7 * 86_400_000);
        stats.totalCommands = count('SELECT COALESCE(SUM(usedcommands), 0) AS n FROM users');
        stats.totalMessages = count('SELECT COALESCE(SUM(messageCount), 0) AS n FROM chat_users');
        stats.totalCoins = count('SELECT COALESCE(SUM(coins), 0) + COALESCE(SUM(bank), 0) AS n FROM chat_users');

        // Espacio aproximado que ocupa cada usuario: su fila global + sus filas por chat.
        const perUser = new Map<string, TopUser>();
        const entry = (id: string): TopUser => {
            let user = perUser.get(id);
            if (!user) {
                user = { id, name: '', bytes: 0, commands: 0, chats: 0 };
                perUser.set(id, user);
            }
            return user;
        };

        try {
            for (const row of db.prepare('SELECT * FROM users').all() as any[]) {
                const user = entry(String(row.id));
                user.name = String(row.name || '');
                user.commands = Number(row.usedcommands) || 0;
                user.bytes += rowBytes(row);
            }
        } catch {}

        try {
            for (const row of db.prepare('SELECT * FROM chat_users').all() as any[]) {
                const user = entry(String(row.user_id));
                user.chats++;
                user.bytes += rowBytes(row);
            }
        } catch {}

        let userData = 0;
        for (const user of perUser.values()) userData += user.bytes;

        stats.storage.userData = userData;
        stats.storage.perUser = perUser.size ? Math.round(userData / perUser.size) : 0;
        stats.topUsers = Array.from(perUser.values())
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 5);
        stats.dbAvailable = true;
    } finally {
        try {
            db.close();
        } catch {}
    }
}

export async function collectStats(root: string = ROOT): Promise<Stats> {
    const stats = emptyStats();
    const dbDir = root === ROOT ? DATABASE_DIR : path.join(root, 'database');
    const dbPath = path.join(dbDir, 'database.db');

    try {
        await readDatabase(stats, dbPath);
    } catch {}

    stats.storage.database = fileSize(dbPath) + fileSize(`${dbPath}-wal`) + fileSize(`${dbPath}-shm`);
    const mainSessDir = root === ROOT ? SESSIONS_DIR : path.join(root, 'sessions');
    stats.storage.sessions =
        dirUsage(mainSessDir).size +
        dirUsage(path.join(root, 'Sessions')).size +
        dirUsage(path.join(root, 'Session')).size;
    stats.storage.project = dirUsage(root, new Set(['node_modules', '.git'])).size;

    try {
        const fsStats = fs.statfsSync(root);
        stats.storage.diskFree = Number(fsStats.bavail) * Number(fsStats.bsize);
        stats.storage.diskTotal = Number(fsStats.blocks) * Number(fsStats.bsize);
    } catch {}

    return stats;
}

export interface KnownChatItem {
    jid: string;
    name: string;
    isGroup: boolean;
    lastSeen: number;
}

/**
 * Devuelve los grupos y chats privados registrados en `database.db` (solo lectura)
 * para elegirlos cómodamente desde el panel de `npm start`.
 */
export async function listKnownChats(root: string = ROOT): Promise<KnownChatItem[]> {
    const dbDir = root === ROOT ? DATABASE_DIR : path.join(root, 'database');
    const dbPath = path.join(dbDir, 'database.db');
    if (!fs.existsSync(dbPath)) return [];

    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });

    try {
        const items = new Map<string, KnownChatItem>();
        const chatCols = new Set(
            (db.prepare('PRAGMA table_info(chats)').all() as any[]).map(c => String(c.name))
        );
        const hasChatName = chatCols.has('name');

        try {
            const chatRows = db.prepare(
                hasChatName ? 'SELECT id, name FROM chats' : 'SELECT id FROM chats'
            ).all() as any[];
            for (const r of chatRows) {
                const jid = String(r.id || '').trim();
                if (!jid.endsWith('@g.us') && !jid.endsWith('@s.whatsapp.net')) continue;
                items.set(jid, {
                    jid,
                    name: hasChatName ? String(r.name || '').trim() : '',
                    isGroup: jid.endsWith('@g.us'),
                    lastSeen: 0
                });
            }
        } catch {}

        try {
            const activityRows = db.prepare(
                'SELECT chat_id, MAX(lastSeen) AS lastSeen FROM chat_users GROUP BY chat_id'
            ).all() as any[];
            for (const r of activityRows) {
                const jid = String(r.chat_id || '').trim();
                if (!jid.endsWith('@g.us') && !jid.endsWith('@s.whatsapp.net')) continue;
                const existing = items.get(jid) || {
                    jid,
                    name: '',
                    isGroup: jid.endsWith('@g.us'),
                    lastSeen: 0
                };
                existing.lastSeen = Math.max(existing.lastSeen, Number(r.lastSeen) || 0);
                items.set(jid, existing);
            }
        } catch {}

        try {
            const userRows = db.prepare('SELECT id, name FROM users').all() as any[];
            for (const r of userRows) {
                const jid = String(r.id || '').trim();
                if (!jid.endsWith('@s.whatsapp.net')) continue;
                const uName = String(r.name || '').trim();
                const existing = items.get(jid);
                if (existing && !existing.name && uName) {
                    existing.name = uName;
                } else if (!existing && uName) {
                    items.set(jid, { jid, name: uName, isGroup: false, lastSeen: 0 });
                }
            }
        } catch {}

        return Array.from(items.values())
            .sort((a, b) => {
                if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
                if (b.lastSeen !== a.lastSeen) return b.lastSeen - a.lastSeen;
                return (a.name || a.jid).localeCompare(b.name || b.jid);
            })
            .slice(0, 60);
    } catch {
        return [];
    } finally {
        try { db.close(); } catch {}
    }
}

