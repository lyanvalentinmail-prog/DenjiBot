import type { MenuTheme } from './settings.ts';

/*
 * Estilos del menú (Yuki, Denji, Chainsaw man, Mystic, Gata, Alya, Michi,
 * Loli, Shadow y Simple).
 *
 * Cada comando muestra su nombre arriba y su descripción debajo como cita de
 * WhatsApp (`> Descripción`), sin amontonar alias ni texto en una sola línea.
 *
 * No depende de WhatsApp: lo usan tanto `commands/main/help.js` como el panel
 * de `npm start` ("Personalizar bot › Estilo del menú").
 */

export interface MenuData {
    botName: string;
    shortName?: string;
    devName: string;
    coin: string;
    prefix: string;
    user: string;
    userTag?: string;
    total: number;
    link: string;
    botType?: string;
    device?: string;
    date?: string;
    time?: string;
    users?: number;
    uptime?: string;
}

export interface MenuCommand {
    /** Nombres del comando (el primero es el principal). */
    cmd: string[];
    desc: string;
    usage: string;
    admin?: boolean;
}

export interface MenuCommandGroup {
    title: string;
    items: string[];
}

export interface MenuCategory {
    id: string;
    name: string;
    label: string;
    subtitle: string;
    emoji: string;
    commands: MenuCommand[];
    /** Listas compactas (p. ej. reacciones de anime agrupadas por tipo). */
    groups?: MenuCommandGroup[];
    groupsNote?: string;
    /** Total real de comandos cuando hay grupos compactos. */
    count?: number;
}

interface StyleDef {
    intro(d: MenuData): string;
    buttonText: string;
    sectionTitle: string;
    rowTitle(c: MenuCategory): string;
    fullRowTitle: string;
    header(d: MenuData): string;
    index(categories: MenuCategory[], d: MenuData): string;
    categoryHeader(c: MenuCategory, d: MenuData): string;
    category(c: MenuCategory, d: MenuData, detailed: boolean): string;
    commandDetail(item: MenuCommand & { categoryLabel: string }, d: MenuData): string;
    footer(d: MenuData, singleCategory?: boolean): string;
}

/** Caracteres invisibles que hacen que WhatsApp pliegue el mensaje con "Leer más". */
export const READ_MORE = String.fromCharCode(8206).repeat(4000);

const catCount = (c: MenuCategory): number => c.count ?? c.commands.length;

const formatGreet = (d: MenuData): string =>
    d.userTag ? `*@${d.userTag.replace(/^@+/, '')}*` : `*${d.user}*`;

/**
 * Formatea un comando con su descripción justo debajo usando cita de WhatsApp:
 *   .sticker
 *   > Convierte una imagen o video a sticker
 */
function formatCmdBlock(
    bullet: string,
    item: MenuCommand,
    prefix: string,
    detailed: boolean
): string {
    const main = `*${prefix}${item.cmd[0]}*`;
    const alt = detailed && item.cmd[1] && item.cmd[1].length <= 8
        ? ` · _${prefix}${item.cmd[1]}_`
        : '';
    const usage = item.usage ? ` _${item.usage}_` : '';
    const descLine = item.desc ? `\n> ${item.desc}` : '';
    return `${bullet}${main}${alt}${usage}${descLine}\n`;
}

function formatGroups(
    bullet: string,
    groups: MenuCommandGroup[] | undefined,
    note: string | undefined,
    prefix: string
): string {
    if (!groups?.length) return '';
    let out = '';
    for (const g of groups) {
        const list = g.items.map(name => `\`${prefix}${name}\``).join(' · ');
        out += `${bullet}*${g.title}*\n> ${list}\n`;
    }
    if (note) out += `\n> _${note}_\n`;
    return out;
}

const STYLES: Record<MenuTheme, StyleDef> = {
    // ───────────── Yuki style: inspirado en YukiBot-MD, limpio y ligero ─────────────
    yuki: {
        intro: d => {
            const when = [d.date, d.time].filter(Boolean).join(', ');
            return (
                `> 𖧧 ¡Hola! *${d.user}*, soy *${d.shortName || d.botName}* *(˶ᵔ ᵕ ᵔ˶)*\n\n` +
                `╭┈ࠢ͜┅╾─ׄ─֟─ׄ─┅ࠡ͜┈۰۰\n` +
                `│✿ *ᴅᴇᴠᴇʟᴏᴘᴇʀ ::* ${d.devName || 'Oculto'}\n` +
                `│ꕥ *ᴛʏᴘᴇ ::* ${d.botType || 'Principal'}\n` +
                `│❀ *ᴍᴏɴᴇᴅᴀ ::* ${d.coin}\n` +
                `│⚘ *ᴄᴏᴍᴀɴᴅᴏs ::* ${d.total} · *ᴘʀᴇғɪᴊᴏ ::* \`${d.prefix}\`\n` +
                (when ? `│○ *ᴛɪᴍᴇ ::* ${when}\n` : '') +
                `╰┈─ׄ֟፝─╴ ⋱࣭ ⋮֔ ⋰ ╶─ׄ֟፝─┈╯\n` +
                `> ✎ Elige una categoría en el botón o usa *${d.prefix}allmenu*`
            );
        },
        buttonText: '✿ Categorías',
        sectionTitle: '𐔌 Secciones disponibles 𐦯',
        rowTitle: c => `${c.emoji} ${c.label}`,
        fullRowTitle: 'ꕤ Menú completo',
        header: d => {
            const when = [d.date, d.time].filter(Boolean).join(', ');
            return (
                `> 𖧧 ¡Hola! ${formatGreet(d)}, soy *${d.shortName || d.botName}* *(˶ᵔ ᵕ ᵔ˶)*\n\n` +
                `╭┈ࠢ͜┅╾─ׄ─֟─ׄ─┅ࠡ͜┈۰۰\n` +
                `│✿ *ᴅᴇᴠᴇʟᴏᴘᴇʀ ::* ${d.devName || 'Oculto'}\n` +
                `│ꕥ *ᴛʏᴘᴇ ::* ${d.botType || 'Principal'}\n` +
                `│❀ *ᴍᴏɴᴇᴅᴀ ::* ${d.coin}\n` +
                `│⚘ *ᴄᴏᴍᴀɴᴅᴏs ::* ${d.total} · *ᴘʀᴇғɪᴊᴏ ::* \`${d.prefix}\`\n` +
                (d.users != null ? `│𓏸 *ᴜsᴇʀs ::* ${d.users.toLocaleString()}\n` : '') +
                (when ? `│○ *ᴛɪᴍᴇ ::* ${when}\n` : '') +
                `╰┈─ׄ֟፝─╴ ⋱࣭ ⋮֔ ⋰ ╶─ׄ֟፝─┈╯\n` +
                `> ✎ Sub-Bot: *${d.prefix}qr* / *${d.prefix}code* · Info: *${d.prefix}menu <cmd>*`
            );
        },
        index: (categories, d) => {
            let text = `\n\n╭┈─ׄ֟፝─╴𐔌 *CATEGORÍAS* 𐦯╶─ׄ֟፝─\n\n`;
            for (const c of categories) {
                text += `ꕤ *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n╰─ׄ֟፝────═̶፝֟͜═̶────ׄ֟፝─╯\n`;
            text += `> ✿ Ver todo: *${d.prefix}allmenu* · Detalle: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `> 𖧧 *${d.shortName || d.botName}* · Sección \`${c.label}\` _(${catCount(c)} comandos)_\n`,
        category: (c, d, detailed) => {
            let text = `\n╭┈─ׄ֟፝─╴𐔌 *${c.label.toUpperCase()}* 𐦯╶─ׄ֟፝─\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('ꕤ ', item, d.prefix, detailed);
            }
            text += formatGroups('❀ ', c.groups, c.groupsNote, d.prefix);
            return text + `\n╰─ׄ֟፝────═̶፝֟͜═̶────ׄ֟፝─╯\n`;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` ${item.usage}` : '';
            return (
                `╭┈─ׄ֟፝─╴𐔌 *${item.cmd[0].toUpperCase()}* 𐦯╶─ׄ֟፝─\n\n` +
                `ꕤ *${d.prefix}${item.cmd[0]}*${usage ? ` _${usage.trim()}_` : ''}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `│ꕥ *Alias ::* ${aliases}\n` : '') +
                `│❀ *Sección ::* ${item.categoryLabel}\n` +
                (item.admin ? `│⚘ *Permiso ::* Administrador\n` : '') +
                `╰─ׄ֟፝────═̶፝֟͜═̶────ׄ֟፝─╯`
            );
        },
        footer: (d, single) =>
            single
                ? `> ✿ Alias y ayuda: *${d.prefix}menu <cmd>* · Volver: *${d.prefix}menu*`
                : `\n> ✿ *${d.botName}* · ${d.devName}`
    },

    // ───────────── Denji style: estética original del bot, depurada ─────────────
    denji: {
        intro: d =>
            `「 ꕤ 」 ¡Hola, *${d.user}*! Soy *${d.botName}*.\n\n` +
            `ׅ  ׄ  ✿ *Dev* » ${d.devName}\n` +
            `ׅ  ׄ  ✿ *Moneda* » ${d.coin}\n` +
            `ׅ  ׄ  ✿ *Comandos* » ${d.total} · *Prefijo* » \`${d.prefix}\`\n\n` +
            `> Toca el botón para elegir categoría o usa *${d.prefix}allmenu*`,
        buttonText: 'Ver categorías',
        sectionTitle: 'Categorías',
        rowTitle: c => `${c.emoji} ${c.label}`,
        fullRowTitle: '📋 Menú completo',
        header: d =>
            `「 ꕤ 」 ¡Hola, ${formatGreet(d)}! Soy *${d.botName}* 𝜗ৎ\n\n` +
            `ׅ  ׄ  ✿ *Dev* » ${d.devName}\n` +
            `ׅ  ׄ  ✿ *Moneda* » ${d.coin}\n` +
            `ׅ  ׄ  ✿ *Comandos* » ${d.total} · *Prefijo* » \`${d.prefix}\`\n` +
            `ׅ  ׄ  ✿ *Perfil* » *${d.prefix}perfil* · *Sub-Bot* » *${d.prefix}code*`,
        index: (categories, d) => {
            let text = `\n\n☕︎  ﹙ *\`CATEGORÍAS\`* ﹚  ✿\n\n`;
            for (const c of categories) {
                text += `❀ ${c.emoji} *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n> ✿ Todo: *${d.prefix}allmenu* · Detalle: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `「 ꕤ 」 *${d.botName}* › *${c.label}* _(${catCount(c)})_\n`,
        category: (c, d, detailed) => {
            let text = `\n☕︎  ﹙ *\`${c.label.toUpperCase()}\`* ﹚  ${c.emoji}\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('❀ ', item, d.prefix, detailed);
            }
            text += formatGroups('✿ ', c.groups, c.groupsNote, d.prefix);
            return text;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `「 ꕤ 」 *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `ׅ  ׄ  ✿ *Alias* » ${aliases}\n` : '') +
                `ׅ  ׄ  ✿ *Categoría* » ${item.categoryLabel}` +
                (item.admin ? `\nׅ  ׄ  ✿ *Permiso* » Administrador` : '')
            );
        },
        footer: (d, single) =>
            single
                ? `\n> ✿ Detalle: *${d.prefix}menu <cmd>* · Menú: *${d.prefix}menu*`
                : `\n> ׅ  ׄ  ✿ *${d.botName}* · by *${d.devName}*`
    },

    // ───────────── Chainsaw man style: sierra y cadenas, compacto ─────────────
    chainsaw: {
        intro: d =>
            `🪚 *${d.botName.toUpperCase()}*\n` +
            `🩸 ¡Vrrrm, *${d.user}*!\n\n` +
            `⛓️ *Dev* » ${d.devName}\n` +
            `⛓️ *Moneda* » ${d.coin}\n` +
            `⛓️ *Comandos* » ${d.total} · *Prefijo* » \`${d.prefix}\`\n\n` +
            `> Tira de la cuerda en el botón o usa *${d.prefix}allmenu*`,
        buttonText: '🪚 Categorías',
        sectionTitle: 'Categorías',
        rowTitle: c => `⛓️ ${c.label}`,
        fullRowTitle: '🪚 Menú completo',
        header: d =>
            `🪚 *${d.botName.toUpperCase()}* ⛓️\n` +
            `🩸 ¡Vrrrm, ${formatGreet(d)}!\n\n` +
            `┏━━〔 *INFO* 〕\n` +
            `┃ ⛓️ *Dev* » ${d.devName}\n` +
            `┃ ⛓️ *Moneda* » ${d.coin}\n` +
            `┃ ⛓️ *Comandos* » ${d.total} · *Prefijo* » \`${d.prefix}\`\n` +
            `┗━━━━━━━━━━━⛓️`,
        index: (categories, d) => {
            let text = `\n\n━━〔 🪚 *CATEGORÍAS* 〕━━\n\n`;
            for (const c of categories) {
                text += `🩸 *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n━━━━━━━━━━━━⛓️\n`;
            text += `> 🪚 Todo: *${d.prefix}allmenu* · Detalle: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `🪚 *${d.botName}* · *${c.label}* _(${catCount(c)})_\n`,
        category: (c, d, detailed) => {
            let text = `\n━━〔 🪚 *${c.label.toUpperCase()}* 〕━━\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('🩸 ', item, d.prefix, detailed);
            }
            text += formatGroups('⛓️ ', c.groups, c.groupsNote, d.prefix);
            return text + `\n━━━━━━━━━━━━⛓️\n`;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `━━〔 🪚 *${item.cmd[0].toUpperCase()}* 〕━━\n\n` +
                `🩸 *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `⛓️ *Alias* » ${aliases}\n` : '') +
                `⛓️ *Sección* » ${item.categoryLabel}\n` +
                (item.admin ? `⛓️ *Permiso* » Admin\n` : '') +
                `━━━━━━━━━━━━⛓️`
            );
        },
        footer: (d, single) =>
            single
                ? `> 🪚 Detalle: *${d.prefix}menu <cmd>* · Menú: *${d.prefix}menu*`
                : `\n> 🪚 *${d.botName}* · *${d.devName}*`
    },

    // ───────────── Mystic style: inspirado en TheMystic-Bot-MD (cajas dobles y ✯) ─────────────
    mystic: {
        intro: d => {
            const when = [d.date, d.time].filter(Boolean).join(' · ');
            return (
                `╭═══〘 ✯✯✯✯✯✯✯ 〙═══╮\n` +
                `║ ◉— *${d.botName}* —◉\n` +
                `║≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡║\n` +
                `║➤ *Hola,* *${d.user}*\n` +
                `║➤ *Owner:* ${d.devName || 'Oculto'}\n` +
                `║➤ *Moneda:* ${d.coin}\n` +
                `║➤ *Comandos:* ${d.total} · \`${d.prefix}\`\n` +
                (d.uptime ? `║➤ *Activo:* ${d.uptime}\n` : '') +
                (when ? `║➤ *Fecha:* ${when}\n` : '') +
                `╰═══╡ ✯✯✯✯✯✯✯ ╞═══╯\n` +
                `> ✯ Abre una sección en el botón o usa *${d.prefix}allmenu*`
            );
        },
        buttonText: '✯ Secciones',
        sectionTitle: '< CATEGORÍAS />',
        rowTitle: c => `✯ ${c.label}`,
        fullRowTitle: '◉ Menú completo',
        header: d => {
            const when = [d.date, d.time].filter(Boolean).join(' · ');
            return (
                `╭═══〘 ✯✯✯✯✯✯✯ 〙═══╮\n` +
                `║ ◉— *${d.botName}* —◉\n` +
                `║≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡║\n` +
                `║➤ *Hola,* ${formatGreet(d)}\n` +
                `║≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡║\n` +
                `║➤ *Owner:* ${d.devName || 'Oculto'}\n` +
                `║➤ *Tipo:* ${d.botType || 'Principal'}\n` +
                `║➤ *Moneda:* ${d.coin}\n` +
                `║➤ *Comandos:* ${d.total} · *Prefijo:* \`${d.prefix}\`\n` +
                (d.uptime ? `║➤ *Tiempo activo:* ${d.uptime}\n` : '') +
                (d.users != null ? `║➤ *Usuarios:* ${d.users.toLocaleString()}\n` : '') +
                (when ? `║➤ *Fecha:* ${when}\n` : '') +
                `╰═══╡ ✯✯✯✯✯✯✯ ╞═══╯`
            );
        },
        index: (categories, d) => {
            let text = `\n\n┏━━━━━━━━━━━━━━━━┓\n┃ *< CATEGORÍAS />*\n┃≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡┃\n\n`;
            for (const c of categories) {
                text += `┣ ✯ *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n┗━━━━━━━━━━━━━━━━┛\n`;
            text += `> ◉ Todo: *${d.prefix}allmenu* · Detalle: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `◉— *${d.botName}* · *< ${c.label.toUpperCase()} />* _(${catCount(c)})_\n`,
        category: (c, d, detailed) => {
            let text = `\n┏━━━━━━━━━━━━━━━━┓\n┃ *< ${c.label.toUpperCase()} />* ${c.emoji}\n┃≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡┃\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('┣ ✯ ', item, d.prefix, detailed);
            }
            text += formatGroups('┣ □ ', c.groups, c.groupsNote, d.prefix);
            return text + `\n┗━━━━━━━━━━━━━━━━┛\n`;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `┏━━━━━━━━━━━━━━━━┓\n` +
                `┃ *< ${item.cmd[0].toUpperCase()} />*\n` +
                `┃≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡┃\n\n` +
                `┣ ✯ *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `┣ □ *Alias:* ${aliases}\n` : '') +
                `┣ □ *Sección:* ${item.categoryLabel}\n` +
                (item.admin ? `┣ □ *Permiso:* Administrador\n` : '') +
                `┗━━━━━━━━━━━━━━━━┛`
            );
        },
        footer: (d, single) =>
            single
                ? `> ✯ Ayuda: *${d.prefix}menu <cmd>* · Volver: *${d.prefix}menu*`
                : `\n> ◉— *${d.botName}* · ${d.devName} —◉`
    },

    // ───────────── Gata style: inspirado en GataBot-MD (❰❰ ❱❱, ➺ y checks ✓) ─────────────
    gata: {
        intro: d => {
            const when = [d.date, d.time].filter(Boolean).join(' · ');
            return (
                `🌟 ¡Hola, *${d.user}*! Bienvenid@ a *${d.botName}* 🐈\n` +
                (when ? `> _${when}_\n` : '') +
                `\n*······································*\n\n` +
                `*❰❰ Creador ❱❱* ➺ ${d.devName || 'Oculto'}\n` +
                `*❰❰ Moneda ❱❱* ➺ ${d.coin}\n` +
                `*❰❰ Comandos ❱❱* ➺ \`${d.total}\` · Prefijo \`${d.prefix}\`\n` +
                (d.uptime ? `*❰❰ Activo ❱❱* ➺ \`${d.uptime}\`\n` : '') +
                `\n*······································*\n` +
                `> 🪄 Pulsa el botón o escribe *${d.prefix}allmenu*`
            );
        },
        buttonText: '🪄 Ver menú',
        sectionTitle: '🌟 Secciones de Gata Style',
        rowTitle: c => `${c.emoji} ${c.label}`,
        fullRowTitle: '🌟 Menú completo',
        header: d => {
            const when = [d.date, d.time].filter(Boolean).join(' · ');
            return (
                `🌟 ¡Hola, ${formatGreet(d)}! Soy *${d.botName}* 🐈\n` +
                (when ? `> _${when}_\n` : '') +
                `\n*······································*\n\n` +
                `> 🌟 *INFORMACIÓN GENERAL* 🌟\n\n` +
                `*❰❰ Creador ❱❱* ➺ ${d.devName || 'Oculto'}\n` +
                `*❰❰ Modo ❱❱* ➺ \`${d.botType || 'Principal'}\`\n` +
                `*❰❰ Moneda ❱❱* ➺ ${d.coin}\n` +
                `*❰❰ Comandos ❱❱* ➺ \`${d.total}\` · Prefijo \`${d.prefix}\`\n` +
                (d.users != null ? `*❰❰ Usuarios ❱❱* ➺ \`${d.users.toLocaleString()}\`\n` : '') +
                (d.uptime ? `*❰❰ Tiempo activo ❱❱* ➺ \`${d.uptime}\`\n` : '') +
                `\n*······································*`
            );
        },
        index: (categories, d) => {
            let text = `\n\n> 🪄 *SECCIONES DISPONIBLES* 🪄\n\n`;
            for (const c of categories) {
                text += `✓ *${d.prefix}menu ${c.id}* ${c.emoji} _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n*······································*\n`;
            text += `> ✨ Menú completo: *${d.prefix}allmenu* · Info: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `🌟 *${d.botName}* ➺ *${c.label}* _(${catCount(c)} comandos)_\n*······································*\n`,
        category: (c, d, detailed) => {
            let text = `\n> ${c.emoji} *${c.label.toUpperCase()}* ${c.emoji}\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('✓ ', item, d.prefix, detailed);
            }
            text += formatGroups('➺ ', c.groups, c.groupsNote, d.prefix);
            return text + `\n*······································*\n`;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `> 🪄 *COMANDO ${item.cmd[0].toUpperCase()}* 🪄\n\n` +
                `✓ *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `*❰❰ Alias ❱❱* ➺ ${aliases}\n` : '') +
                `*❰❰ Categoría ❱❱* ➺ ${item.categoryLabel}\n` +
                (item.admin ? `*❰❰ Permiso ❱❱* ➺ Administrador\n` : '') +
                `*······································*`
            );
        },
        footer: (d, single) =>
            single
                ? `> ✨ Ayuda: *${d.prefix}menu <cmd>* · Volver: *${d.prefix}menu*`
                : `\n> 🌟 *${d.botName}* ➺ *${d.devName}*`
    },

    // ───────────── Alya style: inspirado en AlyaBot-MD (lazos ondulados y kaomojis) ─────────────
    alya: {
        intro: d =>
            `── ˙ ¡Hola, *${d.user}*! Soy *${d.shortName || d.botName}* (*${d.botType || 'Principal'}*)\n` +
            `✎ Aquí tienes la lista de comandos\n\n` +
            `︵𝆣᷼ ͡︵᷼𝆣 ᷼͡︵᷼𝆣 ᷼͡︵   ︵𝆣᷼ ͡︵᷼𝆣 ᷼͡︵᷼𝆣 ᷼͡︵\n` +
            `- 𐫦ϟ │ *Developer* ❚❙ ✿ ${d.devName || 'Oculto'}\n` +
            `- 𐫦ϟ │ *Moneda* ❚❙ ❀ ${d.coin}\n` +
            `- 𐫦ϟ │ *Comandos* ❚❙ ❖ ${d.total} · \`${d.prefix}\`\n` +
            `︶͜︶͜︶   ֪   ︶͜︶͜︶\n` +
            `> ૮(˶ᵔ ᵕ ᵔ˶)ა Elige categoría abajo o escribe *${d.prefix}allmenu*`,
        buttonText: '𐙚 Categorías',
        sectionTitle: 'ฅ^·ﻌ·^ฅ Secciones',
        rowTitle: c => `❖ ${c.label}`,
        fullRowTitle: '𐙚 Menú completo',
        header: d => {
            const when = [d.date, d.time].filter(Boolean).join(', ');
            return (
                `── ˙ ¡Hola, ${formatGreet(d)}! Soy *${d.shortName || d.botName}* (*${d.botType || 'Principal'}*)\n` +
                `✎ Aquí tienes la lista de los comandos\n\n` +
                `︵𝆣᷼ ͡︵᷼𝆣 ᷼͡︵᷼𝆣 ᷼͡︵   ︵𝆣᷼ ͡︵᷼𝆣 ᷼͡︵᷼𝆣 ᷼͡︵\n` +
                `- 𐫦ϟ │ *Developer* ❚❙ ✿ ${d.devName || 'Oculto'}\n` +
                `- 𐫦ϟ │ *Moneda* ❚❙ ❀ ${d.coin}\n` +
                `- 𐫦ϟ │ *Comandos* ❚❙ ❖ ${d.total} · Prefijo \`${d.prefix}\`\n` +
                (when ? `- 𐫦ϟ │ *Fecha* ❚❙ ☄︎ ${when}\n` : '') +
                `︶͜︶͜︶   ֪   ︶͜︶͜︶\n` +
                `> ૮(˶ᵔ ᵕ ᵔ˶)ა Sub-Bot: *${d.prefix}code* · Detalle: *${d.prefix}menu <cmd>*`
            );
        },
        index: (categories, d) => {
            let text = `\n\n˚୨ ฅ^·ﻌ·^ฅ *Secciones* ୧˚\n\n`;
            for (const c of categories) {
                text += `𖣣ֶ ❖ *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n︶͜︶͜︶   ֪   ︶͜︶͜︶\n`;
            text += `> 𐙚 Todo: *${d.prefix}allmenu* · Ficha: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `── ˙ *${d.shortName || d.botName}* ❚❙ *${c.label}* _(${catCount(c)})_ ฅ^·ﻌ·^ฅ\n`,
        category: (c, d, detailed) => {
            let text = `\n˚୨ ${c.emoji} *${c.label}* ୧˚\n︵𝆣᷼ ͡︵᷼𝆣 ᷼͡︵᷼𝆣 ᷼͡︵\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('𖣣ֶ ❖ ', item, d.prefix, detailed);
            }
            text += formatGroups('𖣣ֶ ❀ ', c.groups, c.groupsNote, d.prefix);
            return text + `\n︶͜︶͜︶   ֪   ︶͜︶͜︶\n`;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `˚୨ ❖ *${item.cmd[0]}* ୧˚\n\n` +
                `𖣣ֶ ❀ *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `- 𐫦ϟ │ *Alias* ❚❙ ${aliases}\n` : '') +
                `- 𐫦ϟ │ *Sección* ❚❙ ${item.categoryLabel}` +
                (item.admin ? `\n- 𐫦ϟ │ *Permiso* ❚❙ Administrador` : '')
            );
        },
        footer: (d, single) =>
            single
                ? `> 𐙚 Detalle: *${d.prefix}menu <cmd>* · Volver: *${d.prefix}menu*`
                : `\n> 𐙚 ❀ *${d.botName}* · ${d.devName} ˙𐙚`
    },

    // ───────────── Michi style: inspirado en MichiBot (jardín botánico y gatito 🐱🍀) ─────────────
    michi: {
        intro: d =>
            `*╭───〔 🌿 Miau 🌸 〕───*\n` +
            `*│* ¡Hola, *${d.user}*! 🐱\n` +
            `*│* Soy *${d.botName}*\n` +
            `*│*\n` +
            `*│* 🧭 *Dev:* ${d.devName || 'Oculto'}\n` +
            `*│* 💫 *Moneda:* ${d.coin}\n` +
            `*│* ✨ *Comandos:* ${d.total} · \`${d.prefix}\`\n` +
            (d.uptime ? `*│* 🪐 *Activo:* ${d.uptime}\n` : '') +
            `*╰──────────────────✦*\n` +
            `> 🍀 Elige categoría en el botón o usa *${d.prefix}allmenu*`,
        buttonText: '🍀 Categorías',
        sectionTitle: '🌿 Secciones del jardín',
        rowTitle: c => `🍃 ${c.label}`,
        fullRowTitle: '🌸 Menú completo',
        header: d =>
            `*╭───〔 🌿 Miau 🌸 〕───*\n` +
            `*│* ¡Hola, ${formatGreet(d)}! 🐱\n` +
            `*│* Usa *${d.prefix}perfil* para ver tu ficha.\n` +
            `*│*\n` +
            `*│* 🧭 *Tipo:* ${d.botType || 'Principal'}\n` +
            `*│* 👑 *Dev:* ${d.devName || 'Oculto'}\n` +
            `*│* 💫 *Moneda:* ${d.coin}\n` +
            `*│* ✨ *Comandos:* ${d.total} · Prefijo \`${d.prefix}\`\n` +
            (d.uptime ? `*│* 🪐 *Activo:* ${d.uptime}\n` : '') +
            (d.users != null ? `*│* 🌱 *Usuarios:* ${d.users.toLocaleString()}\n` : '') +
            `*╰──────────────────✦*\n\n` +
            `🌿 Usa *${d.prefix}code* para vincular un Sub-Bot 🐱`,
        index: (categories, d) => {
            let text = `\n\n*｡･:*:･ﾟ★,｡･:*:･ﾟ☆*\n╭─〔 🍃 *CATEGORÍAS* 〕──\n\n`;
            for (const c of categories) {
                text += `│ 🍀 *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n╰───────────────✦\n`;
            text += `> 🌸 Todo: *${d.prefix}allmenu* · Ayuda: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `🌿 *${d.botName}* · 「 ${c.label} 」 _(${catCount(c)})_ 🐱\n`,
        category: (c, d, detailed) => {
            let text = `\n╭─〔 🍃 *${c.label.toUpperCase()}* ${c.emoji} 〕──\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('│ 🍀 ', item, d.prefix, detailed);
            }
            text += formatGroups('│ 🌸 ', c.groups, c.groupsNote, d.prefix);
            return text + `\n╰───────────────✦\n`;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `╭─〔 🍃 *${item.cmd[0].toUpperCase()}* 〕──\n\n` +
                `│ 🍀 *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `│ 🌼 *Alias:* ${aliases}\n` : '') +
                `│ 🌿 *Categoría:* ${item.categoryLabel}\n` +
                (item.admin ? `│ 🛡️ *Permiso:* Administrador\n` : '') +
                `╰───────────────✦`
            );
        },
        footer: (d, single) =>
            single
                ? `> 🍀 Ayuda: *${d.prefix}menu <cmd>* · Volver: *${d.prefix}menu*`
                : `\n🌸 *${d.botName}* · Desarrollado por *${d.devName}* 🐱`
    },

    // ───────────── Loli style: inspirado en LoliBot-MD (etiquetas `<[ CATEGORÍA ]>`) ─────────────
    loli: {
        intro: d => {
            const when = [d.date, d.time].filter(Boolean).join(' · ');
            return (
                `「 *${d.botName}* 」\n\n` +
                `Hola 👋🏻 *${d.user}*\n\n` +
                (when ? `*• Fecha:* ${when}\n` : '') +
                `*• Dev:* ${d.devName || 'Oculto'}\n` +
                `*• Moneda:* ${d.coin}\n` +
                `*• Comandos:* ${d.total} · *Prefijo:* \`${d.prefix}\`\n` +
                (d.uptime ? `*• Tiempo activo:* ${d.uptime}\n` : '') +
                `\n> 🚀 Elige una categoría en el botón o escribe *${d.prefix}allmenu*`
            );
        },
        buttonText: '🚀 Categorías',
        sectionTitle: '<[ SECCIONES ]>',
        rowTitle: c => `${c.emoji} ${c.label}`,
        fullRowTitle: 'ℹ️ Menú completo',
        header: d => {
            const when = [d.date, d.time].filter(Boolean).join(' · ');
            return (
                `「 *${d.botName}* 」\n\n` +
                `Hola 👋🏻 ${formatGreet(d)}\n\n` +
                (when ? `*• Fecha:* ${when}\n` : '') +
                `*• Dev:* ${d.devName || 'Oculto'}\n` +
                `*• Tipo:* ${d.botType || 'Bot Oficial'}\n` +
                `*• Moneda:* ${d.coin}\n` +
                `*• Comandos:* ${d.total} · *Prefijo:* \`${d.prefix}\`\n` +
                (d.uptime ? `*• Tiempo activo:* ${d.uptime}\n` : '') +
                (d.users != null ? `*• Usuarios:* ${d.users.toLocaleString()}\n` : '') +
                `\n> ✨ Sub-Bot: *${d.prefix}code* · Info: *${d.prefix}menu <cmd>*`
            );
        },
        index: (categories, d) => {
            let text = `\n\n\`<[ 📋 CATEGORÍAS ]>\`\n\n`;
            for (const c of categories) {
                text += `• ${c.emoji} *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n> 🚀 Todo: *${d.prefix}allmenu* · Ayuda: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `「 *${d.botName}* 」 · \`<[ ${c.emoji} ${c.label.toUpperCase()} ]>\` _(${catCount(c)})_\n`,
        category: (c, d, detailed) => {
            let text = `\n\`<[ ${c.emoji} ${c.label.toUpperCase()} ]>\`\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('• ', item, d.prefix, detailed);
            }
            text += formatGroups('◦ ', c.groups, c.groupsNote, d.prefix);
            return text + '\n';
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `\`<[ 🔧 ${item.cmd[0].toUpperCase()} ]>\`\n\n` +
                `• *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `*• Alias:* ${aliases}\n` : '') +
                `*• Sección:* ${item.categoryLabel}` +
                (item.admin ? `\n*• Permiso:* Administrador` : '')
            );
        },
        footer: (d, single) =>
            single
                ? `> ℹ️ Detalle: *${d.prefix}menu <cmd>* · Menú: *${d.prefix}menu*`
                : `\n> 「 *${d.botName}* 」 · ${d.devName}`
    },

    // ───────────── Shadow style: inspirado en ShadowBot-MD / Sukuna (oscuro con 𖤐 y ⌬) ─────────────
    shadow: {
        intro: d =>
            `*╭━━❍ ${d.botName.toUpperCase()} ❍━━╮*\n` +
            `*┣━━▢* 𖤐 Hola, *${d.user}*\n` +
            `*┃* ⋄ *Dev* » ${d.devName || 'Oculto'}\n` +
            `*┃* ⋄ *Moneda* » ${d.coin}\n` +
            `*┃* ⋄ *Comandos* » ${d.total} · \`${d.prefix}\`\n` +
            (d.uptime ? `*┃* ⋄ *Activo* » ${d.uptime}\n` : '') +
            `*╰━━━╼ ⌬ 𖤐 ⌬ ╾━━━╯*\n` +
            `> ✦ Abre una categoría en el botón o usa *${d.prefix}allmenu*`,
        buttonText: '𖤐 Categorías',
        sectionTitle: '⋆﹥━⌬ SECCIONES ⌬━﹤⋆',
        rowTitle: c => `✦ ${c.label}`,
        fullRowTitle: '𖤐 Menú completo',
        header: d => {
            const when = [d.date, d.time].filter(Boolean).join(' ');
            return (
                `*╭━━❍ ${d.botName.toUpperCase()} ❍━━╮*\n` +
                `*┣━━▢* 𖤐 Hola, ${formatGreet(d)}\n` +
                `*┃╭━━━━━━━━━━━━━━╾•*\n` +
                `*┃┃* ⋄ *Dev* » ${d.devName || 'Oculto'}\n` +
                `*┃┃* ⋄ *Modo* » ${d.botType || 'Principal'}\n` +
                `*┃┃* ⋄ *Moneda* » ${d.coin}\n` +
                `*┃┃* ⋄ *Comandos* » ${d.total} · *Prefijo* » \`${d.prefix}\`\n` +
                (d.uptime ? `*┃┃* ⋄ *Activo* » ${d.uptime}\n` : '') +
                (d.users != null ? `*┃┃* ⋄ *Usuarios* » ${d.users.toLocaleString()}\n` : '') +
                (when ? `*┃┃* ⋄ *Fecha* » ${when}\n` : '') +
                `*┃╰━━━━━━━━━━━━━━╾•*\n` +
                `*╰━━━╼ ⌬ 𖤐 ⌬ ╾━━━╯*`
            );
        },
        index: (categories, d) => {
            let text = `\n\n⋆﹥━⌬ 𖤐 *CATEGORÍAS* 𖤐 ⌬━﹤⋆\n\n`;
            for (const c of categories) {
                text += `✦ *${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n╚════ ≪ •❈• ≫ ════╝\n`;
            text += `> 𖤐 Todo: *${d.prefix}allmenu* · Detalle: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `❍ *${d.botName}* » 𖤐 *${c.label.toUpperCase()}* _(${catCount(c)})_\n`,
        category: (c, d, detailed) => {
            let text = `\n⋆﹥━⌬ 𖤐 *${c.label.toUpperCase()}* ${c.emoji} 𖤐 ⌬━﹤⋆\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('✦ ', item, d.prefix, detailed);
            }
            text += formatGroups('⋄ ', c.groups, c.groupsNote, d.prefix);
            return text + `\n╚════ ≪ •❈• ≫ ════╝\n`;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `⋆﹥━⌬ 𖤐 *${item.cmd[0].toUpperCase()}* 𖤐 ⌬━﹤⋆\n\n` +
                `✦ *${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                (aliases ? `⋄ *Alias* » ${aliases}\n` : '') +
                `⋄ *Sección* » ${item.categoryLabel}\n` +
                (item.admin ? `⋄ *Permiso* » Administrador\n` : '') +
                `╚════ ≪ •❈• ≫ ════╝`
            );
        },
        footer: (d, single) =>
            single
                ? `> 𖤐 Detalle: *${d.prefix}menu <cmd>* · Volver: *${d.prefix}menu*`
                : `\n> ❍ *${d.botName}* · ${d.devName} ❍`
    },

    // ───────────── Simple style: minimalista, sin adornos ─────────────
    simple: {
        intro: d =>
            `*${d.botName}* — Hola, *${d.user}*\n\n` +
            `Dev: ${d.devName} · Moneda: ${d.coin}\n` +
            `Comandos: ${d.total} · Prefijo: \`${d.prefix}\`\n\n` +
            `> Elige una categoría o escribe *${d.prefix}allmenu*`,
        buttonText: 'Categorías',
        sectionTitle: 'Categorías',
        rowTitle: c => c.label,
        fullRowTitle: 'Menú completo',
        header: d =>
            `*${d.botName}* — Hola, ${formatGreet(d)}\n` +
            `Dev: ${d.devName} · Moneda: ${d.coin}\n` +
            `Comandos: ${d.total} · Prefijo: \`${d.prefix}\``,
        index: (categories, d) => {
            let text = `\n\n*CATEGORÍAS*\n\n`;
            for (const c of categories) {
                text += `*${d.prefix}menu ${c.id}* _(${catCount(c)})_\n> ${c.subtitle || c.label}\n`;
            }
            text += `\n> Todo: *${d.prefix}allmenu* · Ayuda: *${d.prefix}menu <cmd>*`;
            return text;
        },
        categoryHeader: (c, d) =>
            `*${d.botName}* · *${c.label}* (${catCount(c)})\n`,
        category: (c, d, detailed) => {
            let text = `\n*${c.label.toUpperCase()}*\n\n`;
            for (const item of c.commands) {
                text += formatCmdBlock('', item, d.prefix, detailed);
            }
            text += formatGroups('', c.groups, c.groupsNote, d.prefix);
            return text;
        },
        commandDetail: (item, d) => {
            const aliases = item.cmd.slice(1).map(a => `\`${d.prefix}${a}\``).join(', ');
            const usage = item.usage ? ` _${item.usage}_` : '';
            return (
                `*${d.prefix}${item.cmd[0]}*${usage}\n` +
                `> ${item.desc || 'Sin descripción'}\n\n` +
                `Categoría: ${item.categoryLabel}` +
                (aliases ? `\nAlias: ${aliases}` : '') +
                (item.admin ? `\nRequiere: administrador` : '')
            );
        },
        footer: (d, single) =>
            single
                ? `\n> Ayuda: *${d.prefix}menu <cmd>* · Volver: *${d.prefix}menu*`
                : `\n> ${d.botName} · ${d.devName}`
    }
};

const styleOf = (theme: MenuTheme): StyleDef => STYLES[theme] || STYLES.yuki;

/** Textos del menú interactivo de lista para un estilo. */
export function listTexts(theme: MenuTheme, d: MenuData): {
    text: string;
    buttonText: string;
    sectionTitle: string;
    fullRowTitle: string;
    rowTitle(category: MenuCategory): string;
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

/** Índice compacto de categorías (modo `categorias` o respaldo de `lista`). */
export function renderIndex(theme: MenuTheme, d: MenuData, categories: MenuCategory[]): string {
    const style = styleOf(theme);
    return (style.header(d) + style.index(categories, d)).trim();
}

/** Vista limpia de una sola categoría (`.menu <categoría>`). */
export function renderCategory(theme: MenuTheme, d: MenuData, category: MenuCategory): string {
    const style = styleOf(theme);
    return (
        style.categoryHeader(category, d) +
        style.category(category, d, true) +
        style.footer(d, true)
    ).trim();
}

/** Ficha breve de un comando concreto (`.menu <comando>`). */
export function renderCommandHelp(
    theme: MenuTheme,
    d: MenuData,
    item: MenuCommand & { categoryLabel: string }
): string {
    return styleOf(theme).commandDetail(item, d).trim();
}

/** Menú completo compacto (plegado con "Leer más" tras la cabecera). */
export function renderMenu(theme: MenuTheme, d: MenuData, categories: MenuCategory[]): string {
    const style = styleOf(theme);
    let text = style.header(d) + `\n${READ_MORE}\n`;
    for (const category of categories) text += style.category(category, d, false);
    return (text + style.footer(d, false)).trim();
}

/** Menú de ejemplo, corto, para enseñar cómo se ve un estilo en el panel. */
export function sampleMenu(theme: MenuTheme, d: MenuData): string {
    return renderMenu(theme, { ...d, botType: 'Principal', date: '17 Nov', time: '08:00 PM' }, [
        {
            id: 'downloads',
            name: 'downloads',
            label: 'Descargas',
            subtitle: 'Música, videos y archivos.',
            emoji: '📥',
            commands: [
                { cmd: ['play', 'ytmp3'], desc: 'Descarga audio de YouTube', usage: '<texto|url>' },
                { cmd: ['tiktok', 'tt'], desc: 'Descarga video de TikTok', usage: '<url>' }
            ]
        },
        {
            id: 'stickers',
            name: 'stickers',
            label: 'Stickers',
            subtitle: 'Crear y gestionar stickers.',
            emoji: '✨',
            commands: [
                { cmd: ['sticker', 's'], desc: 'Convierte una foto o video a sticker', usage: '' },
                { cmd: ['qc'], desc: 'Crea un sticker de cita con texto', usage: '<texto>' }
            ]
        }
    ]).replace(READ_MORE, '');
}
