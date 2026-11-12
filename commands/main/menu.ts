import config from '#config';
import { sendList } from '#interactive';

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

const rmore = String.fromCharCode(8206).repeat(4000);

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
            const url = config.banner;
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

            // Menú de lista: un mensaje interactivo con las categorías; al elegir
            // una, WhatsApp envía `.menu <categoría>` y se responde con sus comandos.
            if (listMode && !carg && !wantsFull) {
                try {
                    const rows = scats.map(c => ({
                        title: `${emojis[c] || '✦'} ${c.toUpperCase()}`.slice(0, 24),
                        description: `${cats.get(c)!.length} comandos`,
                        id: `${p}menu ${c}`
                    }));

                    await sendList(sock, chat, {
                        title: config.botName,
                        text:
                            `「 ꕤ 」 ¡Hola! *${user}*, soy *${config.botName}*.\n\n` +
                            `ׅ  ׄ  ✿ *Desarrollador* » ${config.devName}\n` +
                            `ׅ  ׄ  ✿ *Moneda* » ${config.coin || '¥enes'}\n` +
                            `ׅ  ׄ  ✿ *Comandos* » ${tot}\n` +
                            `ׅ  ׄ  ✿ *Prefijo* » ${p}\n\n` +
                            `Toca el botón para elegir una categoría.\n` +
                            `> Si no ves el botón, usa *${p}menu todo*`,
                        footer: config.botName,
                        buttonText: 'Ver categorías',
                        image: url || undefined,
                        sections: [
                            { title: 'Categorías', rows },
                            {
                                title: 'Otros',
                                rows: [{
                                    title: '📋 Menú completo',
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

            let menu = `︶⊹︶︶୨୧︶︶⊹︶︶⊹︶︶୨୧︶︶⊹\n「 ꕤ 」 ¡Hola! *${user}*, Soy *${config.botName}*, Aquí tienes la lista de comandos.\n> Para Ver Tu Perfil Usa *${p}perfil* 𝜗ৎ\n\n‿    ׅ   𝆬     ε❤︎︭з   𝆬     ׅ      ‿\n\nׅ  ׄ  ✿ *Modo* » Premium\nׅ  ׄ  ✿ *Desarrollador* » ${config.devName}\nׅ  ׄ  ✿ *Moneda* » ${config.coin || '¥enes'}\nׅ  ׄ  ✿ *Comandos* » ${tot}\nׅ  ׄ  ✿ *Link* » ${link}\n\n‿    ׅ   𝆬     ε❤︎︭з   𝆬     ׅ      ‿\n${rmore}\n\n⋆｡ﾟ☁︎ ｡° *ᴄᴏᴍ꯭ᴀ꯭ɴᴅᴏs* ﾟ｡˚₊ 𓂃\n`;

            for (let i = 0; i < scats.length; i++) {
                const c = scats[i];
                const cmds = cats.get(c)!;
                const cname = c.toUpperCase();
                const cemo = emojis[c] || '✦';

                menu += `\n☕︎  𝀢  デンジᅟ֪   ﹙ *\`${cname}\`* ﹚ᅟ ㅤ✿\n\n`;
                for (let j = 0; j < cmds.length; j++) {
                    const item = cmds[j];
                    const astr = item.cmd.map(a => `*${p}${a}*`).join(' › ');
                    const utxt = item.usage ? ` + _${item.usage}_` : '';
                    menu += `❀   ᠀᠀ㅤ۟ ${cemo}  ${astr}${utxt}\n> ── 𑁪ㅤׅㅤ۫  ${item.desc}\n`;
                }
                menu += `\n ㅤׅㅤ۫ㅤㅤ      ﹙❀﹚ㅤׅㅤㅤ˚ㅤ\n`;
            }

            menu += `\n> ׅ  ׄ  ✿  Made with love by *${config.devName}*`;

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
