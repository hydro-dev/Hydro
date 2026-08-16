import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    root: __dirname,
    base: '/',
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@hydrooj/ui-next': path.resolve(__dirname, 'src/api.ts'),
        },
    },
    publicDir: 'pub',
    build: {
        outDir: 'public',
        emptyOutDir: true,
        rolldownOptions: {
            output: {
                codeSplitting: true,
            },
        },
    },
    worker: { format: 'es' },
});
