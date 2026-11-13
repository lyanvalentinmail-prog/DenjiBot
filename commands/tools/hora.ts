import config from '#config';
import { UserJid } from '#simple';
import { clockHtml, clockInfo, findZone, systemZone, zoneForNumber } from '../../lib/clock.ts';
import type { Zone } from '../../lib/clock.ts';

const numberOf = (jid: string): string =>
    jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : '';

export default {
    command: ['hora', 'time', 'reloj'],
    description: 'Muestra la hora exacta con un reloj que puedes abrir',
    usage: '[país o ciudad]',
    category: 'tools',
    run: async ({ sock, msg, chat, usedPrefix, prefix }: any) => {
        const p = usedPrefix || prefix || config.prefix || '.';
        const query = String(msg.body || '').trim().replace(/^\S+\s*/, '');

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
        const html = clockHtml(target, config.botName, now);

        const caption =
            `ׅ  ׄ  ✿ *Hora exacta*\n\n` +
            `ׅ  ׄ  ✿ *Hora* » ${info.time}\n` +
            `ׅ  ׄ  ✿ *Fecha* » ${info.date}\n` +
            `ׅ  ׄ  ✿ *Zona* » ${target.label} (${target.zone}, ${info.offset})\n\n` +
            `> Abre el archivo para ver el reloj en vivo.` +
            (guessed ? `\n> Para otro lugar usa *${p}hora país o ciudad*` : '');

        try {
            await sock.sendMessage(chat, {
                document: Buffer.from(html, 'utf8'),
                mimetype: 'text/html',
                fileName: 'Hora exacta.html',
                caption
            }, { quoted: msg });
        } catch (error) {
            console.error('[HORA] No se pudo enviar el archivo:', error);
            await msg.reply(caption.replace('\n\n> Abre el archivo para ver el reloj en vivo.', ''));
        }
    }
};
