import { finishPack } from '../../lib/stickerpack.ts';

export default {
    command: ['done', 'listo'],
    description: 'Termina tu pack de stickers y lo envía',
    usage: '[nombre | autor]',
    category: 'stickers',
    run: (ctx: any) => finishPack(ctx)
};
