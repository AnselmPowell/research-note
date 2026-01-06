import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    
    // Debug environment variables during build
    console.log('🔧 Vite Build Environment:', {
      mode,
      // Server-side variables (only injected in development)
      hasGeminiKey: !!(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      hasGoogleSearch: !!(env.GOOGLE_SEARCH_KEY || process.env.GOOGLE_SEARCH_KEY),
      // Client-side variables (always injected)
      hasNeonAuthUrl: !!(env.VITE_NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL),
      hasMicrosoftClientId: !!(env.VITE_MICROSOFT_CLIENT_ID || process.env.VITE_MICROSOFT_CLIENT_ID),
      nodeEnv: env.NODE_ENV || process.env.NODE_ENV || mode,
      serverVarsInjected: mode === 'development',
      note: mode === 'production' ? 'Production: Server-side API keys accessed via Railway process.env at runtime' : 'Development: All variables injected at build time'
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
        // IMPORTANT: Only inject client-safe variables AND server variables for localhost development
        
        // Client-side authentication variables (safe for browser exposure)
        'process.env.VITE_NEON_AUTH_URL': JSON.stringify(process.env.VITE_NEON_AUTH_URL || env.VITE_NEON_AUTH_URL || ''),
        'process.env.VITE_MICROSOFT_CLIENT_ID': JSON.stringify(process.env.VITE_MICROSOFT_CLIENT_ID || env.VITE_MICROSOFT_CLIENT_ID || ''),
        'process.env.VITE_MICROSOFT_TENANT_ID': JSON.stringify(process.env.VITE_MICROSOFT_TENANT_ID || env.VITE_MICROSOFT_TENANT_ID || 'common'),
        
        // Server-side variables - ONLY inject for localhost development
        ...(mode === 'development' ? {
          'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
          'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
          'process.env.GOOGLE_SEARCH_KEY': JSON.stringify(env.GOOGLE_SEARCH_KEY || ''),
          'process.env.GOOGLE_SEARCH_CX': JSON.stringify(env.GOOGLE_SEARCH_CX || ''),
          'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY || ''),
          'process.env.DATABASE_URL': JSON.stringify(env.DATABASE_URL || '')
        } : {}),
        
        // Environment indicator
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || env.NODE_ENV || mode)
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
