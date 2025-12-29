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
 * Validates and returns the application configuration
 * Note: Uses Vite's process.env injection which happens at build time
 */
export function getConfig(): AppConfig {
  // Core validation - Gemini API Key is required
  const geminiApiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY || '').trim();
  
  if (!geminiApiKey || geminiApiKey === 'undefined' || geminiApiKey === 'null') {
    console.error('🔥 CONFIGURATION ERROR: GEMINI_API_KEY is missing');
    console.error('📋 Available process.env values:', {
      API_KEY: process.env.API_KEY ? 'SET' : 'MISSING',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'MISSING',
      NODE_ENV: process.env.NODE_ENV
    });
    throw new ConfigurationError(
      'GEMINI_API_KEY is required. Please set it in Railway environment variables.'
    );
  }

  // Get environment variables with fallbacks and clean them
  const config: AppConfig = {
    geminiApiKey,
    googleSearchKey: (process.env.GOOGLE_SEARCH_KEY || '').trim(),
    googleSearchCx: (process.env.GOOGLE_SEARCH_CX || '').trim(),
    openaiApiKey: (process.env.OPENAI_API_KEY || '').trim(),
    databaseUrl: (process.env.DATABASE_URL || '').trim(),
    nodeEnv: (process.env.NODE_ENV || 'production').trim(),
    isDevelopment: (process.env.NODE_ENV || 'production') === 'development',
    isProduction: (process.env.NODE_ENV || 'production') === 'production'
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
