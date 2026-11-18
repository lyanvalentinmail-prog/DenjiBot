import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import exif from '#core/exif';

const { runFfmpeg } = exif;

export default {
  command: ['tomp3', 'toaudio', 'toptt', 'tovn'],
  category: 'utils',
  description: 'Convertir un video o audio a MP3 o nota de voz.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    const isPtt = command === 'toptt' || command === 'tovn';

    if (!mime || !/^(video|audio)\//i.test(mime)) {
      return msg.reply(
        `《✧》 Responde a un *video* o *audio* con *${usedPrefix + command}* ` +
        `para convertirlo en ${isPtt ? 'nota de voz' : 'audio MP3'}.`
      );
    }

    const tag = crypto.randomBytes(6).toString('hex');
    const inFile = path.join(os.tmpdir(), `denji-aud-in-${tag}`);
    const outFile = path.join(os.tmpdir(), `denji-aud-out-${tag}.${isPtt ? 'ogg' : 'mp3'}`);

    try {
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar el archivo multimedia.');
      }

      fs.writeFileSync(inFile, buffer);

      if (isPtt) {
        await runFfmpeg([
          '-y', '-i', inFile,
          '-vn', '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-ac', '1', '-ar', '48000',
          outFile
        ]);
        const out = fs.readFileSync(outFile);
        return await sock.sendMessage(
          msg.chat,
          { audio: out, mimetype: 'audio/ogg; codecs=opus', ptt: true },
          { quoted: msg }
        );
      }

      await runFfmpeg([
        '-y', '-i', inFile,
        '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ac', '2', '-ar', '44100',
        outFile
      ]);
      const out = fs.readFileSync(outFile);
      await sock.sendMessage(
        msg.chat,
        { audio: out, mimetype: 'audio/mpeg', fileName: `audio_${Date.now()}.mp3` },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    } finally {
      try { if (fs.existsSync(inFile)) fs.unlinkSync(inFile); } catch {}
      try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch {}
    }
  }
};
