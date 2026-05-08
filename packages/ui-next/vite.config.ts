import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/',
    plugins: [react()],
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
