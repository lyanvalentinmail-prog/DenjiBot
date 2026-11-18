export default {
  command: ['restart', 'reiniciar'],
  category: 'owner',
  description: 'Reiniciar el socket del bot.',
  isOwner: true,
  run: async ({ msg, sock }) => {
    await sock.reply(msg.chat, `✎ Reiniciando el Socket...\n> *Espere un momento...*`, msg);
    setTimeout(() => {
      if (typeof process.send === 'function') {
        try { process.send({ type: 'restart' }); } catch { process.exit(0); }
        setTimeout(() => process.exit(0), 2500).unref();
      } else {
        process.exit(0);
      }
    }, 1500);
  },
};
