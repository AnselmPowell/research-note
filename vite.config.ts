import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    
    // Debug environment variables during build
    console.log('🔧 Vite Build Environment:', {
      mode,
      hasGeminiKey: !!(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      hasGoogleSearch: !!(env.GOOGLE_SEARCH_KEY || process.env.GOOGLE_SEARCH_KEY),
      nodeEnv: env.NODE_ENV || process.env.NODE_ENV || mode
    });
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      preview: {
        port: parseInt(process.env.PORT || '8080'),
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Map all environment variables for the frontend
        // Use both env (from .env files) and process.env (from Railway)
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''),
        'process.env.GOOGLE_SEARCH_KEY': JSON.stringify(env.GOOGLE_SEARCH_KEY || process.env.GOOGLE_SEARCH_KEY || ''),
        'process.env.GOOGLE_SEARCH_CX': JSON.stringify(env.GOOGLE_SEARCH_CX || process.env.GOOGLE_SEARCH_CX || ''),
        'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''),
        'process.env.DATABASE_URL': JSON.stringify(env.DATABASE_URL || process.env.DATABASE_URL || ''),
        'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV || process.env.NODE_ENV || mode),
        // Add Neon Auth URL
        'process.env.VITE_NEON_AUTH_URL': JSON.stringify(env.VITE_NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL || ''),
        // Add Microsoft OAuth configuration
        'process.env.VITE_MICROSOFT_CLIENT_ID': JSON.stringify(env.VITE_MICROSOFT_CLIENT_ID || process.env.VITE_MICROSOFT_CLIENT_ID || ''),
        'process.env.VITE_MICROSOFT_TENANT_ID': JSON.stringify(env.VITE_MICROSOFT_TENANT_ID || process.env.VITE_MICROSOFT_TENANT_ID || 'common')
      },
      build: {
        target: 'esnext', // Use modern target to support top-level await
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: !isProduction, // Only generate sourcemaps in development
        minify: isProduction ? 'esbuild' : false,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              pdf: ['pdfjs-dist'],
              ai: ['@google/genai']
            }
          }
        }
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
