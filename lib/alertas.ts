import { UserJid } from '#simple';
import db from '#db';

const parseJidString = (p: any): string => {
    if (!p) return '';
    if (typeof p === 'string') return p;
    if (typeof p === 'object' && p.id) return String(p.id);
    if (typeof p === 'object' && p.jid) return String(p.jid);
    return String(p);
};

/** Avisos de cambios de configuración del grupo cuando `alerts` está activado. */
export const handleGroupAlerts = async (sock: any, updates: any[]) => {
    const botId = sock?.user?.id ? `${sock.user.id.split('@')[0].split(':')[0]}@s.whatsapp.net` : '';
    const settings = botId ? db.getSettings(botId) : {};
    if (settings?.self) return;

    for (const group of updates) {
        const chatJid = parseJidString(group.id);
        if (!chatJid) continue;

        const chat = db.getChat(chatJid);
        if (!chat?.alerts) continue;
        if (chat.primaryBot && botId && chat.primaryBot !== botId) continue;

        const rawAuthor = parseJidString(group.author);
        const cleanSenderJid = rawAuthor ? UserJid(sock, chatJid, rawAuthor) : '';
        const actor = cleanSenderJid ? `@${cleanSenderJid.split('@')[0]}` : 'Un administrador';

        let texto = '';
        if (group.subject) {
            texto = `「✎」 ${actor} cambió el nombre del grupo a *${group.subject}*.`;
        } else if (group.announce !== undefined) {
            texto = `「✎」 ${actor} configuró el grupo para que ${group.announce ? '*solo administradores*' : '*todos los miembros*'} puedan enviar mensajes.`;
        } else if (group.restrict !== undefined) {
            texto = `「✎」 ${actor} configuró el grupo para que ${group.restrict ? '*solo administradores*' : '*todos*'} puedan editar la info.`;
        } else if (group.revoke) {
            texto = `「✎」 ${actor} restableció el enlace de invitación del grupo.`;
        }

        if (texto) {
            const mentions = cleanSenderJid ? [cleanSenderJid] : [];
            await sock.sendMessage(chatJid, { text: texto, mentions }).catch(() => null);
        }
    }
};
