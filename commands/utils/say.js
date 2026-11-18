export default {
  command: ['say', 'decir'],
  category: 'utils',
  description: 'Repetir un mensaje como el bot.',
  run: async ({ msg, sock, args, usedPrefix, command, participants }) => {
    const groupParticipants =
      Array.isArray(participants) && participants.length
        ? participants
        : msg.isGroup
          ? (await sock.groupMetadata(msg.chat).catch(() => null))?.participants || []
          : [];
    const allMentions = groupParticipants.map(p => p.id).filter(Boolean);
    const userText = args.join(' ').trim();
    const isQuoted = Boolean(msg.quoted);
    const src = msg.quoted || msg;
    const type = src.type || src.mtype || '';
    const hasImage = type === 'imageMessage' || Boolean(src.message?.imageMessage);
    const hasVideo = type === 'videoMessage' || type === 'ptvMessage' || Boolean(src.message?.videoMessage);
    const hasAudio = type === 'audioMessage' || Boolean(src.message?.audioMessage);
    const hasSticker = type === 'stickerMessage' || Boolean(src.message?.stickerMessage);

    const quotedText = isQuoted ? String(src.caption || src.text || src.body || '').trim() : '';
    const textToSend = userText || quotedText;
    const explicitMentions = textToSend
      ? allMentions.filter(jid => textToSend.includes(`@${jid.split('@')[0]}`))
      : [];

    try {
      const extra = explicitMentions.length ? { mentions: explicitMentions } : {};
      if (hasImage) {
        const media = await src.download();
        return sock.sendMessage(msg.chat, { image: media, caption: textToSend, ...extra });
      }
      if (hasVideo) {
        const media = await src.download();
        return sock.sendMessage(msg.chat, { video: media, mimetype: 'video/mp4', caption: textToSend, ...extra });
      }
      if (hasAudio) {
        const media = await src.download();
        return sock.sendMessage(msg.chat, {
          audio: media,
          mimetype: src.mimetype || 'audio/ogg; codecs=opus',
          ptt: Boolean(src.msg?.ptt),
          ...extra
        });
      }
      if (hasSticker) {
        const media = await src.download();
        return sock.sendMessage(msg.chat, { sticker: media, ...extra });
      }
      if (textToSend) {
        return sock.sendMessage(msg.chat, { text: textToSend, ...extra });
      }
      return msg.reply('《✧》 Por favor, escribe el texto o responde al mensaje que deseas repetir.');
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
