import axios from 'axios';
import db from '#db';
import exif from '#core/exif';
import { getBuffer, DEFAULT_UA } from '#simple';

const { gifToMp4, isMp4Buffer, isGifBuffer } = exif;

const symbols = ['(⁠◠⁠‿⁠◕⁠)', '˃͈◡˂͈', '૮(˶ᵔᵕᵔ˶)ა', '(づ｡◕‿‿◕｡)づ', '(✿◡‿◡)', '(꒪⌓꒪)', '(✿✪‿✪｡)', '(*≧ω≦)', '(✧ω◕)', '˃ 𖥦 ˂', '(⌒‿⌒)', '(¬‿¬)', '(✧ω✧)', '✿(◕ ‿◕)✿', 'ʕ•́ᴥ•̀ʔっ', '(ㅇㅅㅇ❀)', '(∩︵∩)', '(✪ω✪)', '(✯◕‿◕✯)', '(•̀ᴗ•́)و ̑̑'];
const getRandomSymbol = () => symbols[Math.floor(Math.random() * symbols.length)];

const captions = {
  peek: (from, to) => from === to ? 'está espiando detrás de una puerta por diversión.' : 'está espiando a',
  comfort: (from, to) => from === to ? 'se está consolando a sí mismo.' : 'está consolando a',
  thinkhard: (from, to) => from === to ? 'se quedó pensando muy intensamente.' : 'está pensando profundamente en',
  curious: (from, to) => from === to ? 'se muestra curioso por todo.' : 'está curioso por lo que hace',
  sniff: (from, to) => from === to ? 'se olfatea como si buscara algo raro.' : 'está olfateando a',
  stare: (from, to) => from === to ? 'se queda mirando al techo sin razón.' : 'se queda mirando fijamente a',
  trip: (from, to) => from === to ? 'se tropezó consigo mismo, otra vez.' : 'tropezó accidentalmente con',
  blowkiss: (from, to) => from === to ? 'se manda un beso al espejo.' : 'le lanzó un beso a',
  snuggle: (from, to) => from === to ? 'se acurruca con una almohada suave.' : 'se acurruca dulcemente con',
  sleep: (from, to) => from === to ? 'está durmiendo plácidamente.' : 'está durmiendo con',
  cold: (from, to) => from === to ? 'tiene mucho frío.' : 'se congela por el frío de',
  sing: (from, to) => from === to ? 'está cantando.' : 'le está cantando a',
  tickle: (from, to) => from === to ? 'se está haciendo cosquillas.' : 'le está haciendo cosquillas a',
  scream: (from, to) => from === to ? 'está gritando al viento.' : 'le está gritando a',
  push: (from, to) => from === to ? 'se empujó a sí mismo.' : 'empujó a',
  nope: (from, to) => from === to ? 'expresa claramente su desacuerdo.' : 'dice "¡No!" a',
  jump: (from, to) => from === to ? 'salta de felicidad.' : 'salta feliz con',
  heat: (from, to) => from === to ? 'siente mucho calor.' : 'tiene calor por',
  gaming: (from, to) => from === to ? 'está jugando solo.' : 'está jugando con',
  draw: (from, to) => from === to ? 'hace un lindo dibujo.' : 'dibuja inspirado en',
  call: (from, to) => from === to ? 'marca su propio número esperando respuesta.' : 'llamó al número de',
  seduce: (from, to) => from === to ? 'lanzó una mirada seductora al vacío.' : 'está intentando seducir a',
  shy: (from, to, genero) => from === to ? 'se sonrojó tímidamente y desvió la mirada.' : `se siente demasiado ${genero === 'Hombre' ? 'tímido' : genero === 'Mujer' ? 'tímida' : 'tímide'} para mirar a`,
  slap: (from, to, genero) => from === to ? `se dio una bofetada a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'}.` : 'le dio una bofetada a',
  bath: (from, to) => from === to ? 'se está bañando.' : 'está bañando a',
  angry: (from, to, genero) => from === to ? `está muy ${genero === 'Hombre' ? 'enojado' : genero === 'Mujer' ? 'enojada' : 'enojadx'}.` : `está super ${genero === 'Hombre' ? 'enojado' : genero === 'Mujer' ? 'enojada' : 'enojadx'} con`,
  bored: (from, to, genero) => from === to ? `está muy ${genero === 'Hombre' ? 'aburrido' : genero === 'Mujer' ? 'aburrida' : 'aburridx'}.` : `está ${genero === 'Hombre' ? 'aburrido' : genero === 'Mujer' ? 'aburrida' : 'aburridx'} de`,
  bite: (from, to, genero) => from === to ? `se mordió ${genero === 'Hombre' ? 'solito' : genero === 'Mujer' ? 'solita' : 'solitx'}.` : 'mordió a',
  bleh: (from, to) => from === to ? 'se sacó la lengua frente al espejo.' : 'le está haciendo muecas con la lengua a',
  bonk: (from, to, genero) => from === to ? `se dio un bonk a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'}.` : 'le dio un golpe a',
  blush: (from, to) => from === to ? 'se sonrojó.' : 'se sonrojó por',
  bully: (from, to, genero) => from === to ? `se hace bullying ${genero === 'Hombre' ? 'él mismo' : genero === 'Mujer' ? 'ella misma' : 'el/ella mismx'}… alguien ${genero === 'Hombre' ? 'que lo abrace' : genero === 'Mujer' ? 'que la abrace' : 'que lx ayude'}.` : 'le está haciendo bullying a',
  cry: (from, to) => from === to ? 'está llorando.' : 'está llorando por',
  happy: (from, to) => from === to ? 'está feliz.' : 'está feliz con',
  coffee: (from, to) => from === to ? 'está tomando café.' : 'está tomando café con',
  clap: (from, to) => from === to ? 'está aplaudiendo por algo.' : 'está aplaudiendo por',
  cringe: (from, to) => from === to ? 'siente cringe.' : 'siente cringe por',
  dance: (from, to) => from === to ? 'está bailando.' : 'está bailando con',
  cuddle: (from, to, genero) => from === to ? `se acurrucó ${genero === 'Hombre' ? 'solo' : genero === 'Mujer' ? 'sola' : 'solx'}.` : 'se acurrucó con',
  drunk: (from, to, genero) => from === to ? `está demasiado ${genero === 'Hombre' ? 'borracho' : genero === 'Mujer' ? 'borracha' : 'borrachx'}.` : `está ${genero === 'Hombre' ? 'borracho' : genero === 'Mujer' ? 'borracha' : 'borrachx'} con`,
  dramatic: (from, to) => from === to ? 'está haciendo un drama exagerado.' : 'le está haciendo un drama a',
  handhold: (from, to, genero) => from === to ? `se dio la mano consigo ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'}.` : 'le agarró la mano a',
  eat: (from, to) => from === to ? 'está comiendo algo delicioso.' : 'está comiendo con',
  highfive: (from, to) => from === to ? 'se chocó los cinco frente al espejo.' : 'chocó los 5 con',
  hug: (from, to, genero) => from === to ? `se abrazó a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'}.` : 'le dio un abrazo a',
  kill: (from, to) => from === to ? 'se autoeliminó en modo dramático.' : 'asesinó a',
  kiss: (from, to) => from === to ? 'se mandó un beso al aire.' : 'le dio un beso a',
  kisscheek: (from, to) => from === to ? 'se besó en la mejilla usando un espejo.' : 'le dio un beso en la mejilla a',
  lick: (from, to) => from === to ? 'se lamió por curiosidad.' : 'lamió a',
  laugh: (from, to) => from === to ? 'se está riendo de algo.' : 'se está burlando de',
  pat: (from, to) => from === to ? 'se acarició la cabeza con ternura.' : 'le dio una caricia a',
  love: (from, to, genero) => from === to ? `se quiere mucho a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'}.` : 'siente atracción por',
  pout: (from, to, genero) => from === to ? `está haciendo pucheros ${genero === 'Hombre' ? 'solo' : genero === 'Mujer' ? 'sola' : 'solx'}.` : 'está haciendo pucheros con',
  punch: (from, to) => from === to ? 'lanzó un puñetazo al aire.' : 'le dio un puñetazo a',
  run: (from, to) => from === to ? 'está corriendo por su vida.' : 'está corriendo con',
  scared: (from, to, genero) => from === to ? `está ${genero === 'Hombre' ? 'asustado' : genero === 'Mujer' ? 'asustada' : 'asustadx'} por algo.` : `está ${genero === 'Hombre' ? 'asustado' : genero === 'Mujer' ? 'asustada' : 'asustadx'} por`,
  sad: (from, to) => from === to ? 'está triste.' : 'está expresando su tristeza a',
  smoke: (from, to) => from === to ? 'está fumando tranquilamente.' : 'está fumando con',
  smile: (from, to) => from === to ? 'está sonriendo.' : 'le sonrió a',
  spit: (from, to, genero) => from === to ? `se escupió a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'} por accidente.` : 'le escupió a',
  smug: (from, to) => from === to ? 'está presumiendo mucho últimamente.' : 'está presumiendo a',
  think: (from, to) => from === to ? 'está pensando profundamente.' : 'no puede dejar de pensar en',
  step: (from, to, genero) => from === to ? `se pisó a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'} por accidente.` : 'está pisando a',
  wave: (from, to, genero) => from === to ? `se saludó a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'} en el espejo.` : 'está saludando a',
  walk: (from, to) => from === to ? 'salió a caminar en soledad.' : 'decidió dar un paseo con',
  wink: (from, to, genero) => from === to ? `se guiñó a sí ${genero === 'Hombre' ? 'mismo' : genero === 'Mujer' ? 'misma' : 'mismx'} en el espejo.` : 'le guiñó a'
};

const alias = {
  angry: ['angry', 'enojado', 'enojada'],
  bleh: ['bleh', 'meh'],
  bored: ['bored', 'aburrido', 'aburrida'],
  clap: ['clap', 'aplaudir'],
  coffee: ['coffee', 'cafe', 'café'],
  dramatic: ['dramatic', 'drama'],
  drunk: ['drunk', 'ebria', 'ebrio'],
  cold: ['cold', 'frio', 'frío'],
  kisscheek: ['kisscheek', 'beso'],
  laugh: ['laugh', 'reír', 'reir'],
  love: ['love', 'amor'],
  pout: ['pout', 'mueca'],
  punch: ['punch', 'golpear'],
  run: ['run', 'correr'],
  sad: ['sad', 'triste'],
  scared: ['scared', 'asustado', 'asustada'],
  seduce: ['seduce', 'seducir'],
  shy: ['shy', 'timido', 'timida', 'tímido', 'tímida'],
  sleep: ['sleep', 'dormir'],
  smoke: ['smoke', 'fumar'],
  spit: ['spit', 'escupir'],
  step: ['step', 'pisar'],
  think: ['think', 'pensar'],
  walk: ['walk', 'caminar'],
  hug: ['hug', 'abrazar'],
  kill: ['kill', 'matar'],
  eat: ['eat', 'nom', 'comer'],
  kiss: ['kiss', 'muak', 'besar'],
  wink: ['wink', 'guiñar', 'guinar'],
  pat: ['pat', 'acariciar'],
  happy: ['happy', 'feliz'],
  bully: ['bully', 'molestar'],
  bite: ['bite', 'morder'],
  blush: ['blush', 'sonrojarse'],
  wave: ['wave', 'saludar'],
  bath: ['bath', 'bañarse', 'banarse'],
  smug: ['smug', 'presumir'],
  smile: ['smile', 'sonreir', 'sonreír'],
  highfive: ['highfive', 'chocar'],
  handhold: ['handhold', 'tomar'],
  cringe: ['cringe', 'avergonzarse', 'asco'],
  bonk: ['bonk', 'golpe'],
  cry: ['cry', 'llorar'],
  lick: ['lick', 'lamer'],
  slap: ['slap', 'bofetada'],
  dance: ['dance', 'bailar'],
  cuddle: ['cuddle', 'acurrucar'],
  sing: ['sing', 'cantar'],
  tickle: ['tickle', 'cosquillas'],
  scream: ['scream', 'gritar'],
  push: ['push', 'empujar'],
  nope: ['nope', 'nop'],
  jump: ['jump', 'saltar'],
  heat: ['heat', 'calor'],
  gaming: ['gaming', 'jugar'],
  draw: ['draw', 'dibujar'],
  call: ['call', 'llamar'],
  snuggle: ['snuggle', 'acurrucarse'],
  blowkiss: ['blowkiss', 'besito'],
  trip: ['trip', 'tropezar'],
  stare: ['stare', 'mirar'],
  sniff: ['sniff', 'oler'],
  curious: ['curious', 'curioso', 'curiosa'],
  thinkhard: ['thinkhard'],
  comfort: ['comfort', 'consolar'],
  peek: ['peek', 'espiar']
};

// Mapeo SFW a APIs públicas permanentes (nekos.best, otakugifs.xyz, waifu.pics)
const NEKOS_MAP = {
  angry: 'angry', baka: 'baka', bite: 'bite', blush: 'blush', bored: 'bored',
  cry: 'cry', cuddle: 'cuddle', dance: 'dance', happy: 'happy', handhold: 'handhold',
  highfive: 'highfive', hug: 'hug', kiss: 'kiss', laugh: 'laugh', nope: 'nope',
  pat: 'pat', pout: 'pout', punch: 'punch', run: 'run', sleep: 'sleep',
  slap: 'slap', smile: 'smile', smug: 'smug', stare: 'stare', think: 'think',
  tickle: 'tickle', wave: 'wave', wink: 'wink', eat: 'nom', snuggle: 'cuddle',
  kisscheek: 'kiss', blowkiss: 'kiss', love: 'cuddle', comfort: 'pat',
  thinkhard: 'think', jump: 'happy', sing: 'dance', call: 'wave',
  curious: 'stare', peek: 'peek', shy: 'blush', seduce: 'wink',
  sad: 'cry', scared: 'cry', scream: 'angry', push: 'punch',
  dramatic: 'facepalm', cringe: 'facepalm', bleh: 'bored', coffee: 'nom',
  clap: 'thumbsup', walk: 'run', gaming: 'happy', draw: 'smile',
  cold: 'shrug', heat: 'yawn', bath: 'blush', drunk: 'laugh',
  smoke: 'bored', spit: 'baka', step: 'kick', kill: 'kick',
  bonk: 'slap', bully: 'poke', lick: 'poke', sniff: 'poke', trip: 'facepalm'
};

const OTAKU_MAP = {
  angry: 'angry', bite: 'bite', bleh: 'bleh', blush: 'blush', clap: 'clap',
  cry: 'cry', cuddle: 'cuddle', dance: 'dance', handhold: 'handhold', happy: 'happy',
  hug: 'hug', kiss: 'kiss', kisscheek: 'airkiss', blowkiss: 'airkiss', laugh: 'laugh',
  lick: 'lick', love: 'love', nope: 'no', eat: 'nom', pat: 'pat', peek: 'peek',
  pout: 'pout', punch: 'punch', run: 'run', sad: 'sad', scared: 'scared',
  shy: 'shy', sleep: 'sleep', slap: 'slap', smile: 'smile', smug: 'smug',
  stare: 'stare', tickle: 'tickle', wave: 'wave', wink: 'wink',
  coffee: 'sip', snuggle: 'cuddle', comfort: 'pat', walk: 'run', scream: 'mad'
};

const WAIFUPICS_SET = new Set([
  'bully', 'cuddle', 'cry', 'hug', 'kiss', 'lick', 'pat', 'smug', 'bonk',
  'blush', 'smile', 'wave', 'highfive', 'handhold', 'nom', 'bite', 'slap',
  'kill', 'happy', 'wink', 'dance', 'cringe'
]);

const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function tryInteractionApi(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15_000,
    headers: { 'User-Agent': DEFAULT_UA }
  });
  const ct = String(res.headers?.['content-type'] || '').toLowerCase();
  const buf = Buffer.from(res.data);
  if (ct.includes('application/json') || (buf[0] === 0x7b && buf.length < 4096)) {
    const json = JSON.parse(buf.toString('utf8'));
    const mediaUrl = json?.result || json?.url || json?.data?.url || (typeof json?.data === 'string' ? json.data : null);
    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) return null;
    const dl = await getBuffer(mediaUrl, { timeout: 18_000 });
    return dl?.length > 500 ? { buffer: dl, url: mediaUrl } : null;
  }
  if ((ct.includes('video') || ct.includes('gif') || isMp4Buffer(buf) || isGifBuffer(buf)) && buf.length > 500) {
    return { buffer: buf, url: null };
  }
  return null;
}

async function fetchReactionMedia(action) {
  const yuki = global.APIs?.yuki;
  const sources = [
    ...(yuki?.url ? [() => tryInteractionApi(`${yuki.url}/sfw/interaction?inter=${action}&key=${yuki.key}`)] : []),
    () => tryInteractionApi(`https://api.stellarwa.xyz/sfw/interaction?inter=${action}&key=Midnight`),
    async () => {
      const tag = OTAKU_MAP[action];
      if (!tag) return null;
      const { data } = await axios.get(`https://api.otakugifs.xyz/gif?reaction=${tag}&format=gif`, { timeout: 12_000 });
      if (!data?.url) return null;
      return { buffer: await getBuffer(data.url, { timeout: 15_000 }), url: data.url };
    },
    async () => {
      const tag = NEKOS_MAP[action] || 'hug';
      const { data } = await axios.get(`https://nekos.best/api/v2/${tag}`, { timeout: 12_000 });
      const u = data?.results?.[0]?.url;
      if (!u) return null;
      return { buffer: await getBuffer(u, { timeout: 15_000 }), url: u };
    },
    async () => {
      const tag = action === 'eat' ? 'nom' : WAIFUPICS_SET.has(action) ? action : (NEKOS_MAP[action] && WAIFUPICS_SET.has(NEKOS_MAP[action]) ? NEKOS_MAP[action] : 'hug');
      const { data } = await axios.get(`https://api.waifu.pics/sfw/${tag}`, { timeout: 12_000 });
      if (!data?.url) return null;
      return { buffer: await getBuffer(data.url, { timeout: 15_000 }), url: data.url };
    }
  ];

  for (const fn of sources) {
    try {
      const out = await fn();
      if (out?.buffer?.length > 500) return out;
    } catch {}
  }
  return null;
}

const allCommands = Array.from(
  new Set(Object.values(alias).flat().filter(c => normalize(c) !== 'cafe' || c === 'cafe'))
);

export default {
  command: allCommands,
  category: 'anime',
  description: 'Comandos de reacciones de anime.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const normCmd = normalize(command);
    const currentCommand =
      Object.keys(alias).find(key => alias[key].some(a => normalize(a) === normCmd)) || normCmd;
    if (!captions[currentCommand]) return;

    const who = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender;
    const fromName = db.getUser(msg.sender)?.name || msg.pushName || '@' + msg.sender.split('@')[0];
    const toName = db.getUser(who)?.name || '@' + who.split('@')[0];
    const genero = db.getUser(msg.sender)?.genre || 'Oculto';
    const captionText = captions[currentCommand](fromName, toName, genero);
    const caption =
      who !== msg.sender
        ? `\`${fromName}\` ${captionText} \`${toName}\` ${getRandomSymbol()}`
        : `\`${fromName}\` ${captionText} ${getRandomSymbol()}`;
    const mentions = who !== msg.sender ? [who, msg.sender] : [msg.sender];

    try {
      const media = await fetchReactionMedia(currentCommand);
      if (!media?.buffer) {
        return msg.reply('《✧》 No se pudo obtener la animación en este momento. Intenta de nuevo.');
      }

      if (isMp4Buffer(media.buffer)) {
        await sock.sendMessage(
          msg.chat,
          { video: media.buffer, mimetype: 'video/mp4', gifPlayback: true, caption, mentions },
          { quoted: msg }
        );
        return;
      }

      // Si llega en formato GIF (nekos.best / otakugifs / waifu.pics), convertir a MP4 para que WhatsApp lo reproduzca animado.
      try {
        const mp4 = await gifToMp4(media.buffer);
        await sock.sendMessage(
          msg.chat,
          { video: mp4, mimetype: 'video/mp4', gifPlayback: true, caption, mentions },
          { quoted: msg }
        );
      } catch {
        await sock.sendMessage(
          msg.chat,
          { image: media.buffer, caption, mentions },
          { quoted: msg }
        );
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
