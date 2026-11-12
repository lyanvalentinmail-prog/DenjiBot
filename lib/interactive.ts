import fs from 'node:fs';
import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

/**
 * Mensajes interactivos de WhatsApp (menú de lista).
 *
 * Baileys no envía por sí solo los nodos que WhatsApp necesita para mostrar
 * este tipo de mensajes, así que se construyen aquí y se envían con
 * `relayMessage`. Al elegir una opción, WhatsApp devuelve el `id` de la fila
 * y `lib/simple.ts` lo convierte en el texto del mensaje (por ejemplo
 * `.menu admin`), por lo que se procesa como un comando normal.
 */

export interface ListRow {
    title: string;
    description?: string;
    id: string;
}

export interface ListSection {
    title: string;
    rows: ListRow[];
}

export interface ListOptions {
    title?: string;
    text: string;
    footer?: string;
    buttonText: string;
    sections: ListSection[];
    /** Ruta local o URL de una imagen para la cabecera (opcional). */
    image?: string;
}

async function buildHeader(sock: any, options: ListOptions): Promise<any> {
    const header: any = { title: options.title || '', hasMediaAttachment: false };
    if (!options.image) return header;

    try {
        const isUrl = /^https?:\/\//i.test(options.image);
        const image = isUrl ? { url: options.image } : fs.readFileSync(options.image);
        const media = await prepareWAMessageMedia({ image } as any, { upload: sock.waUploadToServer });
        if (media?.imageMessage) {
            header.hasMediaAttachment = true;
            header.imageMessage = media.imageMessage;
        }
    } catch {
        // Sin imagen el menú se envía igualmente.
    }
    return header;
}

export function buildListContent(options: ListOptions, header: any): any {
    return {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: {
                    header,
                    body: { text: options.text },
                    footer: { text: options.footer || '' },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: 'single_select',
                                buttonParamsJson: JSON.stringify({
                                    title: options.buttonText,
                                    sections: options.sections
                                })
                            }
                        ],
                        messageParamsJson: ''
                    }
                }
            }
        }
    };
}

export async function sendList(sock: any, jid: string, options: ListOptions, quoted?: any): Promise<any> {
    const header = await buildHeader(sock, options);
    const content = buildListContent(options, header);

    const message = generateWAMessageFromContent(jid, content, {
        userJid: sock.user?.id,
        quoted
    } as any);

    const additionalNodes: any[] = [
        {
            tag: 'biz',
            attrs: {},
            content: [
                {
                    tag: 'interactive',
                    attrs: { type: 'native_flow', v: '1' },
                    content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                }
            ]
        }
    ];

    if (!jid.endsWith('@g.us')) {
        additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    }

    await sock.relayMessage(jid, message.message, {
        messageId: message.key.id,
        additionalNodes
    });

    return message;
}
