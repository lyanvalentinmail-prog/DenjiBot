export default {
  command: ['encuesta', 'poll'],
  category: 'group',
  description: 'Crear una encuesta nativa de WhatsApp en el grupo.',
  isGroup: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const raw = args.join(' ').trim();
    const parts = raw
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);

    if (parts.length < 3) {
      return msg.reply(
        `《✧》 Separa la pregunta y al menos 2 opciones usando *|*.\n` +
        `> Ejemplo: *${usedPrefix + command} ¿Mejor personaje? | Denji | Power | Aki*`
      );
    }

    const question = parts[0].slice(0, 255);
    const seen = new Set();
    const options = [];
    for (const opt of parts.slice(1)) {
      const clean = opt.slice(0, 100);
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        options.push(clean);
      }
    }

    if (options.length < 2) {
      return msg.reply('《✧》 Debes indicar al menos *2 opciones distintas*.');
    }
    if (options.length > 12) {
      return msg.reply('《✧》 WhatsApp permite un máximo de *12 opciones* por encuesta.');
    }

    try {
      await sock.sendMessage(
        msg.chat,
        {
          poll: {
            name: question,
            values: options,
            selectableCount: 1
          }
        },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
