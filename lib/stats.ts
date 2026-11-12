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
    stats.storage.sessions = dirUsage(root === ROOT ? SESSIONS_DIR : path.join(root, 'sessions')).size;
    stats.storage.project = dirUsage(root, new Set(['node_modules', '.git'])).size;

    try {
        const fsStats = fs.statfsSync(root);
        stats.storage.diskFree = Number(fsStats.bavail) * Number(fsStats.bsize);
        stats.storage.diskTotal = Number(fsStats.blocks) * Number(fsStats.bsize);
    } catch {}

    return stats;
}
