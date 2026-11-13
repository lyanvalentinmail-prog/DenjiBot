import { startPack, finishPack, MAX_STICKERS } from '../../lib/stickerpack.ts';

// `.done` forma parte de `.spack`: es el paso que cierra el pack y lo envía.
// Por eso vive aquí y el menú solo muestra `.spack`.
const doneWords = new Set(['done', 'listo']);

export default {
    command: ['spack', 'stickerpack', 'done', 'listo'],
    description: `Crea un pack de stickers con tus fotos (hasta ${MAX_STICKERS}); cuando esté listo envíalo con done`,
    usage: '[nombre | autor]',
    category: 'stickers',
    run: (ctx: any) => {
        const command = String(ctx.command || '').toLowerCase();
        if (doneWords.has(command)) return finishPack(ctx);

        // `.spack done [nombre | autor]` hace lo mismo que `.done [nombre | autor]`.
        if (doneWords.has(String(ctx.args?.[0] || '').toLowerCase())) {
            const body = String(ctx.msg?.body || '').replace(/^(\S+)\s+\S+/, '$1');
            const msg = { ...ctx.msg, body };
            return finishPack({ ...ctx, msg, m: msg, args: ctx.args.slice(1) });
        }

        return startPack(ctx);
    }
};
