import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import exif from '#core/exif';
import { uploadMedia, getBuffer, DEFAULT_UA } from '#simple';
import {
  BIGGERPICS_SITE,
  BIGGERPICS_MODELS,
  parseBiggerPicsArgs,
  decodeImage,
  encodeImage,
  restorePhotoTone,
  upscaleLocalPureJs,
  upscaleWithBiggerPics
} from '#biggerpics';

const { webpToPng, runFfmpeg } = exif;

async function normalizeForCloud(buffer) {
  const ft = await fileTypeFromBuffer(buffer).catch(() => null);
  if (ft?.mime === 'image/webp') {
    const png = await webpToPng(buffer);
    return { buffer: png, mime: 'image/png', ext: 'png' };
  }
  const mime = ft?.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  return { buffer, mime, ext };
}

async function enhanceViaPixelcut(buffer, scale = 2) {
  const { buffer: img, mime, ext } = await normalizeForCloud(buffer);
  const form = new FormData();
  form.append('image', new Blob([img], { type: mime }), `upscale_${Date.now()}.${ext}`);
  form.append('scale', String(scale === 4 ? 4 : 2));

  const res = await fetch('https://api2.pixelcut.app/image/upscale/v1', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'x-client-version': 'web',
      'x-locale': 'en',
      'user-agent': DEFAULT_UA
    },
    body: form,
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const resultUrl = json?.result_url;
  if (!resultUrl || !/^https?:\/\//i.test(resultUrl)) return null;
  const out = await getBuffer(resultUrl, { timeout: 35_000 });
  return out?.length > 1000 ? out : null;
}

async function enhanceViaPxPic(buffer) {
  const { buffer: img, mime, ext } = await normalizeForCloud(buffer);
  const fileName = `${crypto.randomBytes(5).toString('hex')}.${ext}`;
  const signRes = await axios.post(
    'https://pxpic.com/getSignedUrl',
    { folder: 'uploads', fileName },
    { headers: { 'Content-Type': 'application/json', 'User-Agent': DEFAULT_UA }, timeout: 20_000 }
  );
  const presigned = signRes.data?.presignedUrl;
  if (!presigned) return null;

  await axios.put(presigned, img, {
    headers: { 'Content-Type': mime },
    timeout: 30_000
  });

  const remoteUrl = `https://files.fotoenhancer.com/uploads/${fileName}`;
  const body = new URLSearchParams({
    imageUrl: remoteUrl,
    targetFormat: ext === 'png' ? 'png' : 'jpg',
    needCompress: 'no',
    imageQuality: '95',
    compressLevel: '6',
    fileOriginalExtension: ext,
    aiFunction: 'upscale',
    upscalingLevel: ''
  }).toString();

  const aiRes = await axios.post('https://pxpic.com/callAiFunction', body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': DEFAULT_UA
    },
    timeout: 45_000
  });
  const outUrl = aiRes.data?.resultImageUrl || aiRes.data?.result?.imageUrl;
  if (!outUrl || !/^https?:\/\//i.test(outUrl)) return null;
  const out = await getBuffer(outUrl, { timeout: 35_000 });
  return out?.length > 1000 ? out : null;
}

async function enhanceViaVectorInk(buffer) {
  const res = await fetch('https://us-central1-vector-ink.cloudfunctions.net/upscaleImage', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: '*/*',
      origin: 'https://vectorink.io',
      referer: 'https://vectorink.io/',
      'user-agent': DEFAULT_UA
    },
    body: JSON.stringify({ data: { image: buffer.toString('base64') } }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) return null;
  const json = await res.json();
  const inner = typeof json?.result === 'string' ? JSON.parse(json.result) : json?.result;
  const b64 = inner?.image?.b64_json;
  if (!b64) return null;
  const raw = Buffer.from(b64, 'base64');
  if (raw.length < 500) return null;
  const ft = await fileTypeFromBuffer(raw).catch(() => null);
  return ft?.mime === 'image/webp' ? await webpToPng(raw) : raw;
}

async function enhanceViaApis(buffer, scale = 2) {
  const uploaded = await uploadMedia(buffer).catch(() => null);
  if (!uploaded?.url) return null;
  const enc = encodeURIComponent(uploaded.url);
  const px = scale === 4 ? 4 : 2;
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const endpoints = [
    `${vreden}/api/v1/artificial/remini?url=${enc}&pixel=${px}`,
    `https://api.siputzx.my.id/api/iloveimg/upscale?image=${enc}&scale=${px}`,
    `${delirius}/tools/hd?url=${enc}`,
    `https://api.ryuzei.xyz/tools/remini?url=${enc}`,
    ...(yuki?.url ? [`${yuki.url}/tools/hd?url=${enc}&key=${yuki.key}`] : [])
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 40_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const raw = Buffer.from(res.data);
      if (ct.includes('application/json')) {
        const j = JSON.parse(raw.toString('utf8'));
        const imgUrl =
          j?.result?.url ||
          j?.data?.url ||
          j?.url ||
          (typeof j?.result === 'string' ? j.result : null) ||
          (typeof j?.data === 'string' ? j.data : null);
        if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
          const dl = await getBuffer(imgUrl, { timeout: 30_000 });
          if (dl?.length > 1000) return dl;
        }
        continue;
      }
      if (ct.startsWith('image/') && raw.length > 1000) return raw;
    } catch {}
  }
  return null;
}

async function enhanceLocal(buffer, scale = 2, restoreTone = false) {
  const tag = crypto.randomBytes(6).toString('hex');
  const inFile = path.join(os.tmpdir(), `denji-hd-in-${tag}.img`);
  const outFile = path.join(os.tmpdir(), `denji-hd-out-${tag}.jpg`);
  const factor = scale === 4 ? 4 : scale === 1 ? 1 : 2;
  fs.writeFileSync(inFile, buffer);
  try {
    const scaleExpr =
      factor === 1
        ? 'unsharp=5:5:1.1:5:5:0.0'
        : `scale='min(2048,iw*${factor})':'min(2048,ih*${factor})':flags=lanczos,unsharp=5:5:0.85:5:5:0.0`;
    await runFfmpeg(['-y', '-i', inFile, '-frames:v', '1', '-vf', scaleExpr, '-q:v', '2', outFile]);
    return fs.readFileSync(outFile);
  } catch {
    let img = await decodeImage(buffer);
    if (restoreTone) img = restorePhotoTone(img, 0.75);
    const up = upscaleLocalPureJs(img, factor, 2048);
    return encodeImage(up, 'auto', 95).buffer;
  } finally {
    try { if (fs.existsSync(inFile)) fs.unlinkSync(inFile); } catch {}
    try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch {}
  }
}

function buildModesHelp(usedPrefix, command) {
  const cmd = `${usedPrefix}${command}`;
  return (
    `✿ *Mejora de Imágenes — bigger.pics*\n\n` +
    `Responde o envía una imagen (JPG, PNG o WebP, hasta 16 MB) con:\n\n` +
    `ꕤ *${cmd}* — ${BIGGERPICS_MODELS.auto.label}\n` +
    `ꕤ *${cmd} 4x* — ${BIGGERPICS_MODELS['4x'].label}\n` +
    `ꕤ *${cmd} anime* — ${BIGGERPICS_MODELS.anime.label}\n` +
    `ꕤ *${cmd} anime 4x* — ${BIGGERPICS_MODELS.anime4x.label}\n` +
    `ꕤ *${cmd} fast* — ${BIGGERPICS_MODELS.fast.label}\n` +
    `ꕤ *${cmd} deblur* — ${BIGGERPICS_MODELS.deblur.label}\n` +
    `ꕤ *${cmd} restore* — ${BIGGERPICS_MODELS.restore.label}\n` +
    `ꕤ *${cmd} web* — Sube la foto y genera el enlace para abrirla en *bigger.pics* (4K y control de creatividad)\n\n` +
    `> ✎ Añade *png* si quieres recibirla sin compresión JPEG · Motor: ${BIGGERPICS_SITE}`
  );
}

export default {
  command: ['hd', 'enhance', 'remini', 'upscale', 'biggerpics'],
  category: 'utils',
  description: 'Mejorar y escalar imágenes hasta 4× con IA (bigger.pics).',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const parsed = parseBiggerPicsArgs(args);

      if (parsed.mode === 'help') {
        return msg.reply(buildModesHelp(usedPrefix, command));
      }

      const q = msg.quoted || msg;
      const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
      const isSticker = mime === 'image/webp' && Boolean(q?.msg?.isAnimated);

      if (isSticker) {
        return msg.reply('《✧》 Los stickers animados no se pueden mejorar con este comando. Usa una imagen o sticker fijo.');
      }

      if (!mime || !/^image\/(jpe?g|png|webp|avif)$/i.test(mime)) {
        if (parsed.mode === 'web') {
          return msg.reply(
            `✿ *bigger.pics — Escalado IA hasta 4K*\n\n` +
            `│ꕥ *General ::* ${BIGGERPICS_SITE}\n` +
            `│❀ *Anime ::* ${BIGGERPICS_SITE}/tools/anime\n` +
            `│✦ *4K ::* ${BIGGERPICS_SITE}/tools/4k\n` +
            `│⚘ *Deblur ::* ${BIGGERPICS_SITE}/tools/deblur\n` +
            `│○ *Restaurar ::* ${BIGGERPICS_SITE}/tools/restore\n\n` +
            `> ✎ También puedes responder a una foto con *${usedPrefix + command} web* para obtener su enlace directo.`
          );
        }
        return msg.reply(
          `《✧》 Envía o responde a una *imagen* con *${usedPrefix + command}* _(motor bigger.pics)_.\n` +
          `> Modos: *4x* · *anime* · *anime 4x* · *deblur* · *restore* · *fast* · *web*\n` +
          `> Detalles: *${usedPrefix + command} modelos*`
        );
      }

      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar la imagen.');
      }
      if (buffer.length > 16 * 1024 * 1024) {
        return msg.reply('《✧》 La imagen supera el límite máximo de *16 MB* de bigger.pics.');
      }

      const presetMeta = BIGGERPICS_MODELS[parsed.preset] || BIGGERPICS_MODELS.auto;

      // Modo web: sube la imagen y entrega enlace directo para pegarla en bigger.pics (GPU 4K / creatividad).
      if (parsed.mode === 'web') {
        const norm = await normalizeForCloud(buffer).catch(() => ({ buffer }));
        const uploaded = await uploadMedia(norm.buffer).catch(() => null);
        if (!uploaded?.url) {
          return msg.reply(
            `✿ *Abrir en bigger.pics*\n\n` +
            `> ✦ *Herramienta ::* ${presetMeta.toolUrl}\n` +
            `> ✦ *Anime ::* ${BIGGERPICS_SITE}/tools/anime\n` +
            `> ✦ *4K ::* ${BIGGERPICS_SITE}/tools/4k\n\n` +
            `《✧》 No se pudo generar el enlace temporal de tu foto; súbela directamente en la página.`
          );
        }
        return msg.reply(
          `✿ *bigger.pics — Escalado en navegador*\n\n` +
          `│ꕥ *Herramienta ::* ${presetMeta.toolUrl}\n` +
          `│❀ *4K ::* ${BIGGERPICS_SITE}/tools/4k\n` +
          `│⚘ *Tu imagen ::* ${uploaded.url}\n\n` +
          `> ✎ Abre *${presetMeta.toolUrl}* y pega el enlace de tu imagen para escalarla en GPU hasta 4K y ajustar la creatividad (0 a 1).`
        );
      }

      // 1) Motor principal: super-resolución IA de bigger.pics (Model Lab ONNX WASM).
      const bpResult = await upscaleWithBiggerPics(buffer, {
        preset: parsed.preset,
        maxOutputSide: parsed.maxOutputSide,
        format: parsed.format
      }).catch(() => null);

      if (bpResult?.buffer?.length) {
        const caption =
          `✿ *Imagen mejorada con bigger.pics*\n` +
          `> ✦ *Modelo ::* ${bpResult.model} (${bpResult.scale}×)\n` +
          `> ✦ *Resolución ::* ${bpResult.inputWidth}×${bpResult.inputHeight} → *${bpResult.width}×${bpResult.height}*`;

        if (parsed.format === 'png') {
          return sock.sendMessage(
            msg.chat,
            {
              document: bpResult.buffer,
              mimetype: 'image/png',
              fileName: `biggerpics_${bpResult.preset}_${bpResult.width}x${bpResult.height}.png`,
              caption
            },
            { quoted: msg }
          );
        }

        return sock.sendMessage(
          msg.chat,
          { image: bpResult.buffer, caption },
          { quoted: msg }
        );
      }

      // 2) Respaldo automático en la nube y local si la descarga inicial del modelo no está disponible.
      const targetScale = presetMeta.scale;
      const fallback =
        (targetScale > 1 ? await enhanceViaPixelcut(buffer, targetScale).catch(() => null) : null) ||
        (targetScale > 1 ? await enhanceViaPxPic(buffer).catch(() => null) : null) ||
        (targetScale > 1 ? await enhanceViaApis(buffer, targetScale).catch(() => null) : null) ||
        (targetScale > 1 ? await enhanceViaVectorInk(buffer).catch(() => null) : null) ||
        (await enhanceLocal(buffer, targetScale, Boolean(presetMeta.restoreTone)).catch(() => null));

      if (!fallback?.length) {
        return msg.reply(
          `《✧》 No se pudo mejorar la imagen en este momento.\n` +
          `> También puedes mejorarla gratis en *${presetMeta.toolUrl}*.`
        );
      }

      await sock.sendMessage(
        msg.chat,
        {
          image: fallback,
          caption: `✿ *Imagen mejorada con éxito* (${targetScale}×)`
        },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
