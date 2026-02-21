// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { initializeEnvironment } = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

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
  
  // === INVESTIGATION: Log socket configuration ===
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║ SOCKET CONFIGURATION (Timeout Investigation)                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`📋 Server timeout: ${server.timeout}ms`);
  console.log(`📋 Keep-alive timeout: ${server.keepAliveTimeout}ms`);
  console.log(`📋 Request timeout: ${server.requestTimeout || 'not set'}ms`);
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
