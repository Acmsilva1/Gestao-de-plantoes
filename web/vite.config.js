import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, repoRoot, '');
    const apiPort = process.env.GDP_API_PORT || process.env.PORT || env.PORT || '3000';

    return {
        plugins: [react()],
        server: {
            port: 5180,
            strictPort: true,
            proxy: {
                '/api': {
                    target: `http://127.0.0.1:${apiPort}`,
                    changeOrigin: true
                }
            }
        },
        build: {
            outDir: 'dist'
        }
    };
});
