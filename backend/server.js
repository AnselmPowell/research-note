// Load environment variables from .env file
require('dotenv').config();

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ 🚀 BACKEND SERVER STARTUP                                      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { initializeEnvironment } = require('./config/env');
console.log('[Server] ✅ Config module imported');

const routes = require('./routes');
console.log('[Server] ✅ Routes module imported');

const errorHandler = require('./middleware/errorHandler');
console.log('[Server] ✅ Error handler imported');

const logger = require('./utils/logger');
console.log('[Server] ✅ Logger imported\n');

const config = initializeEnvironment();
const app = express();
const PORT = config.port;

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // CSP handled by Nginx
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// API routes
app.use('/api/v1', routes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      gemini: !!config.geminiApiKey,
      database: !!config.databaseUrl,
      openai: !!config.openaiApiKey
    }
  });
});

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Backend API running on port ${PORT}`);
  logger.info(`📊 Environment: ${config.nodeEnv}`);
  
  // === FIX: Set socket timeouts to allow long-running operations ===
  // Backend filtering takes ~109 seconds, need socket timeout > that
  server.timeout = 400000;           // 400 seconds (total socket timeout)
  server.requestTimeout = 400000;    // 400 seconds (request timeout)
  server.keepAliveTimeout = 65000;   // 65 seconds (keep-alive timeout)
  
  // === INVESTIGATION: Log socket configuration ===
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║ SOCKET CONFIGURATION (Timeout Investigation)                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`📋 Server timeout: ${server.timeout}ms`);
  console.log(`📋 Keep-alive timeout: ${server.keepAliveTimeout}ms`);
  console.log(`📋 Request timeout: ${server.requestTimeout}ms`);
  console.log('═══════════════════════════════════════════════════════════════\n');
});

// === INVESTIGATION: Monitor all socket connections ===
server.on('connection', (socket) => {
  const socketId = `${socket.remoteAddress}:${socket.remotePort}`;
  const connectionTime = new Date().toISOString();
  
  console.log(`[SOCKET] ✅ NEW CONNECTION: ${socketId} at ${connectionTime}`);
  console.log(`[SOCKET]    Default timeout: ${socket.timeout}ms`);
  
  // Track when socket times out
  socket.on('timeout', () => {
    const elapsedTime = new Date().toISOString();
    console.error(`[SOCKET] ❌ TIMEOUT: ${socketId} at ${elapsedTime}`);
    console.error(`[SOCKET]    Socket timeout value: ${socket.timeout}ms`);
  });
  
  // Track when socket ends normally
  socket.on('end', () => {
    console.log(`[SOCKET] ✓ ENDED: ${socketId}`);
  });
  
  // Track socket errors
  socket.on('error', (err) => {
    console.error(`[SOCKET] ⚠️  ERROR: ${socketId} - ${err.message}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});
