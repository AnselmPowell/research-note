const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  console.error('[ErrorHandler] ❌ ERROR CAUGHT');
  console.error('[ErrorHandler] 📋 Method:', req.method);
  console.error('[ErrorHandler] 📋 Path:', req.path);
  console.error('[ErrorHandler] 📋 Error message:', err.message);
  console.error('[ErrorHandler] 📋 Error code:', err.code);
  console.error('[ErrorHandler] 📋 Error status:', err.status);
  console.error('[ErrorHandler] 📋 Full error stack:', err.stack);
  
  logger.error(`API Error on ${req.method} ${req.path}: ${err.message}`);

  // Rate limit errors
  if (err.status === 429 || err.message?.includes('429')) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many requests. Please try again later.'
      }
    });
  }

  // Database errors
  if (err.message?.includes('Database') || err.code?.startsWith('PG')) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database operation failed'
      }
    });
  }

  // Generic error
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error'
    }
  });
}

module.exports = errorHandler;
