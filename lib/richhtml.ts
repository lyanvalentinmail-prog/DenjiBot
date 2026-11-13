import crypto from 'node:crypto';
import { generateMessageIDV2 } from '@whiskeysockets/baileys';

/*
 * HTML dentro del chat.
 *
 * WhatsApp dibuja las respuestas de Meta AI con un mensaje "rich response".
 * Una de sus piezas es una vista HTML: el cliente la muestra dentro de la
 * propia burbuja, con su CSS y su JavaScript, sin archivos ni enlaces.
 *
 * Es un formato interno de WhatsApp y no está documentado: funciona en los
 * clientes que lo reconocen y puede cambiar entre versiones. Que el envío
 * termine bien solo significa que WhatsApp aceptó el mensaje, no que todos
 * los teléfonos lo vayan a dibujar. Por eso quien lo use debe ofrecer
 * siempre una alternativa (ver `commands/tools/hora.ts`).
 */

/** Límite observado para el HTML de una vista. */
export const MAX_HTML_BYTES = 60 * 1024;

const HTML_PRIMITIVE = 'GenAIaeacdsnwHtmlPrimitive';
// No es el número del bot: forma parte de los metadatos del sobre que los clientes reconocen.
const RICH_BOT_JID = '867051314767696@bot';

/**
 * Construye el mensaje con la vista HTML.
 *
 * `html` debe ser autocontenido (sin recursos externos). `title` es el texto
 * que acompaña a la vista para los clientes que no la dibujan.
 */
export function buildHtmlMessage(html: string, title: string): any {
    const bytes = Buffer.byteLength(html, 'utf8');
    if (!html.trim()) throw new Error('El HTML está vacío.');
    if (bytes > MAX_HTML_BYTES) throw new Error(`El HTML ocupa ${bytes} bytes; el máximo es ${MAX_HTML_BYTES}.`);

    const responseId = crypto.randomUUID();
    const response = {
        response_id: responseId,
        sections: [
            {
                view_model: {
                    primitive: {
                        __typename: HTML_PRIMITIVE,
                        payload: html,
                        trusted_sources: [] as string[]
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            }
        ]
    };

    return {
        messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
                messageDisclaimerText: '',
                botResponseId: responseId
            }
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [{ messageType: 2, messageText: title }],
                    unifiedResponse: {
                        data: Buffer.from(JSON.stringify(response), 'utf8')
                    },
                    // Se deja el sobre mínimo: añadir la cita del mensaje original u otros
                    // contextos hace que algunos clientes dejen de reconocerlo.
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { botJid: RICH_BOT_JID },
                        forwardOrigin: 4
                    }
                }
            }
        }
    };
}

/** Envía una vista HTML que se muestra dentro del chat. Lanza un error si WhatsApp rechaza el envío. */
export async function sendHtml(sock: any, jid: string, html: string, title: string): Promise<{ key: any; message: any }> {
    if (typeof sock?.relayMessage !== 'function') throw new Error('La conexión no permite enviar este tipo de mensaje.');

    const message = buildHtmlMessage(html, title);
    const messageId = generateMessageIDV2(sock.user?.id);
    await sock.relayMessage(jid, message, { messageId });

    return { key: { remoteJid: jid, fromMe: true, id: messageId }, message };
}
