import crypto from 'node:crypto';
import { generateMessageIDV2 } from '@whiskeysockets/baileys';

/*
 * HTML dentro del chat.
 *
 * WhatsApp dibuja las respuestas de Meta AI con un mensaje "rich response".
 * Una de sus piezas es una vista HTML: la aplicación la muestra dentro de la
 * propia burbuja, con su CSS y su JavaScript, sin archivos ni enlaces.
 *
 * Es un formato interno de WhatsApp y no está documentado. Lo que se sabe:
 *
 * - Solo lo dibuja la aplicación del teléfono. WhatsApp Web y Escritorio no
 *   tienen esa pieza: ahí solo aparece el texto de `label`.
 * - El mensaje debe ir envuelto como un reenvío de Meta AI (`botForwardedMessage`);
 *   sin ese envoltorio el teléfono no muestra nada.
 * - No se envían firmas de verificación: una firma inventada hace que el
 *   teléfono marque el mensaje como "no verificado" y oculte su contenido.
 * - Algunos teléfonos dejan la tarjeta plegada (solo el título) hasta que llega
 *   una edición con el mismo contenido; por eso se envía esa edición justo después.
 * - Cada cuenta tiene interruptores que decide WhatsApp desde sus servidores.
 *   Un mensaje correcto puede no dibujarse en una cuenta concreta y desde aquí
 *   no hay forma de saberlo: que el envío termine bien solo significa que
 *   WhatsApp aceptó el mensaje.
 *
 * Por todo eso quien use este módulo debe acompañar la vista con algo que se
 * vea siempre (ver `commands/tools/hora.ts`).
 */

/** Límite prudente para el HTML de una vista. */
export const MAX_HTML_BYTES = 60 * 1024;

const HTML_PRIMITIVE = 'GenAIaeacdsnwHtmlPrimitive';
// No es el número del bot: forma parte de los metadatos de un reenvío de Meta AI.
const RICH_BOT_JID = '867051314767696@bot';
const FORWARD_ORIGIN_META_AI = 4;
const BOT_ENTRY_POINT_META_AI_FORWARD = 31;
const MESSAGE_EDIT = 14;

export type HtmlMessageOptions = {
    /** Línea que aparece sobre la vista (y lo único visible si el teléfono pliega la tarjeta). */
    title?: string;
    /** Texto para los clientes que no dibujan la vista (WhatsApp Web y Escritorio). */
    label?: string;
};

// El JSON viaja solo con caracteres ASCII: así no depende de cómo lea el texto cada cliente.
const asciiJson = (value: unknown): string =>
    JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));

/**
 * Construye el mensaje con la vista HTML.
 *
 * `html` debe ser autocontenido: dentro de la vista no hay red para cargar
 * imágenes, estilos ni scripts externos.
 */
export function buildHtmlMessage(html: string, options: HtmlMessageOptions = {}): any {
    if (typeof html !== 'string' || !html.trim()) throw new Error('El HTML está vacío.');
    const bytes = Buffer.byteLength(html, 'utf8');
    if (bytes > MAX_HTML_BYTES) throw new Error(`El HTML ocupa ${bytes} bytes; el máximo es ${MAX_HTML_BYTES}.`);

    const title = String(options.title || '').trim();
    const label = String(options.label || '').trim();
    const responseId = crypto.randomUUID();

    const response = {
        response_id: responseId,
        sections: [
            {
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    primitive: {
                        payload: html,
                        trusted_sources: [] as string[],
                        __typename: HTML_PRIMITIVE
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
                ...(title ? { messageDisclaimerText: title } : {}),
                botResponseId: responseId
            }
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: label ? [{ messageType: 2, messageText: label }] : [],
                    unifiedResponse: {
                        data: Buffer.from(asciiJson(response), 'utf8')
                    },
                    // Los mismos datos que lleva un reenvío real de Meta AI. No se añade la cita
                    // del mensaje original ni otros contextos: con ellos hay clientes que piden
                    // "Actualizar WhatsApp" en vez de dibujar la vista.
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { botJid: RICH_BOT_JID },
                        forwardOrigin: FORWARD_ORIGIN_META_AI,
                        botMessageSharingInfo: {
                            botEntryPointOrigin: BOT_ENTRY_POINT_META_AI_FORWARD,
                            forwardScore: 1
                        }
                    }
                }
            }
        }
    };
}

/** Edición que repite el contenido de una vista ya enviada, con el mismo envoltorio. */
export function buildHtmlRefresh(jid: string, messageId: string, message: any): any {
    return {
        botForwardedMessage: {
            message: {
                protocolMessage: {
                    key: { remoteJid: jid, fromMe: true, id: messageId },
                    type: MESSAGE_EDIT,
                    editedMessage: message
                }
            }
        }
    };
}

export type SendHtmlResult = {
    key: { remoteJid: string; fromMe: true; id: string };
    message: any;
    /** `true` si también salió la edición que hace aparecer la tarjeta plegada. */
    refreshed: boolean;
};

/**
 * Envía una vista HTML que se muestra dentro del chat.
 *
 * Lanza un error si WhatsApp rechaza el envío. Que no lo lance no garantiza
 * que el teléfono de quien la recibe la dibuje.
 */
export async function sendHtml(sock: any, jid: string, html: string, options: HtmlMessageOptions = {}): Promise<SendHtmlResult> {
    if (typeof sock?.relayMessage !== 'function') throw new Error('La conexión no permite enviar este tipo de mensaje.');

    const message = buildHtmlMessage(html, options);
    const messageId = generateMessageIDV2(sock.user?.id);
    await sock.relayMessage(jid, message, { messageId });

    let refreshed = false;
    try {
        await sock.relayMessage(jid, buildHtmlRefresh(jid, messageId, message), { messageId: generateMessageIDV2(sock.user?.id) });
        refreshed = true;
    } catch (error: any) {
        // La vista ya salió; la edición es solo un refuerzo.
        console.error('[HTML] No se pudo enviar la edición de refuerzo:', error?.message || error);
    }

    return { key: { remoteJid: jid, fromMe: true, id: messageId }, message, refreshed };
}
