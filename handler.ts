import chalk from 'chalk';
import { LRUCache } from 'lru-cache';
import config from '#config';
import db from '#db';
import { getCachedMeta, setCachedMeta, BoundedMap } from '#simple';
import { statsDay, markCommand } from '#core/latency';
import { createReactor } from './lib/reactions.ts';
import type { CommandEntry, HookEntry } from './lib/cmdsLoader.ts';

const g = globalThis as any;

const processedMsgIds = new LRUCache<string, boolean>({
    max: 2000,
    ttl: 10_000
});

const prefixCache = new BoundedMap<string, { sig: string; regex: RegExp; namebot: string }>(300, 0);

const normalizeNumber = (x: any): string =>
    String(x || '').split('@')[0].split(':')[0].replace(/\D/g, '').trim();

const stripMexOne = (num: string): string =>
    num.startsWith('521') ? '52' + num.slice(3) : num;

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function emit(event: string, payload: any): void {
    if (typeof g.broadcast === 'function') {
        queueMicrotask(() => {
            try { g.broadcast(event, payload); } catch {}
        });
    }
}

function getBotPrefixRegex(botJid: string, settings: any): { sig: string; regex: RegExp; namebot: string } {
    const sig = `${settings.namebot || ''}|${settings.type || ''}|${JSON.stringify(settings.prefix ?? '')}`;
    const cached = prefixCache.get(botJid);
    if (cached && cached.sig === sig) return cached;

    const rawBotname = String(settings.namebot || config.botName || 'Denji');
    const tipo = String(settings.type || 'Sub');
    const cleanBotname = rawBotname.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Denji';
    const firstWord = cleanBotname.split(' ')[0];
    const shortForms = Array.from(
        new Set([
            cleanBotname,
            firstWord,
            firstWord.slice(0, 3),
            firstWord.slice(0, 2),
            firstWord.charAt(0),
            tipo.split(' ')[0]
        ].filter(Boolean))
    );

    let regex: RegExp;
    if (Array.isArray(settings.prefix) || typeof settings.prefix === 'string') {
        const list = (Array.isArray(settings.prefix) ? settings.prefix : [settings.prefix]).filter(Boolean);
        const pGroup = list.length ? list.map(escapeRegex).join('|') : escapeRegex(config.prefix || '.');
        regex = new RegExp(`^(${shortForms.map(escapeRegex).join('|')})?(${pGroup})`, 'i');
    } else if (settings.prefix === 1) {
        regex = new RegExp('^', 'i');
    } else {
        regex = new RegExp(`^(${escapeRegex(config.prefix || '.')})`, 'i');
    }

    const entry = { sig, regex, namebot: cleanBotname };
    prefixCache.set(botJid, entry);
    return entry;
}

let customPrefixCache: { revision: number; size: number; list: [string, CommandEntry][] } = {
    revision: -1,
    size: -1,
    list: []
};

function getCustomPrefixCmds(): [string, CommandEntry][] {
    const map: Map<string, CommandEntry> = g.comandos;
    if (!map) return [];
    if (customPrefixCache.revision !== g.commandRevision || customPrefixCache.size !== map.size) {
        customPrefixCache = {
            revision: g.commandRevision || 0,
            size: map.size,
            list: [...map.entries()].filter(([, data]) => data.customPrefix)
        };
    }
    return customPrefixCache.list;
}

const adminCache = new WeakMap<object, { participants: any[]; admins: Set<string> }>();
function getAdmins(metadata: any, participants: any[]): Set<string> {
    if (!metadata) return new Set();
    const cached = adminCache.get(metadata);
    if (cached?.participants === participants) return cached.admins;
    const admins = new Set<string>();
    for (const participant of participants) {
        if (participant.admin !== 'admin' && participant.admin !== 'superadmin') continue;
        for (const jid of [participant.id, participant.rawId, participant.lid, participant.phoneNumber, participant.jid]) {
            if (!jid) continue;
            const num = normalizeNumber(jid);
            if (num) {
                admins.add(num);
                admins.add(stripMexOne(num));
            }
        }
    }
    adminCache.set(metadata, { participants, admins });
    return admins;
}

function getAllSessionBots(): string[] {
    const bots = ((g.conns ?? []) as any[])
        .filter(c => c?.userId)
        .map(c => `${c.userId}@s.whatsapp.net`);
    const ownerId = normalizeNumber(g.sock?.user?.id);
    if (ownerId) bots.push(`${ownerId}@s.whatsapp.net`);
    return bots;
}

function isSameNumber(a: string, b: string): boolean {
    const na = normalizeNumber(a);
    const nb = normalizeNumber(b);
    return Boolean(na && nb && (na === nb || stripMexOne(na) === stripMexOne(nb)));
}

function hasAdminNumber(adminSet: Set<string>, ...candidates: any[]): boolean {
    for (const raw of candidates) {
        if (!raw) continue;
        const num = normalizeNumber(raw);
        if (num && (adminSet.has(num) || adminSet.has(stripMexOne(num)))) return true;
    }
    return false;
}

export async function handler(sock: any, msg: any): Promise<any> {
    if (!msg?.chat || !msg?.sender || g.__denjiWiping) return;
    const startTime = Date.now();

    const botNumber = normalizeNumber(sock?.user?.id || sock?.authState?.creds?.me?.id);
    if (!botNumber) return;
    const botJid = `${botNumber}@s.whatsapp.net`;
    const botLidNumber = normalizeNumber(sock?.user?.lid || sock?.authState?.creds?.me?.lid);
    const botLid = botLidNumber ? `${botLidNumber}@lid` : '';

    const dedupeKey = msg.key?.id ? `${botNumber}:${msg.key.id}` : '';
    if (dedupeKey) {
        if (processedMsgIds.has(dedupeKey)) return;
        processedMsgIds.set(dedupeKey, true);
    }

    const sender: string = msg.sender;
    const chat = db.getChat(msg.chat);
    const settings = db.getSettings(botJid);

    const ownerNumbers: string[] = [
        ...Array.from(config.owner),
        ...(Array.isArray(g.owner) ? g.owner : [])
    ];
    const configuredOwner = ownerNumbers.some(num => isSameNumber(sender, num));
    const isSelfBot =
        isSameNumber(sender, botJid) ||
        (botLid ? isSameNumber(sender, botLid) : false) ||
        Boolean(msg.fromMe);
    const isSettingsOwner = settings.owner ? isSameNumber(sender, settings.owner) : false;
    const isROwner = configuredOwner || isSelfBot || isSettingsOwner;
    const isOwner = isROwner;

    let groupMetadata: any = null;
    if (msg.isGroup) {
        groupMetadata = getCachedMeta(msg.chat);
        if (!groupMetadata && typeof sock?.groupMetadata === 'function') {
            groupMetadata = await sock.groupMetadata(msg.chat).catch(() => null);
            if (groupMetadata) setCachedMeta(msg.chat, groupMetadata);
        }
        if (groupMetadata?.subject && chat?.name !== groupMetadata.subject) {
            try { db.setChat(msg.chat, 'name', String(groupMetadata.subject)); } catch {}
        }
    }
    const participants: any[] = groupMetadata?.participants || [];
    const adminSet = getAdmins(groupMetadata, participants);
    const senderNum = normalizeNumber(sender);
    const isBotAdmins = msg.isGroup
        ? hasAdminNumber(adminSet, botNumber, botLidNumber)
        : false;
    const isAdmins = msg.isGroup
        ? hasAdminNumber(adminSet, senderNum, msg.key?.participant, msg.key?.participantAlt)
        : false;

    const hooks: HookEntry[] = g.cmdsExecute ?? [];
    const allHooks = hooks.filter(p => p.type === 'all');
    if (allHooks.length) {
        Promise.allSettled(
            allHooks.map(p =>
                p.fn({
                    msg, sock, groupMetadata, participants,
                    isAdmins, isBotAdmins, isOwner, __dirname: p.dirname
                }).catch((e: any) =>
                    console.error(chalk.gray(`[ ✿ ] Error all-plugin ${p.key}: ${e?.message || e}`))
                )
            )
        );
    }

    const today = statsDay();
    try {
        db.recordMessage(msg.chat, sender, today, msg.pushName);
    } catch {}

    const textBody = String(msg.text ?? msg.body ?? '');
    const { regex: prefixRegex } = getBotPrefixRegex(botJid, settings);

    let customCmd: string | null = null;
    let pluginPrefix: any = prefixRegex;
    for (const [cmdName, data] of getCustomPrefixCmds()) {
        const cp = data.customPrefix;
        const candidates = cp instanceof RegExp
            ? [[cp.exec(textBody), cp]]
            : Array.isArray(cp)
                ? cp.map(p => {
                      const r = p instanceof RegExp ? p : new RegExp(escapeRegex(String(p)));
                      return [r.exec(textBody), r];
                  })
                : typeof cp === 'string'
                    ? [[new RegExp(escapeRegex(cp)).exec(textBody), new RegExp(escapeRegex(cp))]]
                    : [[null, null]];
        if (candidates.find(p => p[0])) {
            customCmd = cmdName;
            pluginPrefix = cp;
            break;
        }
    }

    const matches = pluginPrefix instanceof RegExp
        ? [[pluginPrefix.exec(textBody), pluginPrefix]]
        : Array.isArray(pluginPrefix)
            ? pluginPrefix.map((p: any) => {
                  const r = p instanceof RegExp ? p : new RegExp(escapeRegex(String(p)));
                  return [r.exec(textBody), r];
              })
            : typeof pluginPrefix === 'string'
                ? [[new RegExp(escapeRegex(pluginPrefix)).exec(textBody), new RegExp(escapeRegex(pluginPrefix))]]
                : [[null, null]];
    const match = matches.find(p => p[0]) || null;

    let handledByBefore = false;
    const botprimaryId: string | null = chat?.primaryBot || null;
    if (!botprimaryId || isSameNumber(botprimaryId, botJid)) {
        const beforeHooks = hooks.filter(p => p.type === 'before');
        if (beforeHooks.length) {
            const results = await Promise.allSettled(
                beforeHooks.map(p =>
                    p.fn({
                        msg, sock, match, groupMetadata, participants,
                        isAdmins, isBotAdmins, isOwner, __dirname: p.dirname
                    }).catch((e: any) => {
                        console.error(chalk.gray(`[ ✿ ] Error before-plugin ${p.key}: ${e?.message || e}`));
                        return false;
                    })
                )
            );
            handledByBefore = results.some(r => r.status === 'fulfilled' && r.value === true);
        }
    }

    if (!match || msg.isCommands) return;

    const usedPrefix = String((match[0] as any)?.[0] || '');
    if (!usedPrefix && handledByBefore) return;
    const rest = textBody.slice(usedPrefix.length).trim();
    if (!rest && !customCmd) return;

    const rawParts = rest ? rest.split(/ +/) : [];
    const rawCmd = customCmd ?? (rawParts.shift() || '');
    const command = rawCmd.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const args = rawParts;
    const text = args.join(' ');
    if (!command) return;

    // Si hay un bot primario activo en el grupo y no somos nosotros, ignoramos.
    const prefixList = settings.prefix === 1
        ? []
        : Array.isArray(settings.prefix)
            ? settings.prefix
            : typeof settings.prefix === 'string'
                ? [settings.prefix]
                : [config.prefix || '.'];
    const hasPrefix = settings.prefix === 1 || prefixList.some((p: string) => p && textBody.startsWith(p));
    if (botprimaryId && botprimaryId !== botJid && hasPrefix) {
        const groupJids = participants.map(p => p.id);
        const sessionBots = getAllSessionBots();
        if (groupJids.includes(botprimaryId) && sessionBots.includes(botprimaryId)) return;
    }

    if (!isROwner && settings.self) return;

    if (msg.isGroup && chat?.isBanned && !(command === 'bot' && ['on', 'enable'].includes(text.toLowerCase())) && !isOwner) {
        const displayPrefix = usedPrefix || config.prefix || '.';
        await msg.reply(
            `ꕥ El bot *${settings.botname || config.botName}* está desactivado en este grupo.\n\n` +
            `> ✎ Un *administrador* puede activarlo con:\n> » *${displayPrefix}bot on*`
        );
        return;
    }

    const reactor = createReactor(sock, msg);

    if (msg.isGroup && chat?.adminonly && !isAdmins && !isOwner) {
        reactor.event('denied');
        return;
    }

    const cmdMap: Map<string, CommandEntry> = g.comandos;
    const cmdData = cmdMap?.get(rawCmd.toLowerCase()) || cmdMap?.get(command);
    if (!cmdData) {
        if (settings.prefix === 1) return;
        // Ignorar puntos suspensivos o emoticonos como "..." o ".-."
        if (!/^[\p{L}\p{N}_-]+$/u.test(command)) return;
        reactor.event('unknown');
        return msg.reply(
            `ꕤ El comando *${command}* no existe.\n✎ Usa *${usedPrefix || config.prefix}menu* para ver los comandos.`
        );
    }

    if (cmdData.isOwner && !isOwner) {
        reactor.event('denied');
        emit('security_event', {
            type: 'unauthorized_access',
            command,
            sender: senderNum,
            chat: msg.chat
        });
        if (settings.prefix === 1) return;
        return msg.reply('《✧》 Este comando solo puede ser utilizado por el dueño del bot.');
    }

    const requiresGroup =
        cmdData.isGroup ||
        cmdData.isAdmin ||
        cmdData.botAdmin ||
        cmdData.category === 'group';
    if (requiresGroup && !msg.isGroup) {
        reactor.event('denied');
        return msg.reply('《✧》 Este comando solo se puede usar en grupos.');
    }

    if (cmdData.isAdmin && !isAdmins && !isOwner) {
        reactor.event('denied');
        emit('security_event', {
            type: 'unauthorized_admin_command',
            command,
            sender: senderNum,
            chat: msg.chat
        });
        return sock.reply(msg.chat, g.mess.admin, msg);
    }

    if (cmdData.botAdmin && !isBotAdmins) {
        reactor.event('denied');
        return sock.reply(msg.chat, g.mess.botAdmin, msg);
    }

    emit('command_received', {
        msgId: msg.key?.id,
        command,
        chat: msg.chat,
        sender,
        isGroup: msg.isGroup,
        timestamp: startTime
    });
    emit('command_executing', { command, chat: msg.chat, sender });

    reactor.event('wait');

    try {
        sock.sendPresenceUpdate('composing', msg.chat).catch(() => {});
        sock.readMessages([msg.key]).catch(() => {});

        const gainedExp = Math.floor(Math.random() * 100);
        try {
            db.recordCommand(msg.chat, sender, botJid, {
                name: msg.pushName,
                exp: gainedExp,
                now: Date.now(),
                day: today
            });
            const u = db.getUser(sender);
            emit('db_updated', {
                chat: msg.chat,
                user: sender,
                exp: u?.exp || 0,
                usedcommands: u?.usedcommands || 0
            });
        } catch {}

        markCommand(msg);

        const cleanPrefix = usedPrefix || config.prefix || '.';
        const result = await cmdData.run({
            msg,
            m: msg,
            sock,
            args,
            usedPrefix: cleanPrefix,
            prefix: cleanPrefix,
            command,
            text,
            chat: msg.chat,
            sender,
            reply: msg.reply,
            groupMetadata,
            participants,
            isAdmins,
            isAdmin: isAdmins,
            isBotAdmins,
            isBotAdmin: isBotAdmins,
            isOwner,
            isROwner,
            __dirname: g.plugins?.[cmdData.pluginKey]?.dirname || process.cwd()
        });

        if (g.__denjiWiping) return result;
        reactor.event('done', [command, ...cmdData.aliases]);
        emit('command_executed', {
            command,
            chat: msg.chat,
            sender,
            executionTimeMs: Date.now() - startTime
        });
        return result;
    } catch (error: any) {
        reactor.event('error');
        console.error(chalk.red(`[ ERROR ${command} ]:`), error);
        emit('handler_error', {
            error: error?.message || String(error),
            stack: error?.stack
        });
        await sock.sendMessage(
            msg.chat,
            { text: `《✧》 Error al ejecutar el comando *${command}*.\n> ${error?.message || error}` },
            { quoted: msg }
        ).catch(() => {});
    }
}

export default handler;
