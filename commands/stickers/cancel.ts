import { cancelPack } from '../../lib/stickerpack.ts';

export default {
    command: ['cancel', 'cancelar'],
    description: 'Cancela el pack de stickers que estás creando',
    category: 'stickers',
    run: (ctx: any) => cancelPack(ctx)
};
