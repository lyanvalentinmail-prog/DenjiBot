import { generateProfilePicture } from '@whiskeysockets/baileys';
import db from '#db';

export default {
  command: ['setimage', 'setpfp'],
  category: 'socket',
  description: 'Cambiar la imagen de perfil del bot.',
  run: async ({ msg, sock, args }) => {
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const isOwner2 = [idBot, ...(config.owner ? [config.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isOwner2) return msg.reply(global.mess.socket);
    const q = msg.quoted || msg;
    const mime = (q.msg || q).mimetype || q.mediaType || '';
    if (!/image/i.test(mime)) return msg.reply('✐ Debes enviar o citar una imagen para cambiar la foto de perfil del bot.');
    const media = await q.download();
    if (!media) return msg.reply('✎ No se pudo descargar la imagen.');
    if (args[0]?.toLowerCase() === 'full' || args[1]?.toLowerCase() === 'full') {
      const { img } = await generateProfilePicture(media);
      await sock.query({
        tag: 'iq',
        attrs: { to: idBot, type: 'set', xmlns: 'w:profile:picture' },
        content: [{ tag: 'picture', attrs: { type: 'image' }, content: img }]
      });
    } else {
      await sock.updateProfilePicture(idBot, media);
    }
    return msg.reply(`✿ Se ha actualizado la foto de perfil de *${config.namebot || 'Bot'}*!`);
  }
};
