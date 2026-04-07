import amqp from 'amqplib';
import { env } from '../config/env.js';

class QueueService {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.connectingPromise = null;
        this.warnedDisabled = false;
        this.lastError = '';
    }

    isEnabled() {
        return Boolean(env.enableQueue && env.rabbitMqUrl);
    }

    async ensureChannel() {
        if (!this.isEnabled()) {
            if (!this.warnedDisabled && env.enableQueue) {
                console.warn('[queue] ENABLE_QUEUE ligado, mas RABBITMQ_URL ausente. Mensageria desativada.');
                this.warnedDisabled = true;
            }
            return null;
        }
        if (this.channel) return this.channel;
        if (this.connectingPromise) return this.connectingPromise;

        this.connectingPromise = (async () => {
            this.connection = await amqp.connect(env.rabbitMqUrl);
            this.connection.on('error', (err) => {
                console.error('[queue] erro de conexao RabbitMQ:', err.message);
                this.lastError = err.message;
                this.connection = null;
                this.channel = null;
            });
            this.connection.on('close', () => {
                this.connection = null;
                this.channel = null;
            });
            this.channel = await this.connection.createChannel();
            await this.channel.assertExchange(env.rabbitMqExchange, 'topic', { durable: true });
            this.lastError = '';
            console.log(`[queue] RabbitMQ conectado. Exchange: ${env.rabbitMqExchange}`);
            return this.channel;
        })();

        try {
            return await this.connectingPromise;
        } catch (err) {
            console.error('[queue] falha ao conectar RabbitMQ:', err.message);
            this.lastError = err.message;
            this.connection = null;
            this.channel = null;
            return null;
        } finally {
            this.connectingPromise = null;
        }
    }

    async publish(routingKey, payload) {
        const channel = await this.ensureChannel();
        if (!channel) return false;
        try {
            const body = Buffer.from(JSON.stringify(payload));
            return channel.publish(env.rabbitMqExchange, routingKey, body, {
                contentType: 'application/json',
                persistent: true
            });
        } catch (err) {
            console.error('[queue] erro ao publicar mensagem:', err.message);
            return false;
        }
    }

    async getHealth() {
        const enabled = this.isEnabled();
        if (!enabled) {
            return { enabled: false, connected: false, status: 'disabled', lastError: this.lastError || null };
        }
        const channel = await this.ensureChannel();
        const connected = Boolean(channel && this.connection);
        if (!connected) {
            return { enabled: true, connected: false, status: 'degraded', lastError: this.lastError || 'rabbitmq indisponivel' };
        }
        return { enabled: true, connected: true, status: 'ok', lastError: null };
    }
}

export const queueService = new QueueService();
