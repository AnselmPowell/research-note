function initializeEnvironment() {
  // All keys come from Railway environment variables
  const config = {
    nodeEnv: process.env.NODE_ENV || 'production',
    port: parseInt(process.env.BACKEND_PORT || '3001'),

    // API Keys (server-side only - from Railway)
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    googleSearchKey: process.env.GOOGLE_SEARCH_KEY || '',
    googleSearchCx: process.env.GOOGLE_SEARCH_CX || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    databaseUrl: process.env.DATABASE_URL || '',

    // Flags
    isDevelopment: (process.env.NODE_ENV || 'production') === 'development',
    isProduction: (process.env.NODE_ENV || 'production') === 'production'
  };

  // Validation (warn, don't crash)
  if (!config.geminiApiKey) {
    console.warn('⚠️  GEMINI_API_KEY not set');
  }
  if (!config.databaseUrl) {
    console.warn('⚠️  DATABASE_URL not set');
  }

  console.log('[Backend Config] Environment loaded:', {
    nodeEnv: config.nodeEnv,
    hasGeminiKey: !!config.geminiApiKey,
    hasDatabase: !!config.databaseUrl
  });

  return config;
}

module.exports = { initializeEnvironment };
