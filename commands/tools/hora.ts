import config from '#config';
import { UserJid } from '#simple';
import { clockFragment, clockHtml, clockInfo, findZone, systemZone, zoneForNumber } from '../../lib/clock.ts';
import type { Zone } from '../../lib/clock.ts';
import { clockImage } from '../../lib/clockimage.ts';
import { sendHtml } from '../../lib/richhtml.ts';
import type { ClockView } from '../../lib/settings.ts';

const numberOf = (jid: string): string =>
    jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : '';

// Primera palabra de `.hora <forma> [lugar]`: elige la forma solo para ese mensaje.
const VIEW_WORDS: Record<string, ClockView> = {
    chat: 'chat', html: 'chat', vivo: 'chat', live: 'chat',
    imagen: 'imagen', img: 'imagen', foto: 'imagen', image: 'imagen',
    archivo: 'archivo', file: 'archivo', documento: 'archivo'
};

export default {
    command: ['hora', 'time', 'reloj'],
    description: 'Muestra la hora exacta con un reloj dentro del chat',
    usage: '[país o ciudad]',
    category: 'tools',
    run: async ({ sock, msg, chat, usedPrefix, prefix }: any) => {
        const p = usedPrefix || prefix || config.prefix || '.';
        let query = String(msg.body || '').trim().replace(/^\S+\s*/, '');

        const first = query.split(/\s+/)[0]?.toLowerCase() || '';
        const asked = VIEW_WORDS[first];
        if (asked) query = query.replace(/^\S+\s*/, '');
        const view: ClockView = asked || config.clockView || 'auto';

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
        const zone = target;

        const summary =
            `ׅ  ׄ  ✿ *Hora exacta*\n\n` +
            `ׅ  ׄ  ✿ *Hora* » ${info.time}\n` +
            `ׅ  ׄ  ✿ *Fecha* » ${info.date}\n` +
            `ׅ  ׄ  ✿ *Zona* » ${zone.label} (${zone.zone}, ${info.offset})`;
        const otherPlace = guessed ? `\n> Para otro lugar usa *${p}hora país o ciudad*` : '';
        const place = guessed ? '' : ` ${query}`;

        /** El reloj en vivo dentro del chat (vista HTML). */
        const sendLive = async (): Promise<boolean> => {
            try {
                // No va como respuesta citada: el sobre debe quedar tal cual para que WhatsApp lo dibuje.
                await sendHtml(sock, chat, clockFragment(zone, config.botName, now), {
                    title: `Hora exacta · ${zone.label}`,
                    // Lo que muestran WhatsApp Web y Escritorio, que no dibujan la vista.
                    label: `Hora exacta · ${zone.label}\n${info.time} · ${info.date}`
                });
                return true;
            } catch (error: any) {
                console.error('[HORA] No se pudo enviar el reloj en vivo:', error?.message || error);
                return false;
            }
        };

        /** El reloj como imagen: se ve en cualquier WhatsApp. */
        const sendImage = async (caption: string): Promise<boolean> => {
            try {
                await sock.sendMessage(chat, {
                    image: clockImage(zone, config.botName, now),
                    mimetype: 'image/png',
                    caption
                }, { quoted: msg });
                return true;
            } catch (error: any) {
                console.error('[HORA] No se pudo enviar la imagen del reloj:', error?.message || error);
                return false;
            }
        };

        /** El reloj como archivo .html (se abre con el navegador). */
        const sendFile = async (): Promise<boolean> => {
            try {
                await sock.sendMessage(chat, {
                    document: Buffer.from(clockHtml(zone, config.botName, now), 'utf8'),
                    mimetype: 'text/html',
                    fileName: 'Hora exacta.html',
                    caption: `${summary}\n\n> Abre el archivo con tu navegador para ver el reloj en vivo.${otherPlace}`
                }, { quoted: msg });
                return true;
            } catch (error: any) {
                console.error('[HORA] No se pudo enviar el archivo:', error?.message || error);
                return false;
            }
        };

        const plain = (): Promise<any> => msg.reply(summary + (otherPlace ? `\n${otherPlace}` : ''));

        if (view === 'archivo') {
            if (!await sendFile()) await plain();
            return;
        }

        if (view === 'imagen') {
            if (!await sendImage(`${summary}${otherPlace ? `\n${otherPlace}` : ''}`)) await plain();
            return;
        }

        const live = await sendLive();

        if (view === 'chat') {
            if (live) {
                await msg.reply(`${summary}\n\n> ¿No ves el reloj en vivo? Usa *${p}hora imagen${place}*${otherPlace}`);
            } else if (!await sendImage(`${summary}${otherPlace ? `\n${otherPlace}` : ''}`)) {
                await plain();
            }
            return;
        }

        // Automático: el reloj en vivo y, debajo, la imagen, que se ve siempre.
        const note = live ? `\n\n> Arriba va el reloj en vivo (solo se ve en la app del teléfono).` : '';
        if (!await sendImage(`${summary}${note}${otherPlace}`)) await plain();
    }
};
