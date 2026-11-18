import QRCode from 'qrcode';

export default {
  command: ['qrcode', 'genqr', 'crearqr'],
  category: 'utils',
  description: 'Generar un código QR en imagen a partir de texto o enlace.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const content =
      args.join(' ').trim() ||
      String(msg.quoted?.text || msg.quoted?.caption || '').trim();

    if (!content) {
      return msg.reply(
        `《✧》 Escribe el texto o enlace (o responde a un mensaje) para generar su código QR.\n` +
        `> Ejemplo: *${usedPrefix + command} https://bigger.pics*`
      );
    }

    if (content.length > 1500) {
      return msg.reply('《✧》 El texto es demasiado largo para un código QR (máximo 1500 caracteres).');
    }

    try {
      const png = await QRCode.toBuffer(content, {
        type: 'png',
        width: 768,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#111111', light: '#FFFFFF' }
      });

      const preview = content.length > 120 ? content.slice(0, 117) + '…' : content;
      await sock.sendMessage(
        msg.chat,
        { image: png, caption: `✿ *Código QR generado*\n> ${preview}` },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
