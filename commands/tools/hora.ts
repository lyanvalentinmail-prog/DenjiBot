import config from '#config';
import { UserJid } from '#simple';
import { clockFragment, clockHtml, clockInfo, findZone, systemZone, zoneForNumber } from '../../lib/clock.ts';
import type { Zone } from '../../lib/clock.ts';
import { sendHtml } from '../../lib/richhtml.ts';

const numberOf = (jid: string): string =>
    jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : '';

// `.hora archivo [lugar]` envía el reloj como archivo .html en vez de mostrarlo en el chat.
const fileWords = new Set(['archivo', 'file', 'html', 'documento']);

export default {
    command: ['hora', 'time', 'reloj'],
    description: 'Muestra la hora exacta con un reloj en vivo dentro del chat',
    usage: '[país o ciudad]',
    category: 'tools',
    run: async ({ sock, msg, chat, usedPrefix, prefix }: any) => {
        const p = usedPrefix || prefix || config.prefix || '.';
        let query = String(msg.body || '').trim().replace(/^\S+\s*/, '');

        const first = query.split(/\s+/)[0]?.toLowerCase() || '';
        const wantsFile = fileWords.has(first);
        if (wantsFile) query = query.replace(/^\S+\s*/, '');

        let target: Zone | null;
        let guessed = false;

        if (query) {
            target = findZone(query);
            if (!target) {
                return msg.reply(
                    `ׅ  ׄ  ✿ No encontré la zona horaria de *${query.slice(0, 40)}*.\n\n` +
                    `> Prueba con un país o una ciudad: *${p}hora mexico*, *${p}hora madrid*, *${p}hora tokio*\n` +
                    `> También sirve el nombre completo: *${p}hora America/Bogota*`);
            }
        } else {
            // Sin lugar: la zona del país de quien pregunta, según su número.
            const sender = msg.key?.fromMe ? '' : numberOf(UserJid(sock, chat, msg.sender) || '');
            const bot = numberOf(UserJid(sock, undefined, String(sock.user?.id || '').replace(/:\d+@/, '@')) || '');
            target = zoneForNumber(sender) || zoneForNumber(bot) || systemZone();
            guessed = true;
        }

        const now = new Date();
        const info = clockInfo(target.zone, now);

        const summary =
            `ׅ  ׄ  ✿ *Hora exacta*\n\n` +
            `ׅ  ׄ  ✿ *Hora* » ${info.time}\n` +
            `ׅ  ׄ  ✿ *Fecha* » ${info.date}\n` +
            `ׅ  ׄ  ✿ *Zona* » ${target.label} (${target.zone}, ${info.offset})`;
        const otherPlace = guessed ? `\n> Para otro lugar usa *${p}hora país o ciudad*` : '';
        const place = guessed ? '' : ` ${query}`;

        // 1. El reloj dentro del chat (vista HTML). No va como respuesta citada:
        //    el sobre debe quedar tal cual para que WhatsApp lo dibuje.
        if (!wantsFile) {
            try {
                await sendHtml(sock, chat, clockFragment(target, config.botName, now),
                    `Hora exacta · ${target.label}\n${info.time} · ${info.date}`);
                await msg.reply(`${summary}\n\n> ¿No ves el reloj en el chat? Usa *${p}hora archivo${place}*${otherPlace}`);
                return;
            } catch (error: any) {
                console.error('[HORA] No se pudo enviar el reloj al chat, se envía como archivo:', error?.message || error);
            }
        }

        // 2. El reloj como archivo .html (se abre con el navegador).
        try {
            await sock.sendMessage(chat, {
                document: Buffer.from(clockHtml(target, config.botName, now), 'utf8'),
                mimetype: 'text/html',
                fileName: 'Hora exacta.html',
                caption: `${summary}\n\n> Abre el archivo para ver el reloj en vivo.${otherPlace}`
            }, { quoted: msg });
        } catch (error) {
            console.error('[HORA] No se pudo enviar el archivo:', error);
            await msg.reply(summary + (otherPlace ? `\n${otherPlace}` : ''));
        }
    }
};
