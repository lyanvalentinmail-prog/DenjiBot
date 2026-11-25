import config from '#config';
import db from '#db';
import {
    loadSettings,
    saveSettings,
    cleanTikTokUsername,
    cleanTargetJid,
    TIKTOK_S2_SOURCE_NAMES,
    TIKTOK_S2_MODE_NAMES
} from '#settings';
import { parseS2Mode } from '#audiosticker';
import {
    extractTikTokUrl,
    convertTikTokUrlToS2,
    pollTikTokAccountOnce
} from '#tiktoks2';

const SOURCE_ALIASES = {
    repost: 'repost',
    reposts: 'repost',
    republicados: 'repost',
    republicado: 'repost',
    posts: 'posts',
    post: 'posts',
    subidos: 'posts',
    videos: 'posts',
    favorite: 'favorite',
    favorites: 'favorite',
    likes: 'favorite',
    like: 'favorite',
    megusta: 'favorite',
    all: 'all',
    todo: 'all',
    todos: 'all'
};

function statusText(p) {
    const t = loadSettings().tiktokS2;
    const estado = t.enabled ? '✅ Activado' : '⛔ Desactivado';
    const destino = t.targetJid
        ? `${t.targetLabel ? `*${t.targetLabel}* ` : ''}(\`${t.targetJid}\`)`
        : '_Sin elegir_';
    const cuenta = t.username ? `*@${t.username}*` : '_Sin cuenta configurada_';
    const fuente = TIKTOK_S2_SOURCE_NAMES[t.source] || t.source;
    const modo = TIKTOK_S2_MODE_NAMES[t.mode] || t.mode;
    const dm = t.privateLinks ? '✅ Sí' : '⛔ No';

    return (
        `╭─❖ *TikTok → .s2 Automático* ❖─╮\n` +
        `│ ✿ *Estado:* ${estado}\n` +
        `│ ✿ *Destino:* ${destino}\n` +
        `│ ✿ *Cuenta TikTok:* ${cuenta}\n` +
        `│ ✿ *Detectar:* ${fuente}\n` +
        `│ ✿ *Modo .s2:* ${modo}\n` +
        `│ ✿ *Links al privado:* ${dm}\n` +
        `│ ✿ *Revisión:* cada ${t.pollSeconds}s\n` +
        `╰────────────────────────╯\n\n` +
        `*Comandos de configuración:*\n` +
        `• *${p}tiktoks2 aqui* — Enviar los .s2 a este grupo/chat\n` +
        `• *${p}tiktoks2 grupos* — Elegir grupo desde una lista\n` +
        `• *${p}tiktoks2 chat <jid|número>* — Fijar chat o grupo destino\n` +
        `• *${p}tiktoks2 user <@usuario|off>* — Cuenta de TikTok a monitorear\n` +
        `• *${p}tiktoks2 fuente <repost|posts|likes|todo>* — Qué detectar\n` +
        `• *${p}tiktoks2 modo <Escalado|Normal|BorrarN>* — Modo de .s2\n` +
        `• *${p}tiktoks2 dm <on|off>* — Convertir links enviados al privado\n` +
        `• *${p}tiktoks2 <on|off>* — Activar o pausar todo\n` +
        `• *${p}tiktoks2 test <url>* — Probar enviando un TikTok ahora`
    );
}

export default {
    command: ['tiktoks2', 'tts2', 'autos2'],
    category: 'stickers',
    isOwner: true,
    description: 'Configura el envío automático de videos de TikTok como stickers con audio (.s2).',

    /**
     * Intercepta enlaces de TikTok enviados al chat privado del bot (sin usar comando)
     * y envía el `.s2` resultante al grupo o chat configurado.
     */
    before: async ({ msg, sock, match, isOwner }) => {
        if (!msg || msg.isGroup || msg.isBot || match) return false;

        const cfg = config.tiktokS2;
        if (!cfg?.enabled || !cfg.privateLinks || !cfg.targetJid) return false;

        if (config.owner.size > 0 && !isOwner) return false;

        const text = String(msg.text || msg.body || '').trim();
        if (!text) return false;

        const url = extractTikTokUrl(text);
        if (!url) return false;

        try {
            await msg.react('🕘');
            await convertTikTokUrlToS2(
                sock,
                cfg.targetJid,
                url,
                cfg.mode,
                cfg.targetJid === msg.chat ? msg : undefined
            );
            await msg.react('✅');
        } catch (err) {
            await msg.react('❌');
            await msg.reply(
                `ꕤ No se pudo convertir el enlace de TikTok a *.s2*.\n` +
                `> ${err?.message || 'Error desconocido'}`
            );
        }
        return true;
    },

    run: async ({ sock, msg, args, usedPrefix = '.' }) => {
        const sub = (args[0] || '').toLowerCase().trim();
        const rest = args.slice(1).join(' ').trim();
        const cur = loadSettings().tiktokS2;

        if (!sub || sub === 'status' || sub === 'estado' || sub === 'info') {
            return msg.reply(statusText(usedPrefix));
        }

        if (sub === 'on' || sub === 'activar' || sub === 'enable') {
            if (!cur.targetJid) {
                return msg.reply(
                    `ꕤ Primero elige a qué grupo o chat se enviarán los stickers:\n` +
                    `• Escribe *${usedPrefix}tiktoks2 aqui* dentro del grupo deseado\n` +
                    `• O usa *${usedPrefix}tiktoks2 grupos* para elegir de una lista.`
                );
            }
            saveSettings({ tiktokS2: { ...cur, enabled: true } });
            pollTikTokAccountOnce().catch(() => {});
            return msg.reply(
                `✿ *TikTok → .s2* activado.\n` +
                `> Destino: *${cur.targetLabel || cur.targetJid}*`
            );
        }

        if (sub === 'off' || sub === 'desactivar' || sub === 'disable') {
            saveSettings({ tiktokS2: { ...cur, enabled: false } });
            return msg.reply('✿ *TikTok → .s2* ha sido pausado.');
        }

        if (sub === 'aqui' || sub === 'aquí' || sub === 'here') {
            let label = msg.chat;
            if (msg.isGroup) {
                const meta = await sock.groupMetadata(msg.chat).catch(() => null);
                if (meta?.subject) {
                    label = String(meta.subject);
                    try { db.setChat(msg.chat, 'name', label); } catch {}
                }
            } else {
                label = msg.pushName || msg.chat.split('@')[0];
            }

            saveSettings({
                tiktokS2: {
                    ...cur,
                    targetJid: msg.chat,
                    targetLabel: label,
                    enabled: true
                }
            });
            pollTikTokAccountOnce().catch(() => {});
            return msg.reply(
                `✿ Este ${msg.isGroup ? 'grupo' : 'chat'} (*${label}*) quedó configurado como destino de *TikTok → .s2* ✅`
            );
        }

        if (sub === 'grupos' || sub === 'groups' || sub === 'lista') {
            const groupsObj = await sock.groupFetchAllParticipating().catch(() => ({}));
            const entries = Object.entries(groupsObj || {})
                .filter(([jid]) => jid.endsWith('@g.us'))
                .map(([jid, meta]) => ({
                    jid,
                    subject: String(meta?.subject || jid)
                }))
                .sort((a, b) => a.subject.localeCompare(b.subject));

            if (!entries.length) {
                return msg.reply('ꕤ El bot no participa en ningún grupo actualmente.');
            }

            for (const g of entries) {
                try { db.setChat(g.jid, 'name', g.subject); } catch {}
            }

            if (typeof sock.sendList === 'function') {
                const rows = entries.slice(0, 40).map(g => ({
                    title: `${g.jid === cur.targetJid ? '★ ' : ''}${g.subject}`.slice(0, 24),
                    description: g.jid,
                    id: `${usedPrefix}tiktoks2 chat ${g.jid}`
                }));
                await sock.sendList(
                    msg.chat,
                    {
                        title: 'TikTok → .s2',
                        text: 'Selecciona el grupo donde el bot enviará automáticamente los stickers con audio (.s2):',
                        footer: config.botName || 'Denji bot',
                        buttonText: 'Elegir grupo',
                        sections: [{ title: 'Grupos disponibles', rows }]
                    },
                    msg
                );
                return;
            }

            const listTxt = entries
                .slice(0, 30)
                .map((g, i) => `${i + 1}. *${g.subject}*\n   \`${usedPrefix}tiktoks2 chat ${g.jid}\``)
                .join('\n');
            return msg.reply(`✿ *Grupos disponibles:*\n\n${listTxt}`);
        }

        if (sub === 'chat' || sub === 'grupo' || sub === 'destino' || sub === 'target') {
            if (!rest) {
                return msg.reply(
                    `ꕤ Indica el JID del grupo (\`120363...@g.us\`) o número de WhatsApp.\n` +
                    `> Ejemplo: *${usedPrefix}tiktoks2 chat 59899123456*`
                );
            }
            const jid = cleanTargetJid(rest);
            if (!jid) {
                return msg.reply('ꕤ JID o número inválido. Usa formato `120363...@g.us` o un número con código de país.');
            }
            let label = jid;
            if (jid.endsWith('@g.us')) {
                const meta = await sock.groupMetadata(jid).catch(() => null);
                if (meta?.subject) {
                    label = String(meta.subject);
                    try { db.setChat(jid, 'name', label); } catch {}
                } else {
                    const saved = db.getChat(jid);
                    if (saved?.name) label = String(saved.name);
                }
            } else {
                const u = db.getUser(jid);
                label = u?.name ? String(u.name) : `+${jid.split('@')[0]}`;
            }

            saveSettings({
                tiktokS2: {
                    ...cur,
                    targetJid: jid,
                    targetLabel: label,
                    enabled: true
                }
            });
            pollTikTokAccountOnce().catch(() => {});
            return msg.reply(`✿ Destino de *TikTok → .s2* actualizado a *${label}* (\`${jid}\`) ✅`);
        }

        if (sub === 'user' || sub === 'usuario' || sub === 'cuenta' || sub === 'tiktok') {
            if (!rest) {
                return msg.reply(
                    `ꕤ Escribe el usuario de TikTok a monitorear o *off* para quitarlo.\n` +
                    `> Ejemplo: *${usedPrefix}tiktoks2 user @miusuario*`
                );
            }
            if (['off', 'none', 'quitar', 'ninguno', 'clear'].includes(rest.toLowerCase())) {
                saveSettings({ tiktokS2: { ...cur, username: '' } });
                return msg.reply('✿ Se desactivó el monitoreo de cuenta de TikTok (los links por privado siguen disponibles).');
            }
            const username = cleanTikTokUsername(rest);
            if (!username) {
                return msg.reply('ꕤ Nombre de usuario de TikTok inválido.');
            }
            saveSettings({ tiktokS2: { ...cur, username } });
            pollTikTokAccountOnce().catch(() => {});
            return msg.reply(
                `✿ Cuenta configurada: *@${username}* (${TIKTOK_S2_SOURCE_NAMES[cur.source]}).\n` +
                `> Nota: se enviarán únicamente los videos nuevos que detecte a partir de ahora.`
            );
        }

        if (sub === 'fuente' || sub === 'source' || sub === 'detectar' || sub === 'tipo') {
            const key = rest.toLowerCase().replace(/\s+/g, '');
            const mapped = SOURCE_ALIASES[key];
            if (!mapped) {
                return msg.reply(
                    `ꕤ Elige qué detectar en la cuenta de TikTok:\n` +
                    `• *${usedPrefix}tiktoks2 fuente repost* — Republicados\n` +
                    `• *${usedPrefix}tiktoks2 fuente posts* — Videos subidos\n` +
                    `• *${usedPrefix}tiktoks2 fuente likes* — Me gusta públicos\n` +
                    `• *${usedPrefix}tiktoks2 fuente todo* — Todo lo anterior`
                );
            }
            saveSettings({ tiktokS2: { ...cur, source: mapped } });
            pollTikTokAccountOnce().catch(() => {});
            return msg.reply(`✿ Fuente actualizada a: *${TIKTOK_S2_SOURCE_NAMES[mapped]}* ✅`);
        }

        if (sub === 'modo' || sub === 'mode') {
            const mode = parseS2Mode(rest);
            if (!mode) {
                return msg.reply(
                    `ꕤ Modo inválido. Modos disponibles:\n` +
                    `• *${usedPrefix}tiktoks2 modo Escalado*\n` +
                    `• *${usedPrefix}tiktoks2 modo Normal*\n` +
                    `• *${usedPrefix}tiktoks2 modo BorrarN*`
                );
            }
            saveSettings({ tiktokS2: { ...cur, mode } });
            return msg.reply(`✿ Modo automático de *.s2* cambiado a: *${TIKTOK_S2_MODE_NAMES[mode]}* ✅`);
        }

        if (sub === 'dm' || sub === 'privado' || sub === 'links') {
            const val = rest.toLowerCase();
            const next = val === 'on' || val === 'si' || val === 'sí'
                ? true
                : val === 'off' || val === 'no'
                    ? false
                    : !cur.privateLinks;
            saveSettings({ tiktokS2: { ...cur, privateLinks: next } });
            return msg.reply(
                `✿ Conversión automática de links enviados al privado: *${next ? 'Activada ✅' : 'Desactivada ⛔'}*`
            );
        }

        if (sub === 'intervalo' || sub === 'poll' || sub === 'tiempo') {
            const secs = Number(rest);
            if (!Number.isFinite(secs) || secs < 20 || secs > 600) {
                return msg.reply(`ꕤ Indica un intervalo entre *20* y *600* segundos.\n> Ejemplo: *${usedPrefix}tiktoks2 intervalo 45*`);
            }
            const rounded = Math.round(secs);
            saveSettings({ tiktokS2: { ...cur, pollSeconds: rounded } });
            return msg.reply(`✿ Intervalo de revisión ajustado a cada *${rounded}s* ✅`);
        }

        if (sub === 'test' || sub === 'probar') {
            const url = extractTikTokUrl(rest);
            if (!url) {
                return msg.reply(`ꕤ Pasa un enlace válido de TikTok.\n> Ejemplo: *${usedPrefix}tiktoks2 test https://vm.tiktok.com/...*`);
            }
            const target = cur.targetJid || msg.chat;
            await msg.react('🕘');
            try {
                await convertTikTokUrlToS2(
                    sock,
                    target,
                    url,
                    cur.mode,
                    target === msg.chat ? msg : undefined
                );
                await msg.react('✅');
                if (target !== msg.chat) {
                    await msg.reply(`✿ Sticker con audio enviado a *${cur.targetLabel || target}* ✅`);
                }
            } catch (err) {
                await msg.react('❌');
                return msg.reply(`ꕤ Falló la prueba: ${err?.message || err}`);
            }
            return;
        }

        return msg.reply(statusText(usedPrefix));
    }
};
