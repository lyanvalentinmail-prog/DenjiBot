import { startPack, MAX_STICKERS } from '../../lib/stickerpack.ts';

export default {
    command: ['spack', 'stickerpack'],
    description: `Crea un pack de stickers con tus fotos (hasta ${MAX_STICKERS})`,
    usage: '[nombre | autor]',
    category: 'stickers',
    run: (ctx: any) => startPack(ctx)
};
