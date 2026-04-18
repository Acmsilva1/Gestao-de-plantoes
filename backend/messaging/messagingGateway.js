/**
 * Mensageria de domínio: ponto único para publicar eventos (RabbitMQ / futuros canais).
 * Os controllers não devem importar QueueService diretamente para eventos de negócio.
 */
import { queueService } from '../services/QueueService.js';

export async function publishManagerEscalaEvent(eventType, payload) {
    try {
        await queueService.publish(`manager.escala.${eventType}`, {
            eventType,
            at: new Date().toISOString(),
            ...payload
        });
    } catch (err) {
        console.error('[messaging] falha ao publicar evento de escala:', err.message);
    }
}
