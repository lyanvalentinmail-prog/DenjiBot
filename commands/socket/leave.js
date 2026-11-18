import db from '#db';
export default {
  command: ['leave', 'salir'],
  category: 'socket',
  description: 'Salir de un grupo.',
  run: async ({ msg, sock, args, usedPrefix, command, isROwner }) => {
    const botId = sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(botId) || {};
    const isOwner = config.owner;
    const isSocketOwner = isROwner || [botId, ...(isOwner ? [isOwner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isSocketOwner) return msg.reply(global.mess.socket);
    const groupId = args[0] || msg.chat;
    try {
      await sock.groupLeave(groupId);
    } catch (e) {
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  },
};