import express from 'express';
import cors from 'cors';
import { initializeDatabase, seedBDASubject } from './database.js';
import routes from './routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// Middleware Configuration
// ============================================

// Enable CORS for frontend development server
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON request bodies
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// Routes
// ============================================

// Mount API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Exam App API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      topics: 'GET /api/topics',
      questions: 'GET /api/questions/:topic',
      randomQuestion: 'GET /api/questions/:topic/random',
      nextQuestion: 'GET /api/questions/:topic/next',
      questionById: 'GET /api/question/:id',
      solve: 'POST /api/solve',
      attempts: 'POST /api/attempts',
      stats: 'GET /api/stats',
      topicStats: 'GET /api/stats/:topic',
      failedQuestions: 'GET /api/progress/failed'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// ============================================
// Server Startup
// ============================================

async function startServer() {
  try {
    // Initialize database
    console.log('[Server] Initializing database...');
    initializeDatabase();

    // Seed BDA subject (Fase 0)
    seedBDASubject();

    // Start listening
    app.listen(PORT, () => {
      console.log(`[Server] Exam App API running on http://localhost:${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
}

startServer();
