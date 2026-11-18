import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    jidDecode
} from '@whiskeysockets/baileys';
import P from 'pino';
import { Boom } from '@hapi/boom';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import qrcode from 'qrcode';
import { EventEmitter } from 'node:events';
import NodeCache from 'node-cache';
import Agent from 'node:https';
import config from '#config';
import db from '#db';
import { smsg, getCachedMeta, deleteCachedMeta, patchGroupMetadata } from '#simple';
import { createSignalCache } from '#core/signal-cache';
import { beginMessage, instrumentSocket } from '#core/latency';
import cmdsLoader from '#loader';
import handler from '#handler';
import printMessageLog from './lib/printlog.ts';
import { handleGroupAlerts } from '#alertas';
import { getSessionDir, TMP_DIR, SUBS_DIR } from './lib/settings.ts';
import { migrateLegacySession } from './lib/sessions.ts';
import { initBridge, underPanel, EXIT_NEED_LINK } from './lib/bridge.ts';

declare global {
    var botName: string;
    var plugins: Record<string, any>;
    var comandos: Map<string, any>;
    var cmdsExecute: any[];
    var commandRevision: number;
    var conns: any[];
    var sock: any;
    var mainConn: any;
    var eventBus: EventEmitter;
    var broadcast: (event: string, payload: any) => void;
}

globalThis.botName = config?.botName || 'Denji bot';
globalThis.plugins = globalThis.plugins || {};
globalThis.comandos = globalThis.comandos || new Map();
globalThis.cmdsExecute = globalThis.cmdsExecute || [];
globalThis.conns = globalThis.conns || [];

export const eventBus = globalThis.eventBus || new EventEmitter();
eventBus.setMaxListeners(50);
globalThis.eventBus = eventBus;

export function broadcast(event: string, payload: any): void {
    eventBus.emit(event, { payload, timestamp: Date.now() });
    eventBus.emit('*', { event, payload, timestamp: Date.now() });
}

globalThis.broadcast = broadcast;

initBridge(eventBus);
migrateLegacySession();

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const sDir = getSessionDir();
const msgStore = new Map<string, any>();
const MSG_STORE_LIMIT = 500;

const httpAgent = new Agent.Agent({
    keepAlive: true,
    maxSockets: 100,
    keepAliveMsecs: 15000,
    scheduling: 'fifo'
});

const envMethod = (process.env.DENJI_METHOD || '').toLowerCase();
const methodCodeQR = process.argv.includes('--qr') || envMethod === 'qr';
const methodCode = process.argv.includes('code') || process.argv.includes('--code') || envMethod === 'code';
const presetPhone =
    process.env.DENJI_PHONE || process.argv.find(a => a.startsWith('--phone='))?.slice(8) || '';

let bannerShown = false;
let loaderStarted = false;
let subBotsLoopStarted = false;
const reconnectingSubs = new Set<string>();

function cleanTmpCache(): void {
    try {
        if (!fs.existsSync(TMP_DIR)) {
            fs.mkdirSync(TMP_DIR, { recursive: true });
            return;
        }
        for (const file of fs.readdirSync(TMP_DIR)) {
            try { fs.unlinkSync(path.join(TMP_DIR, file)); } catch {}
        }
    } catch {}
}

cleanTmpCache();
setInterval(cleanTmpCache, 60 * 60 * 1000).unref();

async function loadSubBots(): Promise<void> {
    try {
        if (fs.existsSync(SUBS_DIR)) {
            const mod: any = await import('./commands/socket/subs.js');
            const startSubBot = mod?.startSubBot;
            if (typeof startSubBot === 'function') {
                for (const userId of fs.readdirSync(SUBS_DIR)) {
                    const credsPath = path.join(SUBS_DIR, userId, 'creds.json');
                    if (!fs.existsSync(credsPath)) continue;
                    if (globalThis.conns.some(c => c?.userId === userId)) continue;
                    if (reconnectingSubs.has(userId)) continue;
                    try {
                        reconnectingSubs.add(userId);
                        await startSubBot(null, null, '', false, userId, '');
                    } catch {
                        reconnectingSubs.delete(userId);
                    }
                    await new Promise(res => setTimeout(res, 2500));
                }
            }
        }
    } catch {}
    setTimeout(loadSubBots, 60_000).unref();
}

function requestLink(reason: string): Promise<never> {
    console.log(chalk.yellow(`[ SESSION ] ${reason}`));
    return new Promise<never>(() => {
        const exit = () => process.exit(EXIT_NEED_LINK);
        if (!underPanel()) return exit();
        setTimeout(exit, 1000);
        try {
            process.send!({ type: 'need_link', reason }, exit);
        } catch {
            exit();
        }
    });
}

function normalizePhone(input: any): string {
    let s = String(input).replace(/\D/g, '');
    if (!s) return '';
    if (s.startsWith('0')) s = s.replace(/^0+/, '');
    if (s.length === 10 && s.startsWith('3')) s = '57' + s;
    if (s.startsWith('52') && !s.startsWith('521') && s.length >= 12) s = '521' + s.slice(2);
    if (s.startsWith('54') && !s.startsWith('549') && s.length >= 11) s = '549' + s.slice(2);
    return s;
}

function limpiarSesion(): void {
    if (fs.existsSync(sDir)) {
        try {
            fs.rmSync(sDir, { recursive: true, force: true });
        } catch {}
    }
}

const askQuestion = async (query: string): Promise<string> => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(query, ans => {
            rl.close();
            resolve(ans.trim());
        });
    });
};

const displayLoadingMessage = (): void => {
    console.log(
        chalk.bold.white(
            `\n\nPor favor, ingrese el número de WhatsApp.\n` +
            `${chalk.bold.cyan('Ejemplo: +521XXXXXXXXXX')}\n` +
            `${chalk.bold.white('---> ')} `
        )
    );
};

export async function startBot(): Promise<void> {
    db.initDB();
    db.clearDB();

    if (!loaderStarted) {
        loaderStarted = true;
        await cmdsLoader(true);
    }

    if (!fs.existsSync(sDir)) {
        fs.mkdirSync(sDir, { recursive: true });
    }

    let { state, saveCreds } = await useMultiFileAuthState(sDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: [2, 3000, 1033105955] as [number, number, number]
    }));

    let opcion = '';
    let usarCodigo = false;
    const vinculada = Boolean(state.creds.registered || state.creds.account);

    if (!vinculada) {
        if (!bannerShown) {
            bannerShown = true;
            console.log(chalk.cyan('\n      Denji | Wa Bot\n'));
        }

        if (methodCodeQR) {
            opcion = '1';
        } else if (methodCode) {
            opcion = '2';
            usarCodigo = true;
        } else if (underPanel() || !process.stdin.isTTY) {
            await requestLink(
                'La sesión no está vinculada. Usa "Start" en el panel (npm start), o ejecuta "npm run qr" o "npm run code".'
            );
        } else {
            const lineM = '⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ 》';
            console.log(chalk.white(`╭${lineM}`));
            opcion = await askQuestion(
                `┊ ${chalk.bold.cyan(' METODO DE VINCULACION ')}\n` +
                `┊ ${chalk.bold.white('⇢ Opcion 1:')} ${chalk.cyan('Codigo QR.')}\n` +
                `┊ ${chalk.bold.white('⇢ Opcion 2:')} ${chalk.cyan('Codigo de 8 digitos.')}\n` +
                `╰${lineM}\n${chalk.bold.white('---> ')}`
            );
            usarCodigo = opcion === '2';
        }

        limpiarSesion();
        fs.mkdirSync(sDir, { recursive: true });

        const reloadedAuth = await useMultiFileAuthState(sDir);
        state = reloadedAuth.state;
        saveCreds = reloadedAuth.saveCreds;
    }

    const esQR = opcion === '1' || methodCodeQR;

    broadcast('bot_status', { status: 'connecting' });

    const logger = P({ level: 'silent' }) as any;
    const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });

    const sock: any = makeWASocket({
        logger,
        printQRInTerminal: false,
        version,
        browser: Browsers.macOS('Safari'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger, createSignalCache())
        },
        markOnlineOnConnect: false,
        emitOwnEvents: false,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        fireInitQueries: false,
        shouldIgnoreJid: (jid: string) => jid.endsWith('@broadcast'),
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: undefined,
        retryRequestDelayMs: 250,
        msgRetryCounterCache: msgRetryCounterCache as any,
        cachedGroupMetadata: async (jid: string) => getCachedMeta(jid),
        getMessage: async (key: any) => msgStore.get(`${key.remoteJid}:${key.id}`),
        fetchAgent: httpAgent as any
    });

    let bootTime = Date.now();
    sock.uptime = bootTime;
    sock.sessionFolder = sDir;
    sock.msgRetryCounterCache = msgRetryCounterCache;
    sock.decodeJid = (jid: string) => {
        if (!jid) return jid;
        if (/:\d+@/i.test(jid)) {
            const decoded = jidDecode(jid);
            return decoded?.user && decoded?.server ? `${decoded.user}@${decoded.server}` : jid;
        }
        return jid;
    };

    instrumentSocket(sock);
    patchGroupMetadata(sock);
    globalThis.sock = sock;
    globalThis.mainConn = sock;

    if (usarCodigo && !vinculada) {
        let num = presetPhone;
        if (!num) {
            if (underPanel() || !process.stdin.isTTY) {
                await requestLink('Falta el número de WhatsApp para generar el código de vinculación.');
            }
            displayLoadingMessage();
            num = await askQuestion('');
        }
        num = normalizePhone(num);

        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(chalk.white.bgBlue(' CODIGO DE VINCULACION '), chalk.white(`: ${code}`));
                broadcast('pairing_code', { code });
            } catch (err) {
                console.log(chalk.red('[ ERROR ] Falla al generar código de vinculación:'), err);
                limpiarSesion();
                if (underPanel()) {
                    await requestLink(
                        'No se pudo generar el código de vinculación. Revisa el número y tu conexión, e inténtalo de nuevo.'
                    );
                }
                setTimeout(() => startBot(), 2000);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', async () => {
        await saveCreds();
    });

    // Eventos de bienvenida, despedida, promote y demote (YukiBot-MD)
    try {
        const eventsMod: any = await import('./commands/events.js');
        if (typeof eventsMod?.default === 'function') {
            await eventsMod.default(sock, null);
        }
    } catch (err) {
        console.log(chalk.gray(`[ EVENT ERROR ] → ${err}`));
    }

    sock.ev.on('group-participants.update', (update: any) => {
        if (update?.id) {
            deleteCachedMeta(update.id);
            broadcast('group_updated', { chatId: update.id, action: update.action });
        }
    });

    sock.ev.on('groups.update', async (updates: any[]) => {
        for (const u of updates) {
            if (u?.id) deleteCachedMeta(u.id);
        }
        await handleGroupAlerts(sock, updates);
    });

    sock.ev.on('connection.update', async (u: any) => {
        const { connection, lastDisconnect, qr } = u;

        if (qr && esQR) {
            try {
                if (underPanel()) {
                    console.log(
                        chalk.bold.cyan(
                            '[ QR ] Nuevo código QR generado. Escanéalo desde WhatsApp > Dispositivos vinculados.'
                        )
                    );
                } else {
                    const qrTerminal = await qrcode.toString(qr, { type: 'terminal', small: true });
                    console.log(chalk.bold.cyan('\n[ QR ] ESCANEA EL SIGUIENTE CÓDIGO QR:\n'));
                    console.log(qrTerminal);
                }
                broadcast('qr_generated', { qr });
            } catch (err) {
                console.log(chalk.red('[ ERROR ] Error al renderizar el código QR:'), err);
            }
        }

        if (connection === 'open') {
            bootTime = Date.now();
            sock.uptime = bootTime;
            globalThis.sock = sock;
            globalThis.mainConn = sock;

            const number = (sock.user?.id || '').split('@')[0].split(':')[0];
            if (number) {
                const mainJid = `${number}@s.whatsapp.net`;
                db.getSettings(mainJid);
                db.setSettings(mainJid, 'type', 'Owner');
            }

            console.log(chalk.bold.cyan(`\n✿ ${globalThis.botName} conectado y listo ✰\n`));
            broadcast('bot_status', {
                status: 'connected',
                botName: globalThis.botName,
                number,
                name: sock.user?.name || ''
            });

            if (!subBotsLoopStarted) {
                subBotsLoopStarted = true;
                loadSubBots().catch(() => {});
            }
        }

        if (connection === 'close') {
            try { sock.ev.removeAllListeners(); } catch {}
            try { msgRetryCounterCache.close(); } catch {}

            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const isStreamError = lastDisconnect?.error?.message?.includes('Stream Errored');
            broadcast('bot_status', { status: 'disconnected', statusCode });

            if (statusCode === 515 || isStreamError) {
                console.log(chalk.yellow('[ RECONNECT ] Reiniciando socket por actualización de sesión...'));
                setTimeout(() => startBot(), 2000);
            } else if (statusCode === DisconnectReason.loggedOut) {
                console.log(chalk.red('[ SESSION ] Sesión cerrada desde el teléfono. Limpiando...'));
                limpiarSesion();
                if (underPanel()) {
                    await requestLink(
                        'La sesión se cerró desde el teléfono. Usa "Start" en el panel para vincularla de nuevo.'
                    );
                }
                setTimeout(() => startBot(), 2000);
            } else {
                console.log(chalk.yellow(`[ CONEXION ] Desconectado (Status ${statusCode}). Reintentando...`));
                setTimeout(() => startBot(), 3000);
            }
        }
    });

    sock.ev.on('messages.upsert', ({ messages, type }: any) => {
        if (type !== 'notify') return;

        for (const rawMsg of messages) {
            const mId = rawMsg?.key?.id;
            if (!mId || !rawMsg.message) continue;

            const jid = rawMsg.key.remoteJid || '';
            if (jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue;

            const ts = typeof rawMsg.messageTimestamp === 'number'
                ? rawMsg.messageTimestamp
                : rawMsg.messageTimestamp?.low || 0;
            if (ts && ts * 1000 < bootTime - 15_000) continue;

            beginMessage(rawMsg);
            const sid = `${jid}:${mId}`;
            msgStore.set(sid, rawMsg.message);
            if (msgStore.size > MSG_STORE_LIMIT) {
                const first = msgStore.keys().next().value;
                if (first) msgStore.delete(first);
            }

            void (async () => {
                try {
                    const m = await smsg(sock, rawMsg);
                    if (!m) return;
                    await handler(sock, m);
                    queueMicrotask(() => {
                        printMessageLog(m, sock).catch(() => {});
                        broadcast('message_received', {
                            id: mId,
                            jid,
                            pushName: rawMsg.pushName,
                            body: String(m.body || '').slice(0, 100)
                        });
                    });
                } catch {}
            })();
        }
    });
}

startBot().catch(() => {});

const originalStdoutWrite = process.stdout.write.bind(process.stdout);

const filterNoise = (chunk: any, encoding?: any, callback?: any) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (
        str.includes('Closing open session') ||
        str.includes('Closing session') ||
        str.includes('SessionEntry') ||
        str.includes('ephemeralKeyPair') ||
        str.includes('currentRatchet') ||
        str.includes('prekey bundle') ||
        str.includes('chainKey') ||
        str.includes('registrationId') ||
        str.includes('bad-mac') ||
        str.includes('Bad MAC') ||
        str.includes('Failed to decrypt') ||
        str.includes('Session error') ||
        str.includes('Error: bad-mac')
    ) {
        if (typeof callback === 'function') callback();
        return true;
    }
    return originalStdoutWrite(chunk, encoding, callback);
};

process.stdout.write = filterNoise as any;
process.stderr.write = filterNoise as any;

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
process.on('uncaughtExceptionMonitor', () => {});
