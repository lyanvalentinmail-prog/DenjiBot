import fs from 'node:fs';
import exif from '#core/exif';
import db from '#db';
import { getBuffer } from '#simple';
import {
  parseS2Mode,
  videoToAudioStickerWebp,
  extractStickerAudio,
  sendAudioSticker
} from '#audiosticker';

const { writeExif } = exif;

const isUrl = text =>
  /^https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,10}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/i.test(
    String(text || '').trim()
  );

const unlinkSafe = f => {
  try {
    if (f && fs.existsSync(f)) fs.unlinkSync(f);
  } catch {}
};

export default {
  command: ['s2'],
  category: 'stickers',
  description: 'Convertir un video a un sticker con audio.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (args.some(a => String(a).toLowerCase() === '-list')) {
        const helpText =
          `ꕥ Lista de Opciones Disponibles para *${usedPrefix + command}*:\n\n` +
          `- *Escalado* (escala el sticker a 512x512) (por defecto)\n\n` +
          `- *Normal* (tiene la escala del video).\n\n` +
          `- *BorrarN* (borra las esquinas negras del video y lo hace sticker con audio).\n\n` +
          `> Ejemplo: *${usedPrefix + command} BorrarN*\n` +
          `> Con metadatos: *${usedPrefix + command} Normal Pack | Autor*`;
        return sock.reply(msg.chat, helpText, msg);
      }

      const quoted = msg.quoted || msg;
      const mime = (quoted.msg || quoted).mimetype || quoted.mime || '';
      const qType = quoted.type || quoted.mtype || '';
      const isVideoMsg = /^video\//i.test(mime) || qType === 'videoMessage' || qType === 'ptvMessage';

      let urlArg = null;
      let mode = 'escalado';
      let modeSelected = false;
      const textTokens = [];

      for (const arg of args) {
        if (!urlArg && isUrl(arg)) {
          urlArg = arg;
          continue;
        }
        if (!modeSelected) {
          const parsed = parseS2Mode(arg);
          if (parsed) {
            mode = parsed;
            modeSelected = true;
            continue;
          }
        }
        textTokens.push(arg);
      }

      if (!isVideoMsg && !urlArg) {
        return sock.reply(
          msg.chat,
          `《✧》 Envía o responde a un *video* con audio para crear un sticker con sonido.\n` +
          `> Usa *${usedPrefix + command} -list* para ver las opciones disponibles.`,
          msg
        );
      }

      let videoBuffer = null;
      if (isVideoMsg) {
        if ((quoted.msg || quoted)?.gifPlayback) {
          return sock.reply(
            msg.chat,
            `《✧》 Los GIFs no contienen audio. Envía o responde a un *video con sonido* (o usa *${usedPrefix}s* para stickers sin audio).`,
            msg
          );
        }
        videoBuffer = await quoted.download?.();
      } else if (urlArg) {
        videoBuffer = await getBuffer(urlArg, { timeout: 30_000 });
        if (
          videoBuffer?.length &&
          !/\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(urlArg) &&
          !exif.isMp4Buffer(videoBuffer)
        ) {
          return sock.reply(
            msg.chat,
            `《✧》 La URL proporcionada no corresponde a un video válido.`,
            msg
          );
        }
      }

      if (!videoBuffer?.length) {
        return sock.reply(msg.chat, '《✧》 No se pudo descargar el video.', msg);
      }

      if (videoBuffer.length > 25 * 1024 * 1024) {
        return sock.reply(msg.chat, '《✧》 El video supera el límite máximo de 25 MB.', msg);
      }

      const user = db.getUser(msg.sender);
      const name = user?.name || msg.pushName || msg.sender.split('@')[0];
      const meta1 = user?.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user?.metadatos2 ? String(user.metadatos2).trim() : '';
      const defaultPack = meta1 || global.botName || 'Denji bot';
      const defaultAuthor = meta1 ? meta2 : `@${name}`;

      const filteredText = textTokens.join(' ').trim();
      const parts = filteredText.split(/[\u2022|]/).map(p => p.trim());
      const pack = parts[0] || defaultPack;
      const author =
        parts.length > 1
          ? parts[1]
          : filteredText
            ? meta1
              ? defaultAuthor
              : ''
            : defaultAuthor;

      const [rawWebp, audioData] = await Promise.all([
        videoToAudioStickerWebp(videoBuffer, mode),
        extractStickerAudio(videoBuffer)
      ]);

      const stickerPath = await writeExif(
        { mimetype: 'image/webp', data: rawWebp },
        { packname: pack, author, categories: [''] }
      );

      try {
        const finalWebp = fs.readFileSync(stickerPath);
        const payload = {
          sticker: finalWebp,
          audio: audioData.buffer,
          seconds: audioData.seconds,
          waveform: audioData.waveform,
          ephemeralExpiration: msg.expiration
        };

        if (typeof sock.sendAudioSticker === 'function') {
          await sock.sendAudioSticker(msg.chat, payload, msg);
        } else {
          await sendAudioSticker(sock, msg.chat, payload, msg);
        }
      } finally {
        unlinkSafe(stickerPath);
      }
    } catch (e) {
      if (e?.code === 'NO_AUDIO_STREAM' || e?.message === 'NO_AUDIO_STREAM') {
        return msg.reply(
          `《✧》 El video no contiene pista de audio. Envía o responde a un *video con sonido* (o usa *${usedPrefix}s* para crear un sticker sin audio).`
        );
      }
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
