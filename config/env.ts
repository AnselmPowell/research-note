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
  // PRIORITY 1: Railway production - check actual process.env at runtime
  // Railway injects environment variables as process.env in the Node.js runtime
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || fallback;
  }
  
  // PRIORITY 2: Runtime window.ENV (for VITE_ client-side variables)
  if (typeof window !== 'undefined' && (window as any).ENV) {
    return (window as any).ENV[key] || fallback;
  }
  
  // PRIORITY 3: Server capabilities check (for production frontend)
  if (typeof window !== 'undefined' && (window as any).SERVER_CONFIG) {
    const serverConfig = (window as any).SERVER_CONFIG;
    // Return placeholder if server has the key (actual key stays on server)
    if (key === 'GEMINI_API_KEY' && serverConfig.hasGeminiKey) {
      return 'SERVER_SIDE_KEY_AVAILABLE';
    }
    if (key === 'GOOGLE_SEARCH_KEY' && serverConfig.hasGoogleSearch) {
      return 'SERVER_SIDE_KEY_AVAILABLE';
    }
    if (key === 'OPENAI_API_KEY' && serverConfig.hasOpenAI) {
      return 'SERVER_SIDE_KEY_AVAILABLE';
    }
    if (key === 'DATABASE_URL' && serverConfig.hasDatabase) {
      return 'SERVER_SIDE_KEY_AVAILABLE';
    }
  }
  
  // PRIORITY 4: Development build-time fallback (Vite injects these at build time)
  return fallback;
}

/**
 * Validates and returns the application configuration
 * Supports both build-time (Vite) and runtime (Railway) environment injection
 */
export function getConfig(): AppConfig {
  const nodeEnv = (getEnvVar('NODE_ENV') || 'production').trim();
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';
  
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
