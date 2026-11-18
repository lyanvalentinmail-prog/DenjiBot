import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import exif from '#core/exif';
import db from '#db';
import { getBuffer } from '#simple';

const { writeExif, runFfmpeg } = exif;

const isUrl = text =>
  /^https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,10}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/i.test(
    String(text || '').trim()
  );

const tmpPath = ext => path.join(os.tmpdir(), `denji-st-${crypto.randomBytes(6).toString('hex')}.${ext}`);
const unlinkSafe = f => {
  try {
    if (f && fs.existsSync(f)) fs.unlinkSync(f);
  } catch {}
};

const isAnimatedWebp = buffer =>
  Buffer.isBuffer(buffer) &&
  buffer.length > 32 &&
  (buffer.indexOf(Buffer.from('ANIM')) !== -1 || buffer.indexOf(Buffer.from('ANMF')) !== -1);

function buildFFmpegFilters(effects, size = 512, fps = 0) {
  const W = size;
  const H = size;
  const filters = [];
  if (fps > 0) filters.push(`fps=${fps}`);
  const shape = effects.find(e => e.type === 'shape')?.value;
  const effectList = effects.filter(e => e.type === 'effect').map(e => e.value);

  if (shape === 'cover') {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  } else {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
    filters.push('format=rgba');
    filters.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=#00000000`);
  }
  filters.push('format=rgba');

  for (const effect of effectList) {
    switch (effect) {
      case 'blur': filters.push('gblur=sigma=5'); break;
      case 'sepia': filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'); break;
      case 'sharpen': filters.push('unsharp=5:5:1.0:5:5:0.0'); break;
      case 'brighten': filters.push('eq=brightness=0.08'); break;
      case 'darken': filters.push('eq=brightness=-0.08'); break;
      case 'invert':
      case 'negate': filters.push('negate'); break;
      case 'grayscale': filters.push('hue=s=0'); break;
      case 'rotate90': filters.push('transpose=1'); break;
      case 'rotate180': filters.push('rotate=PI'); break;
      case 'flip': filters.push('hflip'); break;
      case 'flop': filters.push('vflip'); break;
      case 'normalize': filters.push('normalize'); break;
      case 'tint': filters.push('colorchannelmixer=1:0:0:0:0:0.5:0:0:0:0:0.5'); break;
    }
  }
  if (shape === 'mirror') filters.push('hflip');
  if (shape && !['cover', 'contain', 'mirror', 'border', 'frame'].includes(shape)) {
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) / 2;
    let alphaExpr = '';
    switch (shape) {
      case 'circle': alphaExpr = `if(lte((X-${cx})*(X-${cx})+(Y-${cy})*(Y-${cy}),${r * r}),255,0)`; break;
      case 'triangle': alphaExpr = `if(gte(Y,${H * 0.1})*lte(Y,${H * 0.9})*lte(abs(X-${cx}),((${H * 0.9}-Y)*0.6)),255,0)`; break;
      case 'star': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.25}+${W * 0.1}*cos(5*atan2(Y-${cy},X-${cx}))),255,0)`; break;
      case 'roundrect': {
        const rad = Math.round(W * 0.1);
        alphaExpr = `if(lte(if(gte(X,${rad})*lte(X,${W - rad})*gte(Y,0)*lte(Y,${H}),0,if(gte(Y,${rad})*lte(Y,${H - rad})*gte(X,0)*lte(X,${W}),0,if(lte(X,${rad})*lte(Y,${rad}),(X-${rad})*(X-${rad})+(Y-${rad})*(Y-${rad}),if(gte(X,${W - rad})*lte(Y,${rad}),(X-${W - rad})*(X-${W - rad})+(Y-${rad})*(Y-${rad}),if(lte(X,${rad})*gte(Y,${H - rad}),(X-${rad})*(X-${rad})+(Y-${H - rad})*(Y-${H - rad}),(X-${W - rad})*(X-${W - rad})+(Y-${H - rad})*(Y-${H - rad})))))),${rad * rad}),255,0)`;
        break;
      }
      case 'hexagon': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.4}*cos(PI/6)/cos(mod(atan2(Y-${cy},X-${cx}),PI/3)-PI/6)),255,0)`; break;
      case 'diamond': alphaExpr = `if(lte(abs(X-${cx})+abs(Y-${cy}),${r}),255,0)`; break;
      case 'wave': alphaExpr = `if(lte(abs(Y-(${cy}+${H * 0.05}*sin(X*0.05))),${H * 0.4}),255,0)`; break;
      case 'octagon': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.4}*cos(PI/8)/cos(mod(atan2(Y-${cy},X-${cx}),PI/4)-PI/8)),255,0)`; break;
      case 'pentagon': alphaExpr = `if(lte(hypot(X-${cx},Y-${cy}),${W * 0.4}*cos(PI/5)/cos(mod(atan2(Y-${cy},X-${cx}),2*PI/5)-PI/5)),255,0)`; break;
      case 'ellipse': alphaExpr = `if(lte(((X-${cx})*(X-${cx}))/(${(W * 0.45) ** 2})+((Y-${cy})*(Y-${cy}))/(${(H * 0.4) ** 2}),1),255,0)`; break;
      case 'cross': alphaExpr = `if(gt(lte(abs(X-${cx}),${W * 0.15})*lte(abs(Y-${cy}),${H * 0.45})+lte(abs(Y-${cy}),${H * 0.15})*lte(abs(X-${cx}),${W * 0.45}),0),255,0)`; break;
      case 'heart': alphaExpr = `if(lte(pow((X-${cx})/(${W * 0.3})*(X-${cx})/(${W * 0.3})+(Y-${cy})/(${H * 0.3})*(Y-${cy})/(${H * 0.3})-1,3)-((X-${cx})/(${W * 0.3})*(X-${cx})/(${W * 0.3}))*pow((Y-${cy})/(${H * 0.3}),3),0),255,0)`; break;
    }
    if (alphaExpr) filters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpr}'`);
  }
  if (shape === 'border') filters.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=white@0.9:t=10`);
  if (shape === 'frame') filters.push(`drawbox=x=15:y=15:w=${W - 30}:h=${H - 30}:color=white@0.7:t=8`);
  filters.push('format=yuva420p');
  return filters.join(',');
}

export default {
  command: ['sticker', 's', 'stiker'],
  category: 'stickers',
  description: 'Convertir una imagen o video a sticker.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      if (args[0] === '-list') {
        const helpText =
          `ꕥ Lista de Formas y Efectos Disponibles para *imagen*:\n\n` +
          `✦ *Formas:*\n` +
          `- -c : Circular · -t : Triangular · -s : Estrella\n` +
          `- -r : Bordes redondeados · -h : Hexagonal · -d : Diamante\n` +
          `- -f : Marco · -b : Borde · -w : Onda · -m : Espejo\n` +
          `- -o : Octogonal · -y : Pentagonal · -e : Elíptico\n` +
          `- -z : Cruz · -v : Corazón · -x : Expandido (cover) · -i : Ajustado\n\n` +
          `✧ *Efectos:*\n` +
          `- -blur · -sepia · -sharpen · -brighten · -darken\n` +
          `- -invert · -grayscale · -rotate90 · -rotate180\n` +
          `- -flip · -flop · -normalice · -negate · -tint\n\n` +
          `> Ejemplo: *${usedPrefix + command} -c -blur Pack | Autor*`;
        return sock.reply(msg.chat, helpText, msg);
      }

      const quoted = msg.quoted || msg;
      const mime = (quoted.msg || quoted).mimetype || quoted.mime || '';
      const user = db.getUser(msg.sender);
      const name = user?.name || msg.pushName || msg.sender.split('@')[0];
      const meta1 = user?.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user?.metadatos2 ? String(user.metadatos2).trim() : '';
      const defaultPack = meta1 || global.botName || 'Denji bot';
      const defaultAuthor = meta1 ? meta2 : `@${name}`;

      let urlArg = null;
      const argsWithoutUrl = [];
      for (const arg of args) {
        if (isUrl(arg)) urlArg = arg;
        else argsWithoutUrl.push(arg);
      }

      const shapeArgs = {
        '-c': 'circle', '-t': 'triangle', '-s': 'star', '-r': 'roundrect',
        '-h': 'hexagon', '-d': 'diamond', '-f': 'frame', '-b': 'border',
        '-w': 'wave', '-m': 'mirror', '-o': 'octagon', '-y': 'pentagon',
        '-e': 'ellipse', '-z': 'cross', '-v': 'heart', '-x': 'cover', '-i': 'contain'
      };
      const effectArgs = {
        '-blur': 'blur', '-sepia': 'sepia', '-sharpen': 'sharpen',
        '-brighten': 'brighten', '-darken': 'darken', '-invert': 'invert',
        '-grayscale': 'grayscale', '-rotate90': 'rotate90', '-rotate180': 'rotate180',
        '-flip': 'flip', '-flop': 'flop', '-normalice': 'normalize',
        '-normalize': 'normalize', '-negate': 'negate', '-tint': 'tint'
      };

      const effects = [];
      const textTokens = [];
      for (const arg of argsWithoutUrl) {
        const lower = arg.toLowerCase();
        if (shapeArgs[lower]) effects.push({ type: 'shape', value: shapeArgs[lower] });
        else if (effectArgs[lower]) effects.push({ type: 'effect', value: effectArgs[lower] });
        else textTokens.push(arg);
      }

      const filteredText = textTokens.join(' ').trim();
      const parts = filteredText.split(/[\u2022|]/).map(p => p.trim());
      const pack = parts[0] || defaultPack;
      const author = parts.length > 1 ? parts[1] : filteredText ? (meta1 ? defaultAuthor : '') : defaultAuthor;

      const sendWebpWithExif = async webpBuffer => {
        const stickerPath = await writeExif({ mimetype: 'image/webp', data: webpBuffer }, { packname: pack, author, categories: [''] });
        try {
          const finalBuf = fs.readFileSync(stickerPath);
          await sock.sendMessage(msg.chat, { sticker: finalBuf }, { quoted: msg });
        } finally {
          unlinkSafe(stickerPath);
        }
      };

      const processMedia = async (buffer, ext, animated = false) => {
        const inFile = tmpPath(ext);
        const outFile = tmpPath('webp');
        fs.writeFileSync(inFile, buffer);
        try {
          if (animated) {
            const profiles = [
              { size: 512, fps: 12, t: '8', q: '50' },
              { size: 384, fps: 10, t: '6', q: '35' },
              { size: 320, fps: 8, t: '5', q: '25' }
            ];
            let outBuf = null;
            for (const p of profiles) {
              unlinkSafe(outFile);
              const vf = buildFFmpegFilters(effects, p.size, p.fps);
              await runFfmpeg([
                '-y', '-t', p.t, '-i', inFile,
                '-vf', vf, '-c:v', 'libwebp',
                '-lossless', '0', '-q:v', p.q,
                '-compression_level', '4', '-preset', 'default',
                '-loop', '0', '-an', '-vsync', '0', outFile
              ]);
              outBuf = fs.readFileSync(outFile);
              if (outBuf.length <= 950_000) break;
            }
            await sendWebpWithExif(outBuf);
          } else {
            const vf = buildFFmpegFilters(effects, 512, 0);
            await runFfmpeg([
              '-y', '-i', inFile, '-frames:v', '1',
              '-vf', vf, '-c:v', 'libwebp',
              '-lossless', '0', '-q:v', '80',
              '-compression_level', '4', '-an', outFile
            ]);
            await sendWebpWithExif(fs.readFileSync(outFile));
          }
        } finally {
          unlinkSafe(inFile);
          unlinkSafe(outFile);
        }
      };

      const handleWebp = async buffer => {
        if (effects.length === 0) {
          await sendWebpWithExif(buffer);
          return;
        }
        if (isAnimatedWebp(buffer)) {
          try {
            await processMedia(buffer, 'webp', true);
          } catch {
            await sendWebpWithExif(buffer);
          }
        } else {
          await processMedia(buffer, 'webp', false);
        }
      };

      if (/webp/i.test(mime)) {
        const buffer = await quoted.download();
        await handleWebp(buffer);
      } else if (/image/i.test(mime)) {
        const buffer = await quoted.download();
        const isGif = /gif/i.test(mime);
        const ext = /png/i.test(mime) ? 'png' : isGif ? 'gif' : 'jpg';
        await processMedia(buffer, ext, isGif);
      } else if (/video/i.test(mime)) {
        const secs = Number((quoted.msg || quoted).seconds || 0);
        if (secs > 30) {
          return msg.reply('《✧》 El video no puede durar más de 30 segundos.');
        }
        const buffer = await quoted.download();
        await processMedia(buffer, 'mp4', true);
      } else if (urlArg) {
        const buffer = await getBuffer(urlArg, { timeout: 25_000 });
        if (!buffer?.length) {
          return sock.reply(msg.chat, '《✧》 No pude descargar el archivo desde esa URL.', msg);
        }
        if (/\.webp(\?|$)/i.test(urlArg) || exif.isWebpBuffer(buffer)) {
          await handleWebp(buffer);
        } else if (/\.gif(\?|$)/i.test(urlArg) || exif.isGifBuffer(buffer)) {
          await processMedia(buffer, 'gif', true);
        } else if (/\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(urlArg) || exif.isMp4Buffer(buffer)) {
          await processMedia(buffer, 'mp4', true);
        } else {
          await processMedia(buffer, 'img', false);
        }
      } else {
        return sock.reply(
          msg.chat,
          `《✧》 Envía o responde a una imagen, video, GIF, sticker o URL para crear un sticker.\n> Usa *${usedPrefix + command} -list* para ver formas y efectos.`,
          msg
        );
      }
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
