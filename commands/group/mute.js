import db from '#db';

function getMutedList(chatId) {
  const chat = db.getChat(chatId) || {};
  let list = chat.mutedUsers;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  return Array.isArray(list) ? list : [];
}

const cleanNum = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export async function before({ msg, sock, isAdmins, isBotAdmins, isOwner }) {
  if (!msg?.isGroup || msg.isBot || isAdmins || isOwner || !isBotAdmins) return false;
  const muted = getMutedList(msg.chat);
  if (!muted.length) return false;

  const senderNum = cleanNum(msg.sender);
  if (!senderNum || !muted.some(j => cleanNum(j) === senderNum)) return false;

  const botId = (sock.user?.id || '').split('@')[0].split(':')[0] + '@s.whatsapp.net';
  const chat = db.getChat(msg.chat) || {};
  if (chat.primaryBot && chat.primaryBot !== botId) return false;

  await sock.sendMessage(msg.chat, {
    delete: {
      remoteJid: msg.chat,
      fromMe: false,
      id: msg.key?.id,
      participant: msg.key?.participant || msg.key?.participantAlt || msg.sender
    }
  }).catch(() => {});

  return true;
}

export default {
  command: ['mute', 'unmute', 'silenciar', 'desilenciar'],
  category: 'group',
  description: 'Silenciar o quitar el silencio a un miembro del grupo.',
  isAdmin: true,
  botAdmin: true,
  before,
  run: async ({ msg, sock, args, usedPrefix, command, participants }) => {
    const isUnmute = command === 'unmute' || command === 'desilenciar';
    const sub = (args[0] || '').toLowerCase();

    if (!isUnmute && ['list', 'lista', 'ver'].includes(sub)) {
      const muted = getMutedList(msg.chat);
      if (!muted.length) {
        return msg.reply('✿ No hay miembros silenciados en este grupo.');
      }
      const lines = muted.map((j, i) => `${i + 1}. @${j.split('@')[0]}`).join('\n');
      return sock.sendMessage(
        msg.chat,
        { text: `✿ *Usuarios silenciados (${muted.length})*\n\n${lines}`, mentions: muted },
        { quoted: msg }
      );
    }

    const target = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    if (!target) {
      return msg.reply(
        `《✧》 Menciona o responde al usuario que deseas ${isUnmute ? 'desilenciar' : 'silenciar'}.\n` +
        `> Ver lista: *${usedPrefix}mute lista*`
      );
    }

    const targetNum = cleanNum(target);
    const botNum = cleanNum(sock.user?.id);
    if (targetNum === botNum) {
      return msg.reply('《✧》 No puedo silenciarme a mí mismo.');
    }

    const ownerNums = (global.owner || []).map(cleanNum);
    if (!isUnmute && ownerNums.includes(targetNum)) {
      return msg.reply('《✧》 No puedes silenciar al propietario del bot.');
    }

    const targetMember = (participants || []).find(p => cleanNum(p.id) === targetNum);
    if (!isUnmute && (targetMember?.admin === 'admin' || targetMember?.admin === 'superadmin')) {
      return msg.reply('《✧》 No se puede silenciar a un administrador del grupo.');
    }

    const muted = getMutedList(msg.chat);
    const exists = muted.some(j => cleanNum(j) === targetNum);

    if (isUnmute) {
      if (!exists) {
        return sock.reply(msg.chat, `《✧》 @${targetNum} no estaba silenciado.`, msg, { mentions: [target] });
      }
      const next = muted.filter(j => cleanNum(j) !== targetNum);
      db.setChat(msg.chat, 'mutedUsers', next);
      return sock.reply(msg.chat, `✿ Se quitó el silencio a @${targetNum}.`, msg, { mentions: [target] });
    }

    if (exists) {
      return sock.reply(msg.chat, `《✧》 @${targetNum} ya está silenciado. Usa *${usedPrefix}unmute* para revertirlo.`, msg, { mentions: [target] });
    }

    db.setChat(msg.chat, 'mutedUsers', [...muted, target]);
    await sock.reply(
      msg.chat,
      `🔇 @${targetNum} ha sido *silenciado* en el grupo.\n> Usa *${usedPrefix}unmute @${targetNum}* para quitar el silencio.`,
      msg,
      { mentions: [target] }
    );
  }
};
