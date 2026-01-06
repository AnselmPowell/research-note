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
 * Gets environment variable with runtime support (Railway) and build-time fallback
 */
function getEnvVar(key: string, fallback: string = ''): string {
  // In production (Railway), environment variables are loaded from window.ENV
  // In development, they come from process.env via Vite
  
  if (typeof window !== 'undefined' && (window as any).ENV) {
    // Runtime environment (Railway production)
    return (window as any).ENV[key] || fallback;
  } else {
    // Build-time environment (local development)  
    return (process.env as any)[key] || fallback;
  }
}

/**
 * Validates and returns the application configuration
 * Supports both build-time (Vite) and runtime (Railway) environment injection
 */
export function getConfig(): AppConfig {
  // Core validation - Gemini API Key is required
  const geminiApiKey = (getEnvVar('API_KEY') || getEnvVar('GEMINI_API_KEY')).trim();
  
  if (!geminiApiKey || geminiApiKey === 'undefined' || geminiApiKey === 'null') {
    console.error('🔥 CONFIGURATION ERROR: GEMINI_API_KEY is missing');
    console.error('📋 Available environment values:', {
      API_KEY: getEnvVar('API_KEY') ? 'SET' : 'MISSING',
      GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY') ? 'SET' : 'MISSING', 
      VITE_NEON_AUTH_URL: getEnvVar('VITE_NEON_AUTH_URL') ? 'SET' : 'MISSING',
      NODE_ENV: getEnvVar('NODE_ENV'),
      runtimeMode: typeof window !== 'undefined' && (window as any).ENV ? 'RUNTIME' : 'BUILD-TIME'
    });
    throw new ConfigurationError(
      'GEMINI_API_KEY is required. Please set it in Railway environment variables.'
    );
  }

  // Get environment variables with fallbacks and clean them
  const config: AppConfig = {
    geminiApiKey,
    googleSearchKey: getEnvVar('GOOGLE_SEARCH_KEY').trim(),
    googleSearchCx: getEnvVar('GOOGLE_SEARCH_CX').trim(),
    openaiApiKey: getEnvVar('OPENAI_API_KEY').trim(),
    databaseUrl: getEnvVar('DATABASE_URL').trim(),
    nodeEnv: (getEnvVar('NODE_ENV') || 'production').trim(),
    isDevelopment: (getEnvVar('NODE_ENV') || 'production') === 'development',
    isProduction: (getEnvVar('NODE_ENV') || 'production') === 'production'
  };

  // Debug logging for production (only show if environment variable is set vs missing)
  if (config.isProduction) {
    console.log('[Config] Production configuration loaded:', {
      hasGeminiKey: !!config.geminiApiKey,
      hasGoogleSearch: !!(config.googleSearchKey && config.googleSearchCx),
      hasOpenAI: !!config.openaiApiKey,
      hasDatabase: !!config.databaseUrl,
      environment: config.nodeEnv
    });
  }

  // Warn about missing optional configurations (only in development)
  if (config.isDevelopment) {
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
