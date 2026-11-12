import chalk from 'chalk';
import config from '#config';

// Registro compacto: una sola línea por mensaje (ideal para pantallas pequeñas).
async function printCompactLog(m: any, conn: any) {
    const time = new Date(m.messageTimestamp ? 1000 * Number(m.messageTimestamp) : Date.now())
        .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    const name = m.pushName || String(m.sender || '').split('@')[0] || 'Usuario';
    const where = m.isGroup
        ? (await conn.groupMetadata(m.chat).catch(() => ({ subject: 'Grupo' }))).subject
        : 'Privado';
    const type = String(m.type || m.mtype || '').replace(/Message$/i, '');
    const text = m.body ? String(m.body).replace(/\s+/g, ' ').trim().slice(0, 120) : `[${type || 'mensaje'}]`;

    console.log(`${chalk.gray(time)} ${chalk.cyan(name)} ${chalk.gray('@ ' + where)}${chalk.gray(':')} ${chalk.white(text)}`);
}

export default async function printMessageLog(m: any, conn: any) {
    if (config.logMode === 'apagado') return;
    // `serialize` guarda el tipo de mensaje en `type`.
    const mtype: string = m.mtype || m.type || '';
    if (['protocolMessage', 'senderKeyDistributionMessage', 'keepAliveMessage'].includes(mtype)) return;
    if (m.chat === 'status@broadcast') return;
    if (config.logMode === 'compacto') return printCompactLog(m, conn);

    const cyan = chalk.cyan;
    const lightCyan = chalk.hex('#E0FFFF');
    const darkCyan = chalk.hex('#008B8B');
    const white = chalk.white;

    const chatJid = m.chat;
    const chatName = m.isGroup ? (await conn.groupMetadata(chatJid).catch(() => ({ subject: 'Grupo' }))).subject : 'Privado';
    
    const botJid = conn.user?.jid || conn.user?.id || '';
    const botName = conn.user?.name || conn.user?.verifiedName || (global as any).botName || 'Bot';
    const me = '+' + botJid.split('@')[0].split(':')[0];
    
    if (m.sender === botJid) return;

    const date = new Date(m.messageTimestamp ? 1000 * (Number(m.messageTimestamp)) : Date.now())
        .toLocaleDateString("es-ES", { timeZone: "America/Mexico_City", day: 'numeric', month: 'long', year: 'numeric' });

    let rawType = mtype ? mtype.replace(/message$/i, '').replace('audio', m.msg?.ptt ? 'PTT' : 'audio') : 'desconocido';
    const typeClean = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    
    const pushName = m.pushName || m.msg?.pushName || 'Usuario';

    console.log(`${cyan.bold('╭────────────────────────────────···')}
${cyan.bold('│')} ${darkCyan('Bot:')} ${white(me)} ~ ${white(botName)}
${cyan.bold('│')} ${darkCyan('Fecha:')} ${white(date)}
${cyan.bold('│')} ${darkCyan('Usuario:')} ${white(m.sender)}
${cyan.bold('│')} ${darkCyan('Nombre:')} ${white(pushName)}
${cyan.bold('│')} ${darkCyan('Chat:')} ${white(m.isGroup ? 'Grupal ~ ' + chatName : 'Privado ~ ' + chatName)}
${cyan.bold('│')} ${darkCyan('Tipo:')} ${white(typeClean)}
${cyan.bold('╰───────────────────···')}`);

    const isMedia = ['image', 'video', 'sticker', 'audio', 'document'].includes(mtype.replace(/message$/i, ''));
    
    if (isMedia) {
        const mediaKind = mtype.replace(/message$/i, '').toLowerCase();
        console.log(`${darkCyan('  multimedia:')} ${white(mediaKind)}${m.body ? '' : '\n'}`);
    }
    if (m.body) {
        console.log(`  ${white(m.body.trim())}\n`);
    }
}
