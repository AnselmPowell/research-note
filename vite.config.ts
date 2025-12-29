import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Map all environment variables for the frontend
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GOOGLE_SEARCH_KEY': JSON.stringify(env.GOOGLE_SEARCH_KEY),
        'process.env.GOOGLE_SEARCH_CX': JSON.stringify(env.GOOGLE_SEARCH_CX),
        'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
        'process.env.DATABASE_URL': JSON.stringify(env.DATABASE_URL),
        'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV || mode)
      },
      build: {
        target: 'esnext', // Use modern target to support top-level await
      },
      optimizeDeps: {
        exclude: ['pdfjs-dist'], // Exclude PDF.js from optimization to avoid build issues
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
