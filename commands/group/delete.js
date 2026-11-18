export default {
  command: ['del', 'delete', 'eliminar', 'borrar'],
  category: 'group',
  description: 'Eliminar el mensaje citado en el grupo.',
  isAdmin: true,
  run: async ({ msg, sock, usedPrefix, command, isBotAdmin }) => {
    const q = msg.quoted;
    if (!q?.key?.id && !q?.id) {
      return msg.reply(`《✧》 Responde al mensaje que deseas eliminar con *${usedPrefix + command}*.`);
    }

    const msgId = q.key?.id || q.id;
    const botNum = (sock.user?.id || '').split('@')[0].split(':')[0];
    const qSenderNum = (q.sender || '').split('@')[0].split(':')[0];
    const fromBot = Boolean(q.key?.fromMe || q.fromMe || (botNum && botNum === qSenderNum));

    if (!fromBot && !isBotAdmin) {
      return msg.reply(global.mess?.botAdmin || '《✧》 Necesito ser administrador para borrar mensajes de otros miembros.');
    }

    try {
      const deleteKey = fromBot
        ? { remoteJid: msg.chat, fromMe: true, id: msgId }
        : {
            remoteJid: msg.chat,
            fromMe: false,
            id: msgId,
            participant: q.key?.participant || q.participant || q.sender
          };

      await sock.sendMessage(msg.chat, { delete: deleteKey });

      if (isBotAdmin && msg.key?.id) {
        await sock.sendMessage(msg.chat, {
          delete: {
            remoteJid: msg.chat,
            fromMe: Boolean(msg.key.fromMe),
            id: msg.key.id,
            participant: msg.key.participant || msg.sender
          }
        }).catch(() => {});
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
