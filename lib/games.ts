import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '#config';
import { kvGet, kvSet, kvList, kvPrune, saveDB } from '#db';
import { chatUser, addItem, addXp, track, FISH, ITEMS, coinName } from './rpg.ts';
import { sendHtml, MAX_HTML_BYTES } from './richhtml.ts';

/*
 * Juegos HTML (categoría `games`): Snake, Fish, Ajedrez y Arena.
 *
 * Cada juego es una página que se envía dentro del chat con `sendHtml`. El
 * WebView de WhatsApp no deja guardar nada ni cargar nada de internet; lo
 * único que funciona es abrir un WebSocket seguro (`wss://`). Por eso:
 *
 *  - El bot y la página se conectan al mismo servidor de mensajes público
 *    (MQTT sobre WebSocket, ajuste `gameServers`). La página publica su
 *    progreso firmado con la clave de la partida y el bot lo guarda. Por ese
 *    mismo servidor se ven entre sí los jugadores de la Arena.
 *  - Si no hay conexión, la página muestra un código y `.canjear <código>`
 *    guarda lo mismo a mano.
 *
 * Una "partida" (sesión) es un mensaje de juego: tiene dueño, chat y clave.
 * Lo que se gana en ella va siempre a su dueño.
 */

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'games');
const read = (name: string): string => fs.readFileSync(path.join(ASSETS, name), 'utf8');

// El mismo código que usan las páginas (firma, azar y cliente MQTT).
const NET_JS = read('net.js');
const shared = new Function(`${NET_JS}\nreturn { djMac, djPick, djPayload, mqttLite };`)() as {
    djMac: (key: string, text: string) => string;
    djPick: (list: { weight: number }[], seed: number, index: number) => number;
    djPayload: (id: string, seq: number, values: number[], extra: string) => string;
    mqttLite: (url: string, onMessage: (topic: string, text: string) => void, onState: (open: boolean) => void, WS?: any) => {
        isOpen: () => boolean; sub: (topic: string) => void; pub: (topic: string, text: string) => boolean; close: () => void;
    };
};

export type GameId = 'snake' | 'fish' | 'chess' | 'arena';

type GameInfo = {
    id: GameId;
    name: string;
    emoji: string;
    command: string;
    /** Cuántos números guarda la partida (ver `credit`). */
    values: number;
    about: string;
};

export const GAMES: Record<GameId, GameInfo> = {
    snake: { id: 'snake', name: 'Snake', emoji: '🐍', command: 'snake', values: 3, about: 'come manzanas sin chocar; cada manzana da monedas' },
    fish: { id: 'fish', name: 'Fish', emoji: '🎣', command: 'fish', values: 1, about: 'lanza la caña al río y tira en el momento justo; los peces van a tu inventario' },
    chess: { id: 'chess', name: 'Ajedrez', emoji: '♟️', command: 'ajedrez', values: 3, about: 'contra el bot (3 niveles), de a dos o en línea; la partida se guarda' },
    arena: { id: 'arena', name: 'Arena', emoji: '⭐', command: 'arena', values: 1, about: 'multijugador: muévete con el control y gana estrellas contra otra gente' }
};

export type Session = {
    id: string;
    /** Clave con la que la página firma lo que envía. */
    k: string;
    g: GameId;
    /** Chat y persona a quienes se acredita lo ganado. */
    c: string;
    u: string;
    n: string;
    /** Momento de creación (ms). */
    t: number;
    /** Totales ya acreditados y los que tenía al empezar. */
    v: number[];
    b: number[];
    /** Último número de envío aceptado (evita repetir envíos viejos). */
    q: number;
    /** Texto libre del juego (la posición del ajedrez). */
    x: string;
    seed: number;
    room: string;
};

const SESSION_TTL_MS = 48 * 3600_000;
const SESSION_PREFIX = 'gs:';
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomId = (length: number): string =>
    Array.from(crypto.randomBytes(length), byte => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');

const getSession = (id: string): Session | null => {
    const session = kvGet<Session>(SESSION_PREFIX + id);
    if (!session || Date.now() - session.t > SESSION_TTL_MS) return null;
    return session;
};

const putSession = (session: Session): void => kvSet(SESSION_PREFIX + session.id, session);

// ───────────────────────── récords ─────────────────────────

export type Records = {
    snake: { best: number; apples: number; plays: number };
    fish: { caught: number };
    chess: { w: number; l: number; d: number; x: string };
    arena: { stars: number };
};

/** Récords de una persona en los juegos (valen en todos los chats). */
export function recordsOf(jid: string): Records {
    const g = global as any;
    g.db ||= { data: { users: {}, chats: {} } };
    g.db.data.users ||= {};
    const user = (g.db.data.users[jid] ||= {});
    const r = (user.games && typeof user.games === 'object' ? user.games : (user.games = {})) as Records;
    const n = (value: any): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
    r.snake = { best: n(r.snake?.best), apples: n(r.snake?.apples), plays: n(r.snake?.plays) };
    r.fish = { caught: n(r.fish?.caught) };
    r.chess = { w: n(r.chess?.w), l: n(r.chess?.l), d: n(r.chess?.d), x: typeof r.chess?.x === 'string' ? r.chess.x : '' };
    r.arena = { stars: n(r.arena?.stars) };
    return r;
}

// ───────────────────────── acreditar el progreso ─────────────────────────

export type Credit = {
    /** Hubo algo nuevo que guardar. */
    changed: boolean;
    coins: number;
    items: Record<string, number>;
    /** Avisos para el chat (récord nuevo, partida ganada...). */
    notes: string[];
};

export const SNAKE_COINS = 120;
export const ARENA_COINS = 200;
export const CHESS_WIN_COINS = [0, 9000, 14000, 20000];
export const CHESS_DRAW_COINS = 2500;

/** Pez número `index` (desde 1) de una partida: depende solo de su semilla. */
export const fishAt = (seed: number, index: number): string => FISH[shared.djPick(FISH, seed, index)].id;

/**
 * Suma a la persona lo nuevo que trae un guardado. Los valores son totales:
 * solo cuenta lo que supera a lo ya acreditado, así que recibir dos veces el
 * mismo guardado no duplica nada. Cada juego tiene un tope por tiempo jugado
 * para que un envío inventado no pueda regalar una fortuna.
 */
export function credit(session: Session, values: number[], extra: string): Credit {
    const out: Credit = { changed: false, coins: 0, items: {}, notes: [] };
    const info = GAMES[session.g];
    const incoming = Array.from({ length: info.values }, (_, i) => {
        const value = Number(values[i]);
        return Number.isFinite(value) ? Math.max(0, Math.min(1e7, Math.floor(value))) : 0;
    });

    const seconds = Math.max(0, (Date.now() - session.t) / 1000);
    const cu = chatUser(session.c, session.u);
    const p = cu.rpg;
    const records = recordsOf(session.u);
    /** Cuánto puede subir el total `i`: lo pedido, sin pasar del tope de la partida. */
    const gain = (i: number, cap: number): number => {
        const allowed = Math.max(0, Math.floor(cap) - (session.v[i] - session.b[i]));
        return Math.max(0, Math.min(incoming[i] - session.v[i], allowed));
    };

    if (session.g === 'snake') {
        // [mejor puntuación, manzanas, partidas]
        const apples = gain(1, Math.min(5000, seconds * 1.5 + 5));
        const plays = gain(2, seconds / 3 + 2);
        session.v[1] += apples;
        session.v[2] += plays;
        if (apples) {
            out.coins = apples * SNAKE_COINS;
            records.snake.apples += apples;
        }
        if (plays) {
            records.snake.plays += plays;
            track(p, 'games', plays);
        }
        // La mejor puntuación no puede superar las manzanas comidas en esta partida.
        const best = Math.min(incoming[0], session.v[1] - session.b[1]);
        if (best > session.v[0]) {
            session.v[0] = best;
            if (best > records.snake.best) {
                records.snake.best = best;
                out.notes.push(`🐍 *${session.n}* tiene nuevo récord en Snake: *${best}* puntos.`);
            }
            out.changed = true;
        }
        out.changed ||= apples > 0 || plays > 0;
    } else if (session.g === 'fish') {
        // [peces atrapados]: la especie de cada uno sale de la semilla de la partida.
        const caught = gain(0, Math.min(300, seconds / 3.5 + 2));
        for (let i = 1; i <= caught; i++) {
            const id = fishAt(session.seed, session.v[0] + i);
            addItem(p, id);
            out.items[id] = (out.items[id] || 0) + 1;
            if (id !== 'bota') track(p, 'fish');
        }
        if (caught) {
            session.v[0] += caught;
            records.fish.caught += caught;
            addXp(p, caught * 4);
            track(p, 'games');
            out.changed = true;
        }
    } else if (session.g === 'chess') {
        // [victorias, derrotas, tablas] contra el bot; `extra` es la partida en curso.
        let level = 1;
        try { level = Math.max(1, Math.min(3, Math.floor(Number(JSON.parse(extra || '{}').l) || 1))); } catch {}
        const wins = gain(0, Math.min(40, seconds / 45));
        const losses = gain(1, seconds / 20 + 1);
        const draws = gain(2, seconds / 45);
        session.v[0] += wins;
        session.v[1] += losses;
        session.v[2] += draws;
        records.chess.w += wins;
        records.chess.l += losses;
        records.chess.d += draws;
        if (wins) {
            out.coins += wins * CHESS_WIN_COINS[level];
            addXp(p, wins * 40);
            out.notes.push(`♟️ *${session.n}* le ganó al bot en ajedrez (nivel ${level}).`);
        }
        if (draws) out.coins += draws * CHESS_DRAW_COINS;
        if (wins || losses || draws) track(p, 'games', wins + losses + draws);

        const text = typeof extra === 'string' ? extra.slice(0, 700) : '';
        if (text !== session.x) {
            session.x = text;
            records.chess.x = text;
            out.changed = true;
        }
        out.changed ||= wins + losses + draws > 0;
    } else {
        // [estrellas]
        const stars = gain(0, Math.min(5000, seconds / 1.5 + 3));
        if (stars) {
            session.v[0] += stars;
            records.arena.stars += stars;
            out.coins = stars * ARENA_COINS;
            track(p, 'games');
            out.changed = true;
        }
    }

    if (out.coins) cu.coins += out.coins;
    if (out.changed) {
        putSession(session);
        saveDB(session.c, session.u);
    }
    return out;
}

// ───────────────────────── conexión con las páginas ─────────────────────────

type Link = { url: string; client: ReturnType<typeof shared.mqttLite> };

let links: Link[] = [];
let linkedTo = '';
let lastSock: any = null;
let pruneTimer: NodeJS.Timeout | null = null;
const lastNote = new Map<string, number>();

/** Identificador de este bot en los servidores (aleatorio, se crea una vez). */
export function botTopic(): string {
    let id = kvGet<string>('game:bot');
    if (!id) {
        id = randomId(12).toLowerCase();
        kvSet('game:bot', id);
    }
    return `dj/${id}`;
}

const serverList = (): string[] => (Array.isArray((config as any).gameServers) ? (config as any).gameServers : []);

/** Servidores a los que el bot está conectado ahora mismo. */
export const openServers = (): string[] => links.filter(link => link.client.isOpen()).map(link => link.url);

function notify(session: Session, notes: string[]): void {
    if (!notes.length || !lastSock) return;
    // Como mucho un aviso por partida cada dos minutos.
    const last = lastNote.get(session.id) || 0;
    if (Date.now() - last < 120_000) return;
    lastNote.set(session.id, Date.now());
    lastSock.sendMessage(session.c, { text: notes.join('\n') }).catch(() => null);
}

function onMessage(link: Link, topic: string, text: string): void {
    const base = botTopic();
    if (topic !== `${base}/up` || text.length > 2500) return;

    let msg: any;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg.s !== 'string' || typeof msg.m !== 'string') return;

    const session = getSession(msg.s.toUpperCase());
    if (!session) return;

    const seq = Math.floor(Number(msg.q) || 0);
    const values: number[] = Array.isArray(msg.v) ? msg.v.slice(0, 8).map((n: any) => Math.floor(Number(n) || 0)) : [];
    const extra = typeof msg.x === 'string' ? msg.x : '';
    const answer = (type: string) => link.client.pub(`${base}/s/${session.id}`, JSON.stringify({ t: type, q: session.q, v: session.v, x: session.x }));

    if (msg.t === 'hi') {
        if (msg.m !== shared.djMac(session.k, shared.djPayload(session.id, 0, [], 'hi'))) return;
        answer('st');
        return;
    }

    if (msg.m !== shared.djMac(session.k, shared.djPayload(session.id, seq, values, extra))) return;
    // Un envío ya visto: se responde con lo guardado, sin acreditar de nuevo.
    if (seq <= session.q) { answer('st'); return; }

    session.q = seq;
    const result = credit(session, values, extra);
    if (!result.changed) putSession(session);
    answer('ok');
    notify(session, result.notes);
}

/**
 * Conecta el bot a los servidores de `gameServers` (una sola vez; si la lista
 * cambia en los ajustes, se vuelve a conectar). No espera a que abran.
 */
export function startGameNet(sock?: any): void {
    if (sock) lastSock = sock;
    const wanted = serverList();
    const key = wanted.join(' ');
    if (key === linkedTo && (links.length || !wanted.length)) return;

    for (const link of links) link.client.close();
    links = [];
    linkedTo = key;
    if (!wanted.length || typeof (globalThis as any).WebSocket === 'undefined') return;

    const base = botTopic();
    for (const url of wanted) {
        const link = { url } as Link;
        link.client = shared.mqttLite(url, (topic, text) => {
            try { onMessage(link, topic, text); } catch (e) { console.error('[GAMES] Error al guardar una partida:', e); }
        }, () => {});
        link.client.sub(`${base}/up`);
        links.push(link);
    }

    if (!pruneTimer) {
        pruneTimer = setInterval(() => kvPrune(SESSION_PREFIX, SESSION_TTL_MS), 3600_000);
        pruneTimer.unref();
    }
}

export function stopGameNet(): void {
    for (const link of links) link.client.close();
    links = [];
    linkedTo = '';
}

/** Al arrancar el bot: si hay partidas recientes, vuelve a escuchar sus guardados. */
export function resumeGames(sock?: any): void {
    if (sock) lastSock = sock;
    kvPrune(SESSION_PREFIX, SESSION_TTL_MS);
    if (kvList(SESSION_PREFIX).length) startGameNet();
}

/** Espera (poco) a que haya al menos un servidor conectado. */
async function waitForServers(ms: number): Promise<string[]> {
    const until = Date.now() + ms;
    while (!openServers().length && Date.now() < until && links.length) {
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    return openServers();
}

// ───────────────────────── código manual ─────────────────────────

export type Redeem = { ok: true; session: Session; credit: Credit } | { ok: false; reason: 'format' | 'unknown' | 'signature' };

/** `.canjear <código>`: guarda lo que trae un código mostrado por un juego. */
export function redeemCode(raw: string): Redeem {
    const match = String(raw || '').trim().toUpperCase().match(/^([A-Z0-9]{6,10})-([0-9A-Z.]{1,80})-([0-9A-Z]{5})$/);
    if (!match) return { ok: false, reason: 'format' };

    const [, id, data, mac] = match;
    const session = getSession(id);
    if (!session) return { ok: false, reason: 'unknown' };

    const lower = data.toLowerCase();
    if (shared.djMac(session.k, `code|${id}|${lower}`).slice(0, 5).toUpperCase() !== mac) return { ok: false, reason: 'signature' };

    const values = lower.split('.').map(part => parseInt(part, 36)).map(n => (Number.isFinite(n) ? n : 0));
    return { ok: true, session, credit: credit(session, values, session.x) };
}

// ───────────────────────── páginas ─────────────────────────

const pageCache = new Map<string, string>();

/** Quita comentarios de línea y sangrías: la página viaja dentro del mensaje. */
const squeeze = (source: string): string =>
    source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('//')).join('\n');

function template(game: GameId): string {
    let page = pageCache.get(game);
    if (!page) {
        page = read(`${game}.html`)
            .replace('/*@CSS*/', () => squeeze(read('base.css')))
            .replace('/*@SHARED*/', () => squeeze(NET_JS) + '\n' + squeeze(read('client.js')));
        page = squeeze(page);
        pageCache.set(game, page);
    }
    return page;
}

/** Página lista para enviar: la plantilla del juego con los datos de la partida. */
export function buildPage(game: GameId, cfg: Record<string, any>): string {
    // `<` escapado para que ningún texto pueda cerrar la etiqueta <script>.
    const json = JSON.stringify(cfg).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
    const html = template(game).replace('/*@CFG*/', () => `var CFG=${json};`);
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new Error(`La página de ${game} supera el tamaño máximo.`);
    return html;
}

const roomHash = (text: string): string => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);

export type NewGame = {
    game: GameId;
    chat: string;
    jid: string;
    name: string;
    /** Sala de la Arena (código elegido por la gente); vacío = la del chat. */
    room?: string;
    /** Ajedrez: empezar de cero aunque haya una partida guardada. */
    fresh?: boolean;
    prefix: string;
};

/** Crea la partida y devuelve su página. */
export async function createGame(input: NewGame): Promise<{ session: Session; html: string; online: boolean }> {
    startGameNet();
    const urls = await waitForServers(3500);
    const records = recordsOf(input.jid);
    const info = GAMES[input.game];

    const start = Array.from({ length: info.values }, () => 0);
    if (input.game === 'snake') start[0] = records.snake.best;

    const session: Session = {
        id: randomId(7),
        k: crypto.randomBytes(12).toString('base64url'),
        g: input.game,
        c: input.chat,
        u: input.jid,
        n: input.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 24) || 'Jugador',
        t: Date.now(),
        v: [...start],
        b: [...start],
        q: 0,
        x: input.game === 'chess' && !input.fresh ? records.chess.x : '',
        seed: crypto.randomBytes(4).readUInt32LE(0),
        room: ''
    };

    const cfg: Record<string, any> = {
        g: session.g,
        id: session.id,
        k: session.k,
        v: session.v,
        x: session.x,
        q: 0,
        name: session.n,
        px: input.prefix,
        coin: coinName(),
        net: urls.length ? { urls, pre: botTopic() } : null
    };

    if (input.game === 'snake') {
        cfg.reward = SNAKE_COINS;
    } else if (input.game === 'fish') {
        cfg.seed = session.seed;
        cfg.fish = FISH.map(f => ({ id: f.id, weight: f.weight, speed: f.speed, name: ITEMS[f.id].name, emoji: ITEMS[f.id].emoji, sell: ITEMS[f.id].sell }));
    } else if (input.game === 'chess') {
        cfg.rec = [records.chess.w, records.chess.l, records.chess.d];
        cfg.rewards = CHESS_WIN_COINS;
    } else {
        // La sala es la del chat, o la del código que escriba la gente.
        const code = String(input.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
        session.room = code ? `c${roomHash('code:' + code)}` : `g${roomHash(botTopic() + input.chat)}`;
        cfg.room = session.room;
        cfg.roomName = code || '';
        cfg.reward = ARENA_COINS;
        cfg.best = records.arena.stars;
    }

    putSession(session);
    return { session, html: buildPage(input.game, cfg), online: urls.length > 0 };
}

const arg = (ctx: any, index: number): string => String(ctx.args?.[index] || '').toLowerCase();
const FILE_WORDS = new Set(['archivo', 'file', 'documento', 'html']);

/**
 * Envía un juego al chat. Con `archivo` (`.snake archivo`) va como documento
 * .html para abrirlo en el navegador, por si WhatsApp no dibuja la vista.
 */
export async function sendGame(ctx: any, game: GameId, options: { room?: string; fresh?: boolean; jid: string; how: string }): Promise<void> {
    const { sock, chat } = ctx;
    const m = ctx.m || ctx.msg;
    const px = ctx.usedPrefix || ctx.prefix || config.prefix || '.';
    const info = GAMES[game];
    const asFile = FILE_WORDS.has(arg(ctx, 0)) || FILE_WORDS.has(arg(ctx, 1));
    lastSock = sock;

    const { session, html, online } = await createGame({
        game, chat, jid: options.jid, name: m?.pushName || 'Jugador', room: options.room, fresh: options.fresh, prefix: px
    });

    const saving = online
        ? '✿ *Guardado* » automático mientras juegas (🟢 arriba a la derecha).'
        : `✿ *Guardado* » ahora mismo no hay conexión con el servidor de juegos: al terminar, el juego te muestra un código para *${px}canjear*.`;
    const tail =
        `\n${saving}\n` +
        `> Lo que ganes es para *${session.n}*. Cada quien pide el suyo con *${px}${info.command}*.\n` +
        (asFile ? '' : `> ¿No ves el juego arriba? Usa *${px}${info.command} archivo* y ábrelo en el navegador.`);

    if (asFile) {
        await sock.sendMessage(chat, {
            document: Buffer.from(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>${info.name}</title></head><body>${html}</body></html>`, 'utf8'),
            mimetype: 'text/html',
            fileName: `${info.name}.html`,
            caption: `${info.emoji} *${info.name}*\n\n${options.how}\n${tail}`
        }, { quoted: m });
        return;
    }

    try {
        await sendHtml(sock, chat, html, { title: `${info.emoji} ${info.name}`, label: `${info.emoji} ${info.name} — ábrelo en WhatsApp para Android` });
    } catch (error: any) {
        console.error(`[GAMES] No se pudo enviar ${game} como vista:`, error?.message || error);
        await sock.sendMessage(chat, { text: `✿ No pude enviar el juego dentro del chat.\n> Prueba con *${px}${info.command} archivo*.` }, { quoted: m });
        return;
    }

    await sock.sendMessage(chat, { text: `${info.emoji} *${info.name}*\n\n${options.how}\n${tail}` }, { quoted: m });
}
