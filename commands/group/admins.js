export default {
  command: ['admins', 'staff', 'listadmins'],
  category: 'group',
  description: 'Mencionar a todos los administradores del grupo.',
  isGroup: true,
  run: async ({ msg, sock, args, groupMetadata, participants }) => {
    const meta = groupMetadata || (await sock.groupMetadata(msg.chat).catch(() => null));
    const list = Array.isArray(participants) && participants.length ? participants : meta?.participants || [];
    const admins = list.filter(p => p?.admin === 'admin' || p?.admin === 'superadmin');

    if (!admins.length) {
      return msg.reply('《✧》 No se pudo obtener la lista de administradores del grupo.');
    }

    const note = args.join(' ').trim() || String(msg.quoted?.text || msg.quoted?.caption || '').trim();
    const mentions = admins.map(a => a.id).filter(Boolean);
    const lines = admins.map((a, i) => {
      const badge = a.admin === 'superadmin' ? '👑' : '🛡️';
      return `${i + 1}. ${badge} @${a.id.split('@')[0]}`;
    });

    const text =
      `✿ *Administradores — ${meta?.subject || 'Grupo'}*\n` +
      (note ? `\n> ✎ *Motivo ::* ${note}\n` : '') +
      `\n${lines.join('\n')}\n\n` +
      `> Solicitado por @${msg.sender.split('@')[0]}`;

    await sock.sendMessage(
      msg.chat,
      { text, mentions: [...new Set([...mentions, msg.sender])] },
      { quoted: msg }
    );
  }
};
