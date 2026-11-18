import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import config, { onSettingsChange } from '#config';
import { DATABASE_DIR, saveSettings, loadSettings } from './settings.ts';

if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

const dbPath = path.join(DATABASE_DIR, 'database.db');
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA cache_size = -32000');
db.exec('PRAGMA busy_timeout = 5000');

const stmts = new Map<string, any>();
const MAX_STATEMENTS = 256;
const columnsCache = new Map<string, Set<string>>();

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertIdent(name: string): string {
    if (!VALID_IDENT.test(name)) throw new Error(`Columna no permitida: ${name}`);
    return name;
}

function stmt(sql: string): any {
    let prepared = stmts.get(sql);
    if (!prepared) {
        prepared = db.prepare(sql);
        if (stmts.size >= MAX_STATEMENTS) {
            const first = stmts.keys().next().value;
            if (first) stmts.delete(first);
        }
        stmts.set(sql, prepared);
    }
    return prepared;
}

function toStore(val: any): any {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object') return JSON.stringify(val);
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val;
}

function parseJSON(val: any, fallback: any): any {
    if (val == null) return fallback;
    if (typeof val !== 'string') return val;
    try {
        return JSON.parse(val);
    } catch {
        return fallback;
    }
}

function columnExists(table: string, column: string): boolean {
    assertIdent(table);
    assertIdent(column);
    if (columnsCache.get(table)?.has(column)) return true;
    const cols = new Set<string>(
        (stmt(`PRAGMA table_info(${table})`).all() as any[]).map(info => String(info.name))
    );
    columnsCache.set(table, cols);
    return cols.has(column);
}

function defaultPrefixes(primary = config.prefix || '.'): string[] {
    const base = [primary, '/', '!', '.', '#'];
    return Array.from(new Set(base.filter(Boolean)));
}

function buildDefaultSets(): Record<string, any> {
    const botName = config.botName || 'Denji bot';
    const shortName = botName.trim().split(/\s+/)[0] || 'Denji';
    const firstOwner = Array.from(config.owner)[0] || '';
    return {
        self: 0,
        prefix: JSON.stringify(defaultPrefixes(config.prefix || '.')),
        commandsejecut: 0,
        newsletter_id: '',
        nameid: botName,
        type: 'Owner',
        link: (globalThis as any).links?.github || 'https://github.com/lyanvalentinmail-prog/DenjiBot',
        banner: config.banner || '',
        icon: config.icon || config.banner || '',
        currency: config.coin || 'Yenes',
        namebot: shortName,
        botname: botName,
        owner: firstOwner ? `${firstOwner}@s.whatsapp.net` : ''
    };
}

export const defUser: Record<string, any> = {
    name: '',
    exp: 0,
    level: 0,
    usedcommands: 0,
    pasatiempo: '',
    description: '',
    marry: '',
    genre: '',
    birth: '',
    metadatos: null,
    metadatos2: null
};

export const defChat: Record<string, any> = {
    isBanned: 0,
    welcome: 0,
    goodbye: 0,
    sWelcome: '',
    sGoodbye: '',
    alerts: 1,
    gacha: 1,
    economy: 1,
    adminonly: 0,
    primaryBot: null,
    antilinks: 1,
    antistatus: 0,
    rolls: '{}'
};

export const defChatUser: Record<string, any> = {
    messageCount: 0,
    lastSeen: 0,
    coins: 0,
    bank: 0,
    lastCmd: 0,
    usedTime: null,
    afk: -1,
    afkReason: '',
    health: 100,
    stamina: 100,
    magic: 100,
    characters: '[]',
    stats: '{}'
};

export const defStickerPack: Record<string, any> = {
    packs: '[]'
};

function ensureColumns(table: string, defs: Record<string, any>): void {
    const existing = new Set<string>(
        (stmt(`PRAGMA table_info(${table})`).all() as any[]).map(c => String(c.name))
    );
    for (const [col, defVal] of Object.entries(defs)) {
        if (existing.has(col)) continue;
        const sqlType = typeof defVal === 'number' ? 'INTEGER' : typeof defVal === 'boolean' ? 'BOOLEAN' : 'TEXT';
        const defaultSql = defVal === null
            ? 'NULL'
            : typeof defVal === 'number'
                ? String(defVal)
                : typeof defVal === 'boolean'
                    ? (defVal ? '1' : '0')
                    : `'${String(defVal).replace(/'/g, "''")}'`;
        db.exec(`ALTER TABLE ${table} ADD COLUMN "${col}" ${sqlType} DEFAULT ${defaultSql}`);
    }
}

let initialized = false;

export function initDB(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT DEFAULT '',
            exp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0,
            usedcommands INTEGER DEFAULT 0,
            pasatiempo TEXT DEFAULT '',
            description TEXT DEFAULT '',
            marry TEXT DEFAULT '',
            genre TEXT DEFAULT '',
            birth TEXT DEFAULT '',
            metadatos TEXT,
            metadatos2 TEXT
        );

        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            isBanned BOOLEAN DEFAULT 0,
            welcome BOOLEAN DEFAULT 0,
            goodbye BOOLEAN DEFAULT 0,
            sWelcome TEXT DEFAULT '',
            sGoodbye TEXT DEFAULT '',
            alerts BOOLEAN DEFAULT 1,
            gacha BOOLEAN DEFAULT 1,
            economy BOOLEAN DEFAULT 1,
            adminonly BOOLEAN DEFAULT 0,
            primaryBot TEXT,
            antilinks BOOLEAN DEFAULT 1,
            antistatus BOOLEAN DEFAULT 0,
            rolls TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS chat_users (
            chat_id TEXT,
            user_id TEXT,
            messageCount INTEGER DEFAULT 0,
            lastSeen INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 0,
            bank INTEGER DEFAULT 0,
            lastCmd INTEGER DEFAULT 0,
            usedTime TEXT,
            afk INTEGER DEFAULT -1,
            afkReason TEXT DEFAULT '',
            health INTEGER DEFAULT 100,
            stamina INTEGER DEFAULT 100,
            magic INTEGER DEFAULT 100,
            characters TEXT DEFAULT '[]',
            stats TEXT DEFAULT '{}',
            PRIMARY KEY (chat_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY,
            self BOOLEAN DEFAULT 0,
            prefix TEXT DEFAULT '[".","/","!","#"]',
            commandsejecut INTEGER DEFAULT 0,
            newsletter_id TEXT DEFAULT '',
            nameid TEXT DEFAULT 'Denji bot',
            type TEXT DEFAULT 'Owner',
            link TEXT DEFAULT 'https://github.com/lyanvalentinmail-prog/DenjiBot',
            banner TEXT DEFAULT '',
            icon TEXT DEFAULT '',
            currency TEXT DEFAULT 'Yenes',
            namebot TEXT DEFAULT 'Denji',
            botname TEXT DEFAULT 'Denji bot',
            owner TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS sticker_packs (
            id TEXT PRIMARY KEY,
            packs TEXT DEFAULT '[]'
        );
    `);

    columnsCache.clear();
    stmts.clear();

    try {
        ensureColumns('users', defUser);
        ensureColumns('chats', defChat);
        ensureColumns('chat_users', defChatUser);
        ensureColumns('settings', buildDefaultSets());
        ensureColumns('sticker_packs', defStickerPack);

        // Migración suave desde versiones anteriores de Denji bot
        if (columnExists('users', 'sPack')) {
            db.exec(`UPDATE users SET metadatos = sPack WHERE (metadatos IS NULL OR metadatos = '') AND sPack != ''`);
        }
        if (columnExists('users', 'sAuthor')) {
            db.exec(`UPDATE users SET metadatos2 = sAuthor WHERE (metadatos2 IS NULL OR metadatos2 = '') AND sAuthor != ''`);
        }
        if (columnExists('chats', 'bye')) {
            db.exec(`UPDATE chats SET goodbye = bye WHERE goodbye = 0 AND bye = 1`);
        }
    } catch (e) {
        console.error('[DB migration error]', e);
    }

    columnsCache.clear();
    stmts.clear();
    initialized = true;
}

initDB();

export const loadDB = initDB;

function getMainBotJid(): string {
    const raw = (globalThis as any).sock?.user?.id || (globalThis as any).mainConn?.user?.id || '';
    const num = String(raw).split('@')[0].split(':')[0];
    return num ? `${num}@s.whatsapp.net` : '';
}

let lastSyncedPrefix = loadSettings().prefix;

// Mantiene sincronizados los cambios del panel (settings.json) con la fila del bot principal.
onSettingsChange(s => {
    const mainId = getMainBotJid();
    if (!mainId || !initialized) return;
    try {
        const current = getSettings(mainId);
        const shortName = s.botName.trim().split(/\s+/)[0] || 'Denji';
        const patch: Record<string, any> = {
            botname: s.botName,
            namebot: shortName,
            currency: s.coin,
            banner: config.banner,
            icon: config.icon
        };
        if (s.owners.length && !current.owner) {
            patch.owner = `${s.owners[0]}@s.whatsapp.net`;
        }
        if (s.prefix !== lastSyncedPrefix) {
            lastSyncedPrefix = s.prefix;
            const existing = Array.isArray(current.prefix) ? current.prefix : [];
            patch.prefix = [s.prefix, ...existing.filter((p: string) => p !== s.prefix)].slice(0, 6);
        }
        updateSettings(mainId, patch);
    } catch {}
});

function syncMainSettingsToFile(id: string, field: string, val: any): void {
    const mainId = getMainBotJid();
    if (!mainId || id !== mainId) return;
    try {
        if (field === 'botname' && typeof val === 'string' && val.trim()) {
            saveSettings({ botName: val.trim() });
        } else if (field === 'currency' && typeof val === 'string' && val.trim()) {
            saveSettings({ coin: val.trim() });
        } else if (field === 'banner' && typeof val === 'string' && val.trim()) {
            saveSettings({ banner: val.trim() });
        } else if (field === 'prefix' && Array.isArray(val) && val[0]) {
            lastSyncedPrefix = String(val[0]);
            saveSettings({ prefix: String(val[0]) });
        } else if (field === 'owner' && typeof val === 'string') {
            const num = val.split('@')[0].replace(/\D/g, '');
            if (num.length >= 7) {
                const cur = loadSettings();
                if (!cur.owners.includes(num)) saveSettings({ owners: [num, ...cur.owners] });
            }
        }
    } catch {}
}

function updateFields(table: string, where: string, ids: any[], patch: Record<string, any>): any {
    assertIdent(table);
    const fields = Object.keys(patch).sort();
    if (!fields.length) return undefined;
    for (const field of fields) assertIdent(field);
    const values = fields.map(field => {
        const value = patch[field];
        if (table !== 'settings') return toStore(value);
        if (value === true) return '1';
        if (typeof value === 'object' && value !== null) return JSON.stringify(value);
        return value;
    });
    const result = stmt(
        `UPDATE ${table} SET ${fields.map(field => `"${field}" = ?`).join(', ')} WHERE ${where}`
    ).run(...values, ...ids);
    return result.changes ? result : undefined;
}

export function updateUser(id: string, patch: Record<string, any>): any {
    return updateFields('users', 'id = ?', [id], patch);
}

export function updateChatUser(chatId: string, userId: string, patch: Record<string, any>): any {
    return updateFields('chat_users', 'chat_id = ? AND user_id = ?', [chatId, userId], patch);
}

export function updateSettings(id: string, patch: Record<string, any>): any {
    return updateFields('settings', 'id = ?', [id], patch);
}

export function recordMessage(chatId: string, userId: string, day: string, name?: string): void {
    const now = Date.now();
    const user = getUser(userId);
    if (name && user.name !== name) {
        setUser(userId, 'name', name);
    }
    const cu = getChatUser(chatId, userId);
    const stats = cu.stats && typeof cu.stats === 'object' ? cu.stats : {};
    stats[day] ??= { msgs: 0, cmds: 0 };
    stats[day].msgs = (stats[day].msgs || 0) + 1;
    updateChatUser(chatId, userId, {
        messageCount: (cu.messageCount || 0) + 1,
        lastSeen: now,
        stats
    });
}

export function recordCommand(
    chatId: string,
    userId: string,
    botId: string,
    { name, exp, now, day }: { name?: string; exp: number; now: number; day: string }
): void {
    db.exec('BEGIN IMMEDIATE');
    try {
        getUser(userId);
        getSettings(botId);
        const current = getChatUser(chatId, userId);
        const stats = current.stats && typeof current.stats === 'object' ? current.stats : {};
        stats[day] ??= { msgs: 0, cmds: 0 };
        stats[day].cmds = (stats[day].cmds || 0) + 1;
        if (name) {
            stmt(
                'UPDATE users SET usedcommands = COALESCE(usedcommands, 0) + 1, exp = COALESCE(exp, 0) + ?, name = ? WHERE id = ?'
            ).run(exp, toStore(name), userId);
        } else {
            stmt(
                'UPDATE users SET usedcommands = COALESCE(usedcommands, 0) + 1, exp = COALESCE(exp, 0) + ? WHERE id = ?'
            ).run(exp, userId);
        }
        updateChatUser(chatId, userId, {
            usedTime: new Date(now).toISOString(),
            lastCmd: now,
            lastSeen: now,
            stats
        });
        stmt('UPDATE settings SET commandsejecut = COALESCE(commandsejecut, 0) + 1 WHERE id = ?').run(botId);
        db.exec('COMMIT');
    } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
    }
}

export function getUser(id?: string, opt: { orderBy?: string; limit?: number | null; desc?: boolean } = {}): any {
    if (!id) {
        const { orderBy, limit = null, desc = true } = opt;
        if (orderBy) {
            const allowedCols = ['exp', 'level', 'usedcommands', 'name'];
            if (!allowedCols.includes(orderBy)) throw new Error('Columna no permitida');
            let q = `SELECT * FROM users ORDER BY "${orderBy}" ${desc ? 'DESC' : 'ASC'}`;
            if (limit) q += ` LIMIT ${Number(limit)}`;
            return stmt(q).all();
        }
        return stmt('SELECT * FROM users').all();
    }
    let user = stmt('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
        stmt(
            'INSERT OR IGNORE INTO users (id, name, exp, level, usedcommands, pasatiempo, description, marry, genre, birth, metadatos, metadatos2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            id,
            defUser.name,
            defUser.exp,
            defUser.level,
            defUser.usedcommands,
            defUser.pasatiempo,
            defUser.description,
            defUser.marry,
            defUser.genre,
            defUser.birth,
            defUser.metadatos,
            defUser.metadatos2
        );
        user = stmt('SELECT * FROM users WHERE id = ?').get(id);
    }
    if (user?.metadatos) {
        try { user.metadatos = JSON.parse(user.metadatos); } catch {}
    }
    if (user?.metadatos2) {
        try { user.metadatos2 = JSON.parse(user.metadatos2); } catch {}
    }
    return user;
}

export function setUser(id: string, field: string, val: any): any {
    assertIdent(field);
    getUser(id);
    const result = stmt(`UPDATE users SET "${field}" = ? WHERE id = ?`).run(toStore(val), id);
    return result.changes ? result : undefined;
}

export function getChat(id?: string): any {
    if (!id) {
        return (stmt('SELECT * FROM chats').all() as any[]).map(c => ({
            ...c,
            rolls: parseJSON(c.rolls, {})
        }));
    }
    let chat = stmt('SELECT * FROM chats WHERE id = ?').get(id);
    if (!chat) {
        stmt(
            'INSERT OR IGNORE INTO chats (id, isBanned, welcome, goodbye, sWelcome, sGoodbye, alerts, gacha, economy, adminonly, primaryBot, antilinks, antistatus, rolls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            id,
            defChat.isBanned,
            defChat.welcome,
            defChat.goodbye,
            defChat.sWelcome,
            defChat.sGoodbye,
            defChat.alerts,
            defChat.gacha,
            defChat.economy,
            defChat.adminonly,
            defChat.primaryBot,
            defChat.antilinks,
            defChat.antistatus,
            defChat.rolls
        );
        chat = stmt('SELECT * FROM chats WHERE id = ?').get(id);
    }
    chat.rolls = parseJSON(chat.rolls, {});
    return chat;
}

export function setChat(id: string, field: string, val: any): any {
    assertIdent(field);
    getChat(id);
    const result = stmt(`UPDATE chats SET "${field}" = ? WHERE id = ?`).run(toStore(val), id);
    return result.changes ? result : undefined;
}

export function getChatUser(
    chatId?: string,
    userId?: string,
    opt: { orderBy?: string; limit?: number | null; desc?: boolean } = {}
): any {
    if (!chatId) {
        return (stmt('SELECT * FROM chat_users').all() as any[]).map(u => ({
            ...u,
            characters: parseJSON(u.characters, []),
            stats: parseJSON(u.stats, {})
        }));
    }
    if (chatId && !userId) {
        const { orderBy, limit = null, desc = true } = opt;
        let query = 'SELECT * FROM chat_users WHERE chat_id = ?';
        const params: any[] = [chatId];
        if (orderBy) {
            const allowedCols = ['coins', 'bank', 'lastCmd', 'usedTime', 'afk', 'health', 'stamina', 'magic', 'messageCount', 'lastSeen'];
            if (!allowedCols.includes(orderBy)) throw new Error('Columna no permitida');
            query += ` ORDER BY "${orderBy}" ${desc ? 'DESC' : 'ASC'}`;
        }
        if (limit) {
            query += ' LIMIT ?';
            params.push(limit);
        }
        return (stmt(query).all(...params) as any[]).map(u => ({
            ...u,
            characters: parseJSON(u.characters, []),
            stats: parseJSON(u.stats, {})
        }));
    }
    let cu = stmt('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
    if (!cu) {
        stmt(
            'INSERT OR IGNORE INTO chat_users (chat_id, user_id, messageCount, lastSeen, coins, bank, lastCmd, usedTime, afk, afkReason, health, stamina, magic, characters, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            chatId,
            userId,
            defChatUser.messageCount,
            Date.now(),
            defChatUser.coins,
            defChatUser.bank,
            defChatUser.lastCmd,
            defChatUser.usedTime,
            defChatUser.afk,
            defChatUser.afkReason,
            defChatUser.health,
            defChatUser.stamina,
            defChatUser.magic,
            defChatUser.characters,
            defChatUser.stats
        );
        cu = stmt('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
    }
    if (cu) {
        cu.characters = parseJSON(cu.characters, []);
        cu.stats = parseJSON(cu.stats, {});
    }
    return cu;
}

export function setChatUser(chatId: string, userId: string, field: string, val: any): any {
    assertIdent(field);
    getChatUser(chatId, userId);
    return stmt(`UPDATE chat_users SET "${field}" = ? WHERE chat_id = ? AND user_id = ?`).run(
        toStore(val),
        chatId,
        userId
    );
}

function normalizePrefixValue(raw: any): any {
    if (raw === 1 || raw === '1' || raw === true || raw === 'true') return 1;
    if (raw == null) return defaultPrefixes();
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(String(raw));
        if (parsed === 1 || parsed === true) return 1;
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'string') return [parsed];
    } catch {
        if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
    }
    return defaultPrefixes();
}

export function getSettings(id?: string): any {
    if (!id) {
        return (stmt('SELECT * FROM settings').all() as any[]).map(row => ({
            ...row,
            prefix: normalizePrefixValue(row.prefix)
        }));
    }
    let row = stmt('SELECT * FROM settings WHERE id = ?').get(id);
    if (!row) {
        const defs = buildDefaultSets();
        stmt(
            'INSERT OR IGNORE INTO settings (id, self, prefix, commandsejecut, newsletter_id, nameid, type, link, banner, icon, currency, namebot, botname, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            id,
            defs.self,
            defs.prefix,
            defs.commandsejecut,
            defs.newsletter_id,
            defs.nameid,
            defs.type,
            defs.link,
            defs.banner,
            defs.icon,
            defs.currency,
            defs.namebot,
            defs.botname,
            defs.owner
        );
        row = stmt('SELECT * FROM settings WHERE id = ?').get(id);
    }
    row.prefix = normalizePrefixValue(row.prefix);
    return row;
}

export function setSettings(id: string, field: string, val: any): any {
    assertIdent(field);
    getSettings(id);
    let stored = val;
    if (val === true) stored = '1';
    else if (Array.isArray(val) || (typeof val === 'object' && val !== null)) stored = JSON.stringify(val);
    const result = stmt(`UPDATE settings SET "${field}" = ? WHERE id = ?`).run(stored, id);
    syncMainSettingsToFile(id, field, val);
    return result.changes ? result : undefined;
}

export function getCharacter(id?: string): any {
    if (!id) {
        const rows = stmt('SELECT id, data FROM characters').all() as any[];
        const characters: Record<string, any> = {};
        for (const row of rows) characters[row.id] = parseJSON(row.data, row.data);
        return characters;
    }
    const row = stmt('SELECT data FROM characters WHERE id = ?').get(id);
    if (!row) return null;
    return parseJSON(row.data, row.data);
}

export function setCharacter(id: string, data: any): boolean {
    stmt('REPLACE INTO characters (id, data) VALUES (?, ?)').run(id, toStore(data));
    return true;
}

export function getStickersPack(id?: string): any {
    if (!id) return stmt('SELECT * FROM sticker_packs').all();
    let stickerPack = stmt('SELECT * FROM sticker_packs WHERE id = ?').get(id);
    if (!stickerPack) {
        stmt('INSERT OR IGNORE INTO sticker_packs (id, packs) VALUES (?, ?)').run(id, defStickerPack.packs);
        stickerPack = stmt('SELECT * FROM sticker_packs WHERE id = ?').get(id);
    }
    stickerPack.packs = parseJSON(stickerPack.packs, []);
    return stickerPack;
}

export function setStickersPack(id: string, field: string, val: any): any {
    assertIdent(field);
    getStickersPack(id);
    const result = stmt(`UPDATE sticker_packs SET "${field}" = ? WHERE id = ?`).run(toStore(val), id);
    return result.changes ? result : undefined;
}

export function deletedb(type: string, ...ids: string[]): boolean {
    if (!type || !ids.length) return false;
    switch (type) {
        case 'user':
            return stmt('DELETE FROM users WHERE id = ?').run(ids[0]).changes > 0;
        case 'chat':
            return stmt('DELETE FROM chats WHERE id = ?').run(ids[0]).changes > 0;
        case 'chatuser':
            if (ids.length < 2) return false;
            return stmt('DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?').run(ids[0], ids[1]).changes > 0;
        case 'settings':
            return stmt('DELETE FROM settings WHERE id = ?').run(ids[0]).changes > 0;
        case 'character':
            return stmt('DELETE FROM characters WHERE id = ?').run(ids[0]).changes > 0;
        case 'stickerpack':
            return stmt('DELETE FROM sticker_packs WHERE id = ?').run(ids[0]).changes > 0;
        default:
            return false;
    }
}

export function setCreate(table: string, identifier: any, field: string, value: any): any {
    const allowedTables = new Set(['users', 'chats', 'chat_users', 'settings', 'characters', 'sticker_packs']);
    if (!allowedTables.has(table)) throw new Error(`Tabla '${table}' no soportada`);
    assertIdent(field);

    if (table === 'characters') {
        const key = Array.isArray(identifier) ? String(identifier[0]) : String(identifier);
        const existingData = getCharacter(key);
        if (!existingData) {
            setCharacter(key, { [field]: value });
            return value;
        }
        if (existingData[field] === undefined) {
            setCharacter(key, { ...existingData, [field]: value });
            return value;
        }
        return existingData[field];
    }

    const addedColumn = !columnExists(table, field);
    if (addedColumn) {
        const sqlType = typeof value === 'number' ? 'INTEGER' : typeof value === 'boolean' ? 'BOOLEAN' : 'TEXT';
        let defaultVal = "''";
        if (typeof value === 'number' || typeof value === 'boolean') defaultVal = '0';
        else if (Array.isArray(value)) defaultVal = "'[]'";
        else if (typeof value === 'object' && value !== null) defaultVal = "'{}'";
        db.exec(`ALTER TABLE ${table} ADD COLUMN "${field}" ${sqlType} DEFAULT ${defaultVal}`);
        columnsCache.get(table)?.add(field);
        for (const k of [...stmts.keys()]) {
            if (k.includes(table)) stmts.delete(k);
        }
    }

    if (table === 'chat_users') {
        if (!Array.isArray(identifier) || identifier.length < 2) {
            throw new Error('chat_users requiere [chatId, userId]');
        }
        const [chatId, userId] = identifier;
        const record = getChatUser(chatId, userId);
        if (addedColumn || record[field] === undefined || record[field] === null) {
            setChatUser(chatId, userId, field, value);
            return value;
        }
        return record[field];
    }

    const singleId = Array.isArray(identifier) ? String(identifier[0]) : String(identifier);
    if (table === 'users') {
        const record = getUser(singleId);
        if (addedColumn || record[field] === undefined || record[field] === null) {
            setUser(singleId, field, value);
            return value;
        }
        return record[field];
    }
    if (table === 'chats') {
        const record = getChat(singleId);
        if (addedColumn || record[field] === undefined || record[field] === null) {
            setChat(singleId, field, value);
            return value;
        }
        return record[field];
    }
    if (table === 'settings') {
        const record = getSettings(singleId);
        if (addedColumn || record[field] === undefined || record[field] === null) {
            setSettings(singleId, field, value);
            return value;
        }
        return record[field];
    }
    if (table === 'sticker_packs') {
        const record = getStickersPack(singleId);
        if (addedColumn || record[field] === undefined || record[field] === null) {
            setStickersPack(singleId, field, value);
            return value;
        }
        return record[field];
    }
    return value;
}

export function clearCache(): boolean {
    return true;
}

let cleanupStarted = false;
export function clearDB(): void {
    if (cleanupStarted) return;
    cleanupStarted = true;
    const INACTIVE_MS = 30 * 86_400_000;
    const timer = setInterval(() => {
        try {
            const now = Date.now();
            for (const cu of stmt('SELECT chat_id, user_id, lastSeen, lastCmd, coins, bank, characters FROM chat_users').all() as any[]) {
                const last = Math.max(Number(cu.lastCmd) || 0, Number(cu.lastSeen) || 0);
                const hasAssets = (Number(cu.coins) || 0) > 0 || (Number(cu.bank) || 0) > 0 || (cu.characters && cu.characters !== '[]');
                if (!hasAssets && last > 0 && now - last > INACTIVE_MS) {
                    stmt('DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?').run(cu.chat_id, cu.user_id);
                }
            }
        } catch {}
    }, 86_400_000);
    timer.unref();
}

const dbApi = {
    initDB,
    loadDB,
    getUser,
    setUser,
    updateUser,
    getChat,
    setChat,
    getChatUser,
    setChatUser,
    updateChatUser,
    getSettings,
    setSettings,
    updateSettings,
    recordMessage,
    recordCommand,
    getCharacter,
    setCharacter,
    getStickersPack,
    setStickersPack,
    deletedb,
    setCreate,
    clearCache,
    clearDB,
    db
};

(globalThis as any).db = dbApi;

export default dbApi;
