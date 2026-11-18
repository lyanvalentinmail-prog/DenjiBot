import fs from 'fs';
import path from 'path';
import db from '#db';
import { uploadMedia } from '#simple';
import { DATABASE_DIR } from '#settings';

export default {
  command: ['setbanner', 'setbotbanner'],
  category: 'socket',
  description: 'Cambiar el banner del menú.',
  run: async ({ msg, sock, args, isROwner }) => {
    const idBot = sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const isOwner2 = isROwner || [idBot, ...(config.owner ? [config.owner] : []), ...(global.owner || []).map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isOwner2) return sock.reply(msg.chat, global.mess.socket, msg);
    const value = args.join(' ').trim();
    const q = msg.quoted || msg;
    const mime = (q.msg || q).mimetype || q.mime || q.mediaType || '';
    if (!value && !/image|video/.test(mime)) {
      return msg.reply('✎ Debes enviar o citar una imagen, video o URL para cambiar el banner del bot.');
    }
    if (value && /^https?:\/\//i.test(value)) {
      db.setSettings(idBot, 'banner', value);
      return msg.reply(`✿ Se ha actualizado el banner de *${config.namebot || 'Bot'}*!`);
    }
    if (!/image\/(png|jpe?g|gif|webp)|video\/mp4|^image$|^video$/i.test(mime)) {
      return msg.reply('✎ Responde a una imagen o video MP4 válido.');
    }
    const media = await q.download();
    if (!media?.length) return msg.reply('✎ No se pudo descargar la imagen.');
    let savedTarget = '';
    try {
      const uploaded = await uploadMedia(media);
      savedTarget = uploaded.url;
    } catch {
      const ext = /png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : /gif/i.test(mime) ? 'gif' : /mp4|video/i.test(mime) ? 'mp4' : 'jpg';
      if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });
      const localPath = path.join(DATABASE_DIR, `banner_${idBot.split('@')[0]}.${ext}`);
      fs.writeFileSync(localPath, media);
      savedTarget = localPath;
    }
    db.setSettings(idBot, 'banner', savedTarget);
    return msg.reply(`✿ Se ha actualizado el banner de *${config.namebot || 'Bot'}*!`);
  }
};
