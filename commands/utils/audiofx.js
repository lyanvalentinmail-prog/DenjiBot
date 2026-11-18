import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import exif from '#core/exif';

const { runFfmpeg } = exif;

const FILTERS = {
  bass: ['-af', 'equalizer=f=94:width_type=o:width=2:g=30'],
  blown: ['-af', 'acrusher=.1:1:64:0:log'],
  deep: ['-af', 'atempo=4/4,asetrate=44500*2/3'],
  earrape: ['-af', 'volume=12'],
  fast: ['-filter:a', 'atempo=1.63,asetrate=44100'],
  fat: ['-filter:a', 'atempo=1.6,asetrate=22100'],
  nightcore: ['-filter:a', 'atempo=1.06,asetrate=44100*1.25'],
  reverse: ['-filter_complex', 'areverse'],
  robot: ['-filter_complex', "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"],
  slow: ['-filter:a', 'atempo=0.7,asetrate=44100'],
  smooth: ['-filter:v', 'minterpolate=mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120'],
  tupai: ['-filter:a', 'atempo=0.5,asetrate=65100']
};

export default {
  command: ['audiofx', ...Object.keys(FILTERS)],
  category: 'utils',
  description: 'Aplicar efectos a audios o notas de voz (bass, nightcore, robot, slow…).',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chosen = command === 'audiofx' ? String(args[0] || '').toLowerCase() : command;
    const filter = FILTERS[chosen];

    if (!filter) {
      const list = Object.keys(FILTERS).map(k => `\`${usedPrefix}${k}\``).join(' · ');
      return msg.reply(
        `✿ *Efectos de Audio*\n\n` +
        `Responde a un audio o nota de voz con cualquiera de estos efectos:\n> ${list}`
      );
    }

    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    if (!mime || !/^audio\//i.test(mime)) {
      return msg.reply(
        `《✧》 Responde a un *audio* o *nota de voz* con *${usedPrefix + chosen}*.`
      );
    }

    const tag = crypto.randomBytes(6).toString('hex');
    const inFile = path.join(os.tmpdir(), `denji-fx-in-${tag}`);
    const outFile = path.join(os.tmpdir(), `denji-fx-out-${tag}.mp3`);

    try {
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar el audio.');
      }
      if (buffer.length > 25 * 1024 * 1024) {
        return msg.reply('《✧》 El audio supera el límite máximo de 25 MB.');
      }

      fs.writeFileSync(inFile, buffer);
      const argsFfmpeg = chosen === 'smooth'
        ? ['-y', '-i', inFile, '-af', 'lowpass=f=3200,highpass=f=80,aecho=0.8:0.88:40:0.25', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', outFile]
        : ['-y', '-i', inFile, ...filter, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', outFile];

      await runFfmpeg(argsFfmpeg, 50_000);
      const result = fs.readFileSync(outFile);
      await sock.sendMessage(
        msg.chat,
        {
          audio: result,
          mimetype: 'audio/mpeg',
          ptt: Boolean(q?.msg?.ptt),
          fileName: `${chosen}_${Date.now()}.mp3`
        },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + chosen}*.\n> [Error: *${e.message}*]`);
    } finally {
      try { if (fs.existsSync(inFile)) fs.unlinkSync(inFile); } catch {}
      try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch {}
    }
  }
};
