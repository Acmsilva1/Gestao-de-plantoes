import { createClient } from 'redis';
import { env } from '../config/env.js';

const CACHE_NAMESPACE = env.redisPrefix || 'gdp';

const buildCacheKey = (...parts) => `${CACHE_NAMESPACE}:${parts.join(':')}`;

class CacheService {
    constructor() {
        this.client = null;
        this.connectingPromise = null;
        this.warnedDisabled = false;
        this.lastError = '';
        this.retryAfter = 0;
    }

    isEnabled() {
        return Boolean(env.enableRedis && env.redisUrl);
    }

    async ensureClient() {
        if (!this.isEnabled()) {
            if (!this.warnedDisabled && env.enableRedis) {
                console.warn('[cache] ENABLE_REDIS ligado, mas REDIS_URL ausente. Cache desativado.');
                this.warnedDisabled = true;
            }
            return null;
        }
        if (Date.now() < this.retryAfter) return null;
        if (this.client?.isOpen) return this.client;
        if (this.connectingPromise) return this.connectingPromise;

        this.connectingPromise = (async () => {
            const client = createClient({
                url: env.redisUrl,
                socket: {
                    reconnectStrategy: false
                }
            });
            client.on('error', (err) => {
                const message = err?.message || 'erro desconhecido';
                if (message !== this.lastError) {
                    console.error('[cache] erro redis:', message);
                }
                this.lastError = err.message;
            });
            await client.connect();
            this.client = client;
            this.lastError = '';
            this.retryAfter = 0;
            console.log('[cache] Redis conectado.');
            return this.client;
        })();

        try {
            return await this.connectingPromise;
        } catch (err) {
            console.error('[cache] falha ao conectar Redis:', err.message);
            this.lastError = err.message;
            this.retryAfter = Date.now() + 30_000;
            if (this.client) {
                try {
                    this.client.removeAllListeners();
                    await this.client.quit();
                } catch {
                    // noop
                }
            }
            this.client = null;
            return null;
        } finally {
            this.connectingPromise = null;
        }
    }

    async getJSON(key) {
        const client = await this.ensureClient();
        if (!client) return null;
        try {
            const raw = await client.get(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (err) {
            console.error('[cache] erro em getJSON:', err.message);
            return null;
        }
    }

    async setJSON(key, value, ttlSec = 60) {
        const client = await this.ensureClient();
        if (!client) return false;
        try {
            await client.set(key, JSON.stringify(value), { EX: ttlSec });
            return true;
        } catch (err) {
            console.error('[cache] erro em setJSON:', err.message);
            return false;
        }
    }

    async del(key) {
        const client = await this.ensureClient();
        if (!client) return 0;
        try {
            return await client.del(key);
        } catch (err) {
            console.error('[cache] erro em del:', err.message);
            return 0;
        }
    }

    async delByPattern(pattern) {
        const client = await this.ensureClient();
        if (!client) return 0;
        let deleted = 0;
        try {
            for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
                deleted += await client.del(key);
            }
            return deleted;
        } catch (err) {
            console.error('[cache] erro em delByPattern:', err.message);
            return deleted;
        }
    }

    async getHealth() {
        const enabled = this.isEnabled();
        if (!enabled) {
            return { enabled: false, connected: false, status: 'disabled', lastError: this.lastError || null };
        }
        const client = await this.ensureClient();
        const connected = Boolean(client?.isOpen);
        if (!connected) {
            return { enabled: true, connected: false, status: 'degraded', lastError: this.lastError || 'redis indisponivel' };
        }
        try {
            await client.ping();
            return { enabled: true, connected: true, status: 'ok', lastError: null };
        } catch (err) {
            this.lastError = err.message;
            return { enabled: true, connected: false, status: 'degraded', lastError: err.message };
        }
    }
}

export const escalaEditorCacheKey = (unidadeId, year) => buildCacheKey('manager', 'escala-editor', String(unidadeId), String(year));
export const escalaEditorCachePattern = (unidadeId) => buildCacheKey('manager', 'escala-editor', String(unidadeId), '*');

export const cacheService = new CacheService();
