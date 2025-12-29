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
 */
export function getConfig(): AppConfig {
  // Core validation - Gemini API Key is required
  const geminiApiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new ConfigurationError(
      'GEMINI_API_KEY is required. Please set it in your .env.local file.'
    );
  }

  // Get environment variables with fallbacks
  const config: AppConfig = {
    geminiApiKey,
    googleSearchKey: process.env.GOOGLE_SEARCH_KEY || '',
    googleSearchCx: process.env.GOOGLE_SEARCH_CX || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    databaseUrl: process.env.DATABASE_URL || '',
    nodeEnv: process.env.NODE_ENV || 'development',
    isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
    isProduction: (process.env.NODE_ENV || 'development') === 'production'
  };

  // Warn about missing optional configurations
  if (!config.googleSearchKey || !config.googleSearchCx) {
    console.warn('[Config] Web Search will be disabled: Missing Google Search API configuration');
  }

  if (!config.openaiApiKey) {
    console.warn('[Config] OpenAI fallback disabled: Missing OpenAI API key');
  }

  if (!config.databaseUrl) {
    console.warn('[Config] Database features may not work: Missing DATABASE_URL');
  }

  // Log successful configuration (without exposing sensitive values)
  console.log('[Config] Application configured successfully:', {
    hasGeminiKey: !!config.geminiApiKey,
    hasGoogleSearch: !!(config.googleSearchKey && config.googleSearchCx),
    hasOpenAI: !!config.openaiApiKey,
    hasDatabase: !!config.databaseUrl,
    environment: config.nodeEnv
  });

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
