/**
 * Environment Configuration and Validation
 * Centralizes all environment variable handling and provides validation
 */

interface AppConfig {
  // Core AI Configuration
  geminiApiKey: string;
  
  // Search Configuration  
  googleSearchKey: string;
  googleSearchCx: string;
  
  // Fallback Configuration
  openaiApiKey: string;
  
  // Database Configuration
  databaseUrl: string;
  
  // Environment
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Gets environment variable with proper Railway runtime support
 */
function getEnvVar(key: string, fallback: string = ''): string {
  let source = 'NOT_FOUND';
  let value = fallback;
  
  // PRIORITY 1: Railway production - check actual process.env at runtime
  // Railway injects environment variables as process.env in the Node.js runtime
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    value = process.env[key] || fallback;
    source = 'PRIORITY_1_PROCESS_ENV';
    console.log(`[ENV-TRACE] ${key}: Found in process.env (Priority 1) - length: ${value.length}`);
    return value;
  }
  
  // PRIORITY 2: Runtime window.ENV (for VITE_ client-side variables)
  if (typeof window !== 'undefined' && (window as any).ENV) {
    const windowValue = (window as any).ENV[key];
    if (windowValue) {
      value = windowValue;
      source = 'PRIORITY_2_WINDOW_ENV';
      console.log(`[ENV-TRACE] ${key}: Found in window.ENV (Priority 2) - length: ${value.length}`);
      return value;
    }
  }
  
  // PRIORITY 3: Server capabilities check (for production frontend)
  if (typeof window !== 'undefined' && (window as any).SERVER_CONFIG) {
    const serverConfig = (window as any).SERVER_CONFIG;
    // Return placeholder if server has the key (actual key stays on server)
    if (key === 'GEMINI_API_KEY' && serverConfig.hasGeminiKey) {
      value = 'SERVER_SIDE_KEY_AVAILABLE';
      source = 'PRIORITY_3_SERVER_CONFIG';
      console.log(`[ENV-TRACE] ${key}: Found capability flag in window.SERVER_CONFIG (Priority 3)`);
      return value;
    }
    if (key === 'GOOGLE_SEARCH_KEY' && serverConfig.hasGoogleSearch) {
      value = 'SERVER_SIDE_KEY_AVAILABLE';
      source = 'PRIORITY_3_SERVER_CONFIG';
      console.log(`[ENV-TRACE] ${key}: Found capability flag in window.SERVER_CONFIG (Priority 3)`);
      return value;
    }
    if (key === 'OPENAI_API_KEY' && serverConfig.hasOpenAI) {
      value = 'SERVER_SIDE_KEY_AVAILABLE';
      source = 'PRIORITY_3_SERVER_CONFIG';
      console.log(`[ENV-TRACE] ${key}: Found capability flag in window.SERVER_CONFIG (Priority 3)`);
      return value;
    }
    if (key === 'DATABASE_URL' && serverConfig.hasDatabase) {
      value = 'SERVER_SIDE_KEY_AVAILABLE';
      source = 'PRIORITY_3_SERVER_CONFIG';
      console.log(`[ENV-TRACE] ${key}: Found capability flag in window.SERVER_CONFIG (Priority 3)`);
      return value;
    }
  }
  
  // PRIORITY 4: Development build-time fallback (Vite injects these at build time)
  if (fallback) {
    console.log(`[ENV-TRACE] ${key}: Using fallback (Priority 4) - length: ${fallback.length}`);
    return fallback;
  }
  
  console.log(`[ENV-TRACE] ${key}: ❌ NOT FOUND in any source`);
  return fallback;
}

/**
 * Validates and returns the application configuration
 * Supports both build-time (Vite) and runtime (Railway) environment injection
 */
export function getConfig(): AppConfig {
  console.log('[ENV-TRACE] ========================================');
  console.log('[ENV-TRACE] APPLICATION CONFIG INITIALIZATION');
  console.log('[ENV-TRACE] ========================================');
  console.log('[ENV-TRACE] Timestamp:', new Date().toISOString());
  console.log('[ENV-TRACE] Environment:', typeof window !== 'undefined' ? 'BROWSER' : 'SERVER');
  
  const nodeEnv = (getEnvVar('NODE_ENV') || 'production').trim();
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';
  
  console.log('[ENV-TRACE] NODE_ENV:', nodeEnv);
  console.log('[ENV-TRACE] isDevelopment:', isDevelopment);
  console.log('[ENV-TRACE] isProduction:', isProduction);
  console.log('[ENV-TRACE] ');
  console.log('[ENV-TRACE] === FETCHING ALL ENVIRONMENT VARIABLES ===');
  console.log('[ENV-TRACE] ');
  
  // Core validation - Gemini API Key is preferred but not fatal
  // Try both API_KEY and GEMINI_API_KEY for flexibility
  const geminiApiKey = (getEnvVar('GEMINI_API_KEY') || getEnvVar('API_KEY')).trim();
  
  // In production, accept server-side placeholder as valid
  const hasValidGeminiKey = geminiApiKey && 
    geminiApiKey !== 'undefined' && 
    geminiApiKey !== 'null' && 
    (isDevelopment || geminiApiKey === 'SERVER_SIDE_KEY_AVAILABLE');
  
  if (!hasValidGeminiKey) {
    console.warn('⚠️  GEMINI_API_KEY is missing - AI features will be limited');
    
    // SECURITY: Only show minimal diagnostics in development
    if (isDevelopment && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.error('📋 Environment variable status (dev only):', {
        'hasGeminiKey': false,
        'NODE_ENV': nodeEnv,
        'hostname': window.location.hostname,
        'note': 'Detailed diagnostics disabled for security'
      });
    }
    
    // In development, still throw error to encourage proper setup
    if (isDevelopment) {
      throw new ConfigurationError(
        'GEMINI_API_KEY is required for development. Please set it in your .env.local file.'
      );
    }
    
    // In production, continue with limited functionality instead of crashing
    console.warn('🚀 App will continue with limited AI functionality');
  }

  // Get environment variables with fallbacks and clean them
  console.log('[ENV-TRACE] ');
  console.log('[ENV-TRACE] === BUILDING FINAL CONFIG OBJECT ===');
  
  const config: AppConfig = {
    geminiApiKey: hasValidGeminiKey ? geminiApiKey : '', // Allow empty API key
    googleSearchKey: getEnvVar('GOOGLE_SEARCH_KEY').trim(),
    googleSearchCx: getEnvVar('GOOGLE_SEARCH_CX').trim(),
    openaiApiKey: getEnvVar('OPENAI_API_KEY').trim(),
    databaseUrl: getEnvVar('DATABASE_URL').trim(),
    nodeEnv,
    isDevelopment,
    isProduction
  };

  console.log('[ENV-TRACE] ');
  console.log('[ENV-TRACE] === FINAL CONFIGURATION SUMMARY ===');
  console.log('[ENV-TRACE] ');
  console.log('[ENV-TRACE] CORE CONFIG:');
  console.log('[ENV-TRACE] - geminiApiKey:', config.geminiApiKey ? `✅ SET (length: ${config.geminiApiKey.length}, value: ${config.geminiApiKey.substring(0, 20)}...)` : '❌ EMPTY');
  console.log('[ENV-TRACE] - googleSearchKey:', config.googleSearchKey ? `✅ SET (length: ${config.googleSearchKey.length}, value: ${config.googleSearchKey.substring(0, 20)}...)` : '❌ EMPTY');
  console.log('[ENV-TRACE] - googleSearchCx:', config.googleSearchCx ? `✅ SET (length: ${config.googleSearchCx.length})` : '❌ EMPTY');
  console.log('[ENV-TRACE] - openaiApiKey:', config.openaiApiKey ? `✅ SET (length: ${config.openaiApiKey.length}, value: ${config.openaiApiKey.substring(0, 20)}...)` : '❌ EMPTY');
  console.log('[ENV-TRACE] - databaseUrl:', config.databaseUrl ? `✅ SET (length: ${config.databaseUrl.length})` : '❌ EMPTY');
  console.log('[ENV-TRACE] ');
  console.log('[ENV-TRACE] FEATURE FLAGS:');
  console.log('[ENV-TRACE] - AI Features (Gemini):', hasValidGeminiKey ? '✅ ENABLED' : '❌ DISABLED');
  console.log('[ENV-TRACE] - Web Search (Google):', !!(config.googleSearchKey && config.googleSearchCx) || (config.googleSearchKey === 'SERVER_SIDE_KEY_AVAILABLE') ? '✅ ENABLED' : '❌ DISABLED');
  console.log('[ENV-TRACE] - OpenAI Fallback:', !!config.openaiApiKey || (config.openaiApiKey === 'SERVER_SIDE_KEY_AVAILABLE') ? '✅ ENABLED' : '❌ DISABLED');
  console.log('[ENV-TRACE] - Database (Neon):', !!config.databaseUrl || (config.databaseUrl === 'SERVER_SIDE_KEY_AVAILABLE') ? '✅ ENABLED' : '❌ DISABLED');
  console.log('[ENV-TRACE] ');
  console.log('[ENV-TRACE] ========================================');
  console.log('[ENV-TRACE] ✅ CONFIG INITIALIZATION COMPLETE');
  console.log('[ENV-TRACE] ========================================');

  // Debug logging (safe for production)
  if (isProduction) {
    console.log('[Config] Production configuration loaded:', {
      hasGeminiKey: hasValidGeminiKey,
      hasGoogleSearch: !!(config.googleSearchKey && config.googleSearchCx) || 
                      (config.googleSearchKey === 'SERVER_SIDE_KEY_AVAILABLE'),
      hasOpenAI: !!config.openaiApiKey || (config.openaiApiKey === 'SERVER_SIDE_KEY_AVAILABLE'),
      hasDatabase: !!config.databaseUrl || (config.databaseUrl === 'SERVER_SIDE_KEY_AVAILABLE'),
      environment: config.nodeEnv
    });
  }

  // Warn about missing optional configurations (only in development)
  if (isDevelopment) {
    if (!config.googleSearchKey || !config.googleSearchCx) {
      console.warn('[Config] Web Search will be disabled: Missing Google Search API configuration');
    }

    if (!config.openaiApiKey) {
      console.warn('[Config] OpenAI fallback disabled: Missing OpenAI API key');
    }

    if (!config.databaseUrl) {
      console.warn('[Config] Database features may not work: Missing DATABASE_URL');
    }
  }

  return config;
}

/**
 * Export individual configuration values for backward compatibility
 */
export const config = getConfig();

// Export commonly used values
export const {
  geminiApiKey,
  googleSearchKey,
  googleSearchCx, 
  openaiApiKey,
  databaseUrl,
  isDevelopment,
  isProduction
} = config;
