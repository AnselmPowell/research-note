import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    
    // Debug environment variables during build
    console.log('[ENV-TRACE] ========================================');
    console.log('[ENV-TRACE] VITE BUILD CONFIGURATION');
    console.log('[ENV-TRACE] ========================================');
    console.log('[ENV-TRACE] Build mode:', mode);
    console.log('[ENV-TRACE] Is production:', isProduction);
    console.log('[ENV-TRACE] ');
    console.log('[ENV-TRACE] === CHECKING ENVIRONMENT VARIABLES ===');
    console.log('[ENV-TRACE] ');
    console.log('[ENV-TRACE] SERVER-SIDE VARIABLES (should NOT be injected in production):');
    console.log('[ENV-TRACE] - GEMINI_API_KEY:', !!(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY) ? `⚠️  FOUND (length: ${(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').length})` : '✅ NOT FOUND (correct for production)');
    console.log('[ENV-TRACE] - GOOGLE_SEARCH_KEY:', !!(env.GOOGLE_SEARCH_KEY || process.env.GOOGLE_SEARCH_KEY) ? `⚠️  FOUND (length: ${(env.GOOGLE_SEARCH_KEY || process.env.GOOGLE_SEARCH_KEY || '').length})` : '✅ NOT FOUND (correct for production)');
    console.log('[ENV-TRACE] - DATABASE_URL:', !!(env.DATABASE_URL || process.env.DATABASE_URL) ? `⚠️  FOUND (length: ${(env.DATABASE_URL || process.env.DATABASE_URL || '').length})` : '✅ NOT FOUND (correct for production)');
    console.log('[ENV-TRACE] ');
    console.log('[ENV-TRACE] CLIENT-SIDE VARIABLES (safe to inject):');
    console.log('[ENV-TRACE] - VITE_NEON_AUTH_URL:', !!(env.VITE_NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL) ? `✅ FOUND (length: ${(env.VITE_NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL || '').length})` : '❌ NOT FOUND');
    console.log('[ENV-TRACE] - VITE_MICROSOFT_CLIENT_ID:', !!(env.VITE_MICROSOFT_CLIENT_ID || process.env.VITE_MICROSOFT_CLIENT_ID) ? `✅ FOUND (length: ${(env.VITE_MICROSOFT_CLIENT_ID || process.env.VITE_MICROSOFT_CLIENT_ID || '').length})` : '❌ NOT FOUND');
    console.log('[ENV-TRACE] ');
    console.log('[ENV-TRACE] INJECTION STRATEGY:');
    if (mode === 'development') {
        console.log('[ENV-TRACE] ✅ DEVELOPMENT MODE: All variables will be injected at build time');
        console.log('[ENV-TRACE]    This is SAFE because it only runs on localhost');
    } else {
        console.log('[ENV-TRACE] ✅ PRODUCTION MODE: Only VITE_* variables will be injected at build time');
        console.log('[ENV-TRACE]    Server-side variables will be injected at RUNTIME by inject-env.sh');
        console.log('[ENV-TRACE]    This is SECURE: API keys never baked into bundle');
    }
    console.log('[ENV-TRACE] ========================================');
    
    return {
      server: {
        port: 3002,
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
