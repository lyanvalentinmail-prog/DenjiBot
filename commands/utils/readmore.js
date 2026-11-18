const SPOILER_PAD = String.fromCharCode(8206).repeat(4001);

export default {
  command: ['readmore', 'leermas', 'spoiler'],
  category: 'utils',
  description: 'Ocultar texto detrás del botón "Leer más" de WhatsApp.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const raw = args.join(' ').trim();
    if (!raw) {
      return msg.reply(
        `《✧》 Separa el texto visible y el oculto con *|*.\n` +
        `> Ejemplo: *${usedPrefix + command} Toca leer más | ¡Sorpresa!*`
      );
    }

    let front = '⚠️ *Spoiler*';
    let back = raw;
    if (raw.includes('|')) {
      const [l, ...r] = raw.split('|');
      front = l.trim() || front;
      back = r.join('|').trim();
    }

    await sock.sendMessage(msg.chat, { text: `${front}${SPOILER_PAD}${back}` }, { quoted: msg });
  }
};
