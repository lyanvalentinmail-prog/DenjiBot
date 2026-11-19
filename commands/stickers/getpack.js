import webp from 'node-webpmux';
import db from '#db';
import { isAnimatedWebp } from '#sticker';

const isAnimWebp = isAnimatedWebp;

export default {
  command: ['getpack', 'pack'],
  category: 'stickers',
  description: 'Descargar un paquete de stickers.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (!args.length) {
        return msg.reply('《✧》 Especifica el nombre del paquete de stickers.');
      }
      const packName = args.join(' ').trim().toLowerCase();
      let pack = null;
      let packOwner = msg.sender;
      const stickerPackData = db.getStickersPack(msg.sender);
      const myPacks = stickerPackData.packs || [];
      pack = myPacks.find(p => String(p.name || '').toLowerCase() === packName);
      if (!pack) {
        const allUsers = db.getStickersPack();
        for (const userData of allUsers) {
          const userPacks = userData.packs
            ? typeof userData.packs === 'string'
              ? JSON.parse(userData.packs)
              : userData.packs
            : [];
          const publicPack = userPacks.find(
            p => String(p.name || '').toLowerCase() === packName && p.spackpublic === 1
          );
          if (publicPack) {
            pack = publicPack;
            packOwner = userData.id;
            break;
          }
        }
      }
      if (!pack) {
        return msg.reply('《✧》 No se encontró un paquete con ese nombre.');
      }
      if (!Array.isArray(pack.stickers) || pack.stickers.length < 1) {
        return msg.reply(`《✧》 El paquete \`${pack.name}\` no tiene stickers.`);
      }
      const validStickers = pack.stickers
        .map(s => {
          try {
            return Buffer.from(s, 'base64');
          } catch {
            return null;
          }
        })
        .filter(s => s && Buffer.isBuffer(s) && s.length > 0);
      if (!validStickers.length) {
        return msg.reply('《✧》 Los stickers del paquete están corruptos.');
      }

      const selected = validStickers.slice(0, 50);
      const cover = selected[0];
      let packOwnerUser = null;
      try {
        packOwnerUser = db.getUser(packOwner);
      } catch {}
      const name = packOwnerUser?.name || packOwner.split('@')[0];
      const ownerMeta1 = packOwnerUser?.metadatos ? String(packOwnerUser.metadatos).trim() : '';
      const ownerMeta2 = packOwnerUser?.metadatos2 ? String(packOwnerUser.metadatos2).trim() : '';
      const stickerPackname = ownerMeta1 || pack.name;
      const stickerAuthor = ownerMeta1 ? ownerMeta2 : pack.desc || '';

      const stickerResults = await Promise.all(
        selected.map(async buffer => {
          const animated = isAnimWebp(buffer);
          try {
            const img = new webp.Image();
            await img.load(buffer);
            const json = {
              'sticker-pack-id': 'https://github.com/lyanvalentinmail-prog/DenjiBot',
              'sticker-pack-name': stickerPackname,
              'sticker-pack-publisher': stickerAuthor,
              emojis: ['🎭']
            };
            const exifAttr = Buffer.from([
              0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
              0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x16, 0x00, 0x00, 0x00
            ]);
            const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
            const exif = Buffer.concat([exifAttr, jsonBuff]);
            exif.writeUIntLE(jsonBuff.length, 14, 4);
            img.exif = exif;
            const stickerBuf = await img.save(null);
            return { sticker: stickerBuf, isAnimated: animated, isLottie: false, emojis: ['🎭'] };
          } catch {
            return { sticker: buffer, isAnimated: animated, isLottie: false, emojis: ['🎭'] };
          }
        })
      );

      try {
        await sock.sendStickerPackMessage(
          msg.chat,
          {
            name: pack.name,
            publisher: `${pack.author || name} (${name})`,
            description: pack.desc || '',
            cover,
            stickers: stickerResults
          },
          msg
        );
      } catch (packError) {
        console.error('[getpack] No se pudo enviar el paquete nativo:', packError);
        // Respaldo: enviar los stickers sueltos si el paquete nativo falla.
        let sent = 0;
        for (const item of stickerResults.slice(0, 10)) {
          try {
            await sock.sendImageAsSticker(msg.chat, item.sticker, msg, {
              packname: stickerPackname,
              author: stickerAuthor
            });
            sent += 1;
          } catch {}
        }
        if (sent > 0) {
          return msg.reply(`《✧》 No se pudo enviar el paquete completo, así que te envié ${sent} stickers sueltos del pack *${pack.name}*.`);
        }
        throw packError;
      }
    } catch (e) {
      msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
