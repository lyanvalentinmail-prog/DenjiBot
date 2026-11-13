import type { MenuTheme } from './settings.ts';

/*
 * Estilos del menú.
 *
 * Cada estilo define cómo se escribe el menú (saludo, datos, categorías y
 * pie). Este archivo no depende del bot ni de WhatsApp: lo usan tanto
 * `commands/main/menu.ts` como el panel de `npm start`, que muestra un
 * ejemplo de cada estilo en "Personalizar bot › Estilo del menú".
 *
 * Para crear un estilo nuevo: añade su nombre a `MenuTheme`, `MENU_THEMES` y
 * `MENU_THEME_NAMES` en `lib/settings.ts` y su definición en `STYLES`.
 */

export interface MenuData {
    botName: string;
    devName: string;
    coin: string;
    prefix: string;
    user: string;
    total: number;
    link: string;
}

export interface MenuCommand {
    /** Nombres del comando (el principal y, como mucho, un alias). */
    cmd: string[];
    desc: string;
    usage: string;
}

export interface MenuCategory {
    name: string;
    emoji: string;
    commands: MenuCommand[];
}

interface StyleDef {
    /** Texto del menú de lista (el mensaje con el botón de categorías). */
    intro(d: MenuData): string;
    buttonText: string;
    sectionTitle: string;
    rowTitle(category: MenuCategory): string;
    fullRowTitle: string;
    /** Cabecera del menú de texto. */
    header(d: MenuData): string;
    category(category: MenuCategory, d: MenuData): string;
    footer(d: MenuData): string;
}

/** Caracteres invisibles que hacen que WhatsApp pliegue el mensaje con "Leer más". */
export const READ_MORE = String.fromCharCode(8206).repeat(4000);

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const STYLES: Record<MenuTheme, StyleDef> = {
    // ───────────── Denji style: el diseño original del bot ─────────────
    denji: {
        intro: d =>
            `「 ꕤ 」 ¡Hola! *${d.user}*, soy *${d.botName}*.\n\n` +
            `ׅ  ׄ  ✿ *Desarrollador* » ${d.devName}\n` +
            `ׅ  ׄ  ✿ *Moneda* » ${d.coin}\n` +
            `ׅ  ׄ  ✿ *Comandos* » ${d.total}\n` +
            `ׅ  ׄ  ✿ *Prefijo* » ${d.prefix}\n\n` +
            `Toca el botón para elegir una categoría.\n` +
            `> Si no ves el botón, usa *${d.prefix}menu todo*`,
        buttonText: 'Ver categorías',
        sectionTitle: 'Categorías',
        rowTitle: c => `${c.emoji} ${c.name.toUpperCase()}`,
        fullRowTitle: '📋 Menú completo',
        header: d =>
            `︶⊹︶︶୨୧︶︶⊹︶︶⊹︶︶୨୧︶︶⊹\n` +
            `「 ꕤ 」 ¡Hola! *${d.user}*, Soy *${d.botName}*, Aquí tienes la lista de comandos.\n` +
            `> Para Ver Tu Perfil Usa *${d.prefix}perfil* 𝜗ৎ\n\n` +
            `‿    ׅ   𝆬     ε❤︎︭з   𝆬     ׅ      ‿\n\n` +
            `ׅ  ׄ  ✿ *Modo* » Premium\n` +
            `ׅ  ׄ  ✿ *Desarrollador* » ${d.devName}\n` +
            `ׅ  ׄ  ✿ *Moneda* » ${d.coin}\n` +
            `ׅ  ׄ  ✿ *Comandos* » ${d.total}\n` +
            `ׅ  ׄ  ✿ *Link* » ${d.link}\n\n` +
            `‿    ׅ   𝆬     ε❤︎︭з   𝆬     ׅ      ‿\n` +
            `${READ_MORE}\n\n` +
            `⋆｡ﾟ☁︎ ｡° *ᴄᴏᴍ꯭ᴀ꯭ɴᴅᴏs* ﾟ｡˚₊ 𓂃\n`,
        category: (c, d) => {
            let text = `\n☕︎  𝀢  デンジᅟ֪   ﹙ *\`${c.name.toUpperCase()}\`* ﹚ᅟ ㅤ✿\n\n`;
            for (const item of c.commands) {
                const names = item.cmd.map(a => `*${d.prefix}${a}*`).join(' › ');
                const usage = item.usage ? ` + _${item.usage}_` : '';
                text += `❀   ᠀᠀ㅤ۟ ${c.emoji}  ${names}${usage}\n> ── 𑁪ㅤׅㅤ۫  ${item.desc}\n`;
            }
            return text + `\n ㅤׅㅤ۫ㅤㅤ      ﹙❀﹚ㅤׅㅤㅤ˚ㅤ\n`;
        },
        footer: d => `\n> ׅ  ׄ  ✿  Made with love by *${d.devName}*`
    },

    // ───────────── Chainsaw man style: cadenas, sierra y sangre ─────────────
    chainsaw: {
        intro: d =>
            `🪚 *CHAINSAW MAN* 🪚\n\n` +
            `🩸 ¡Vrrrm! *${d.user}*, soy *${d.botName}*.\n\n` +
            `⛓️ *Desarrollador* » ${d.devName}\n` +
            `⛓️ *Moneda* » ${d.coin}\n` +
            `⛓️ *Comandos* » ${d.total}\n` +
            `⛓️ *Prefijo* » ${d.prefix}\n\n` +
            `Tira de la cuerda: toca el botón y elige una categoría.\n` +
            `> Si no ves el botón, usa *${d.prefix}menu todo*`,
        buttonText: '🪚 Categorías',
        sectionTitle: 'Categorías',
        rowTitle: c => `⛓️ ${c.name.toUpperCase()}`,
        fullRowTitle: '🪚 Menú completo',
        header: d =>
            `⛓️━━━━━━━━━━━━━━⛓️\n` +
            `   🪚 *CHAINSAW MAN* 🪚\n` +
            `⛓️━━━━━━━━━━━━━━⛓️\n\n` +
            `🩸 ¡Vrrrm! *${d.user}*, soy *${d.botName}*.\n` +
            `> Tira de la cuerda y elige un comando.\n\n` +
            `┏━━〔 🪚 *INFO* 〕\n` +
            `┃ 🩸 *Desarrollador* » ${d.devName}\n` +
            `┃ 🩸 *Moneda* » ${d.coin}\n` +
            `┃ 🩸 *Comandos* » ${d.total}\n` +
            `┃ 🩸 *Prefijo* » ${d.prefix}\n` +
            `┃ 🩸 *Link* » ${d.link}\n` +
            `┗━━━━━━━━━━━━━⛓️\n` +
            `${READ_MORE}\n`,
        category: (c, d) => {
            let text = `\n┏━━〔 🪚 *${c.name.toUpperCase()}* 〕\n`;
            for (const item of c.commands) {
                const names = item.cmd.map(a => `*${d.prefix}${a}*`).join(' › ');
                const usage = item.usage ? ` + _${item.usage}_` : '';
                text += `┃ 🩸 ${names}${usage}\n┃ ╰ ${item.desc}\n`;
            }
            return text + `┗━━━━━━━━━━━━━⛓️\n`;
        },
        footer: d => `\n> 🪚 *${d.botName}* · by *${d.devName}*`
    },

    // ───────────── Simple style: limpio, sin adornos ─────────────
    simple: {
        intro: d =>
            `*${d.botName}*\n` +
            `Hola, *${d.user}*.\n\n` +
            `Desarrollador: ${d.devName}\n` +
            `Moneda: ${d.coin}\n` +
            `Comandos: ${d.total}\n` +
            `Prefijo: ${d.prefix}\n\n` +
            `Toca el botón para elegir una categoría.\n` +
            `Si no ves el botón, usa *${d.prefix}menu todo*`,
        buttonText: 'Categorías',
        sectionTitle: 'Categorías',
        rowTitle: c => cap(c.name),
        fullRowTitle: 'Menú completo',
        header: d =>
            `*${d.botName}*\n` +
            `Hola, *${d.user}*. Estos son los comandos.\n\n` +
            `Desarrollador: ${d.devName}\n` +
            `Moneda: ${d.coin}\n` +
            `Comandos: ${d.total}\n` +
            `Prefijo: ${d.prefix}\n` +
            `Link: ${d.link}\n` +
            `${READ_MORE}\n`,
        category: (c, d) => {
            let text = `\n*${c.name.toUpperCase()}*\n`;
            for (const item of c.commands) {
                const names = item.cmd.map(a => `*${d.prefix}${a}*`).join(', ');
                const usage = item.usage ? ` _${item.usage}_` : '';
                text += `• ${names}${usage}\n   ${item.desc}\n`;
            }
            return text;
        },
        footer: d => `\n${d.botName} · ${d.devName}`
    }
};

const styleOf = (theme: MenuTheme): StyleDef => STYLES[theme] || STYLES.denji;

/** Textos del menú de lista para un estilo. */
export function listTexts(theme: MenuTheme, d: MenuData): {
    text: string; buttonText: string; sectionTitle: string; fullRowTitle: string; rowTitle(category: MenuCategory): string;
} {
    const style = styleOf(theme);
    return {
        text: style.intro(d),
        buttonText: style.buttonText,
        sectionTitle: style.sectionTitle,
        fullRowTitle: style.fullRowTitle,
        rowTitle: category => style.rowTitle(category).slice(0, 24)
    };
}

/** Menú de texto completo (o de las categorías que se pasen) en un estilo. */
export function renderMenu(theme: MenuTheme, d: MenuData, categories: MenuCategory[]): string {
    const style = styleOf(theme);
    let text = style.header(d);
    for (const category of categories) text += style.category(category, d);
    return text + style.footer(d);
}

/** Menú de ejemplo, corto, para enseñar cómo se ve un estilo. */
export function sampleMenu(theme: MenuTheme, d: MenuData): string {
    return renderMenu(theme, d, [
        {
            name: 'stickers',
            emoji: '⭐',
            commands: [
                { cmd: ['sticker', 's'], desc: 'Convierte una imagen o video en sticker', usage: '' },
                { cmd: ['spack', 'stickerpack'], desc: 'Crea un pack de stickers con tus fotos', usage: '[nombre | autor]' }
            ]
        },
        {
            name: 'tools',
            emoji: '💐',
            commands: [
                { cmd: ['hora', 'time'], desc: 'Muestra la hora exacta', usage: '[país o ciudad]' }
            ]
        }
    ]).replace(READ_MORE, '');
}
