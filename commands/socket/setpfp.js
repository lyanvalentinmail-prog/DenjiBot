import db from '#db';

export default {
  command: ['setimage', 'setpfp'],
  category: 'socket',
  description: 'Cambiar la imagen de perfil del bot.',
  run: async ({ msg, sock, args, isROwner }) => {
    const idBot = sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const isOwner2 = isROwner || [idBot, ...(config.owner ? [config.owner] : []), ...(global.owner || []).map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isOwner2) return msg.reply(global.mess.socket);
    const q = msg.quoted || msg;
    const mime = (q.msg || q).mimetype || q.mime || q.mediaType || '';
    if (!/image/i.test(mime) || /webp/i.test(mime)) {
      return msg.reply('✐ Debes enviar o citar una imagen para cambiar la foto de perfil del bot.');
    }
    const media = await q.download();
    if (!media?.length) return msg.reply('✎ No se pudo descargar la imagen.');
    const isFull = args.some(a => String(a).toLowerCase() === 'full');
    try {
      await sock.updateProfilePicture(idBot, media, { full: isFull });
      return msg.reply(`✿ Se ha actualizado la foto de perfil de *${config.namebot || 'Bot'}*!`);
    } catch (e) {
      return msg.reply(`⚠︎ No se pudo cambiar la foto de perfil.\n> ${e.message}`);
    }
  }
};
