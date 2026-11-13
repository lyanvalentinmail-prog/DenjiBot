import config from '#config';
import { sendList } from '#interactive';
import { listTexts, renderMenu } from '../../lib/menustyles.ts';
import type { MenuCategory, MenuData } from '../../lib/menustyles.ts';

const ord = ['main', 'info', 'download', 'profile', 'admin', 'stickers', 'tools', 'utils', 'fun', 'game', 'economy', 'gacha', 'anime', 'nsfw', 'otros', 'logo'];
const idx = new Map(ord.map((c, i) => [c, i]));

const emojis: { [k: string]: string } = {
    'main': '☁️',
    'info': '🌷',
    'download': '🛍️',
    'profile': '🌸',
    'admin': '🦋',
    'stickers': '⭐',
    'tools': '💐',
    'utils': '🍚',
    'fun': '🪼',
    'game': '🎮',
    'economy': '🪷',
    'gacha': '🎴',
    'anime': '🧈',
    'nsfw': '🍓',
    'otros': '❀',
    'logo': '🍰'
};

// `.menu todo` muestra siempre el menú completo en texto, sea cual sea el estilo.
const fullWords = new Set(['todo', 'todos', 'all', 'completo']);

export default {
    command: ['menu', 'help', 'comandos'],
    description: 'Muestra el menú completo del bot',
    category: 'main',
    group: true,
    run: async (ctx: any) => {
        const { sock, msg, chat, args, usedPrefix, prefix } = ctx;
        const p = usedPrefix || prefix || config.prefix || '.';

        try {
            // Banner del estilo activo (si no tiene uno propio, es el principal).
            const url = config.menuBanner || config.banner;
            const user = msg.pushName || 'Usuario';
            const link = 'https://github.com/lyanvalentinmail-prog/DenjiBot';
            const plg = global.plugins || {};
            const keys = Object.keys(plg);

            let tot = 0;
            const firstArg = args[0]?.toLowerCase();
            const wantsFull = fullWords.has(firstArg);
            const carg = wantsFull ? undefined : firstArg;
            const listMode = config.menuStyle === 'lista';
            const cats: Map<string, { cmd: string[]; desc: string; usage: string; key: string }[]> = new Map();
            const seen: Map<string, Set<string>> = new Map();

            for (let i = 0; i < keys.length; i++) {
                const item = plg[keys[i]];
                if (!item?.command || item.owner === true) continue;
                
                tot++;

                const cat = (item.category || 'otros').toLowerCase();
                if (carg && cat !== carg) continue;

                const ali = Array.isArray(item.command) ? item.command : [item.command];
                const uali = Array.from(new Set(ali));
                const k = uali.join('|');

                if (!seen.has(cat)) {
                    seen.set(cat, new Set());
                    cats.set(cat, []);
                }

                const s = seen.get(cat)!;
                if (!s.has(k)) {
                    s.add(k);
                    cats.get(cat)!.push({
                        cmd: uali.slice(0, 2),
                        desc: item.description || 'Sin descripción',
                        usage: item.usage || '',
                        key: k
                    });
                }
            }

            if (carg && !cats.has(carg)) {
                return msg.reply(`《✤》 La categoría *${carg}* no fue encontrada.`);
            }

            const scats = Array.from(cats.keys()).sort((a, b) => {
                const ia = idx.has(a) ? idx.get(a)! : 999;
                const ib = idx.has(b) ? idx.get(b)! : 999;
                if (ia !== ib) return ia - ib;
                return a.localeCompare(b);
            });

            const theme = config.menuTheme;
            const data: MenuData = {
                botName: config.botName,
                devName: config.devName,
                coin: config.coin || '¥enes',
                prefix: p,
                user,
                total: tot,
                link
            };
            const list: MenuCategory[] = scats.map(c => ({
                name: c,
                emoji: emojis[c] || '✦',
                commands: cats.get(c)!
            }));

            // Menú de lista: un mensaje interactivo con las categorías; al elegir
            // una, WhatsApp envía `.menu <categoría>` y se responde con sus comandos.
            if (listMode && !carg && !wantsFull) {
                try {
                    const texts = listTexts(theme, data);
                    const rows = list.map(c => ({
                        title: texts.rowTitle(c),
                        description: `${c.commands.length} comandos`,
                        id: `${p}menu ${c.name}`
                    }));

                    await sendList(sock, chat, {
                        title: config.botName,
                        text: texts.text,
                        footer: config.botName,
                        buttonText: texts.buttonText,
                        image: url || undefined,
                        sections: [
                            { title: texts.sectionTitle, rows },
                            {
                                title: 'Otros',
                                rows: [{
                                    title: texts.fullRowTitle,
                                    description: 'Todos los comandos en un solo mensaje',
                                    id: `${p}menu todo`
                                }]
                            }
                        ]
                    }, msg);
                    return;
                } catch (e) {
                    console.error('[MENU] No se pudo enviar el menú de lista, se usa el de texto:', e);
                }
            }

            const menu = renderMenu(theme, data, list);

            // En modo lista, la vista de una categoría va solo en texto (más rápida).
            const body = url && !(listMode && carg)
                ? { image: { url }, caption: menu }
                : { text: menu };

            sock.sendMessage(chat, body, { quoted: msg });

        } catch (e: any) {
            console.error(e);
            msg.reply('《✤》 Ocurrió un error al generar el menú.');
        }
    }
};
