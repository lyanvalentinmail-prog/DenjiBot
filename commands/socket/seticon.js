import fs from 'fs';
import path from 'path';
import db from '#db';
import { uploadMedia } from '#simple';
import { DATABASE_DIR } from '#settings';

export default {
  command: ['seticon', 'setboticon'],
  category: 'socket',
  description: 'Cambiar el ícono del bot.',
  run: async ({ msg, sock, args, isROwner }) => {
    const idBot = sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const isOwner2 = isROwner || [idBot, ...(config.owner ? [config.owner] : []), ...(global.owner || []).map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isOwner2) return msg.reply(global.mess.socket);
    const value = args.join(' ').trim();
    const q = msg.quoted || msg;
    const mime = (q.msg || q).mimetype || q.mime || q.mediaType || '';
    if (!value && !/image/.test(mime)) {
      return msg.reply('✎ Debes enviar o citar una imagen o URL para cambiar el ícono del bot.');
    }
    if (value && /^https?:\/\//i.test(value)) {
      db.setSettings(idBot, 'icon', value);
      return msg.reply(`✿ Se ha actualizado el icon de *${config.namebot || 'Bot'}*!`);
    }
    if (!/image\/(png|jpe?g|webp)|^image$/i.test(mime)) {
      return msg.reply('✎ Responde a una imagen válida.');
    }
    const media = await q.download();
    if (!media?.length) return msg.reply('✎ No se pudo descargar la imagen.');
    let savedTarget = '';
    try {
      const uploaded = await uploadMedia(media);
      savedTarget = uploaded.url;
    } catch {
      const ext = /png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : 'jpg';
      if (!fs.existsSync(DATABASE_DIR)) fs.mkdirSync(DATABASE_DIR, { recursive: true });
      const localPath = path.join(DATABASE_DIR, `icon_${idBot.split('@')[0]}.${ext}`);
      fs.writeFileSync(localPath, media);
      savedTarget = localPath;
    }
    db.setSettings(idBot, 'icon', savedTarget);
    return msg.reply(`✿ Se ha actualizado el icon de *${config.namebot || 'Bot'}*!`);
  }
};
