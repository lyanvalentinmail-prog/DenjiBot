import vm from 'node:vm';
import { format } from 'node:util';
import { createRequire } from 'node:module';

function checkSyntax(code) {
  try {
    new vm.Script(`(async function() {\n${code}\n})`, { filename: 'Execution Function' });
    return null;
  } catch (err) {
    return err instanceof SyntaxError ? (err.stack?.split('\n').slice(0, 5).join('\n') || err.message) : null;
  }
}

export default {
  command: ['ex', 'e'],
  category: 'owner',
  description: 'Ejecutar código JavaScript en el bot.',
  isOwner: true,
  run: async ({ msg, sock, args, command, text, __dirname }) => {
    const require = createRequire(import.meta.url);
    if (!text.trim()) {
      return sock.reply(msg.chat, '《✧》 Debes escribir un comando a ejecutar.', msg);
    }
    const _text = (command === 'e' ? 'return ' : '') + text;
    let _return;
    let _syntax = '';
    try {
      await msg.react('🕒');
      let i = 15;
      const f = { exports: {} };
      const exec = new (async () => {}).constructor(
        'print', 'msg', 'sock', 'require', 'Array', 'process', 'args', 'module', 'exports', 'argument',
        _text
      );
      _return = await exec.call(
        sock,
        (...pArgs) => {
          if (--i < 1) return;
          return sock.reply(msg.chat, format(...pArgs), msg);
        },
        msg, sock, require, Array, process, args, f, f.exports, [sock]
      );
      await msg.react('✔️');
    } catch (e) {
      const err = checkSyntax(_text);
      if (err) _syntax = '```' + err + '```\n\n';
      _return = e;
      await msg.react('✖️');
    } finally {
      sock.reply(msg.chat, _syntax + format(_return), msg);
    }
  }
};
