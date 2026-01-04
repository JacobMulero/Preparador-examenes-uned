/**
 * Main Routes Configuration
 * Mounts all route modules under the /api prefix
 */

import { Router } from 'express';

// Import route modules
import questionsRouter from './routes/questions.js';
import solvingRouter from './routes/solving.js';
import statsRouter from './routes/stats.js';

const router = Router();

// ============================================
// Mount Route Modules
// ============================================

// Questions routes: /api/topics, /api/questions/:topic, etc.
router.use('/', questionsRouter);

// Solving routes: /api/solve
router.use('/', solvingRouter);

// Stats and progress routes: /api/stats, /api/attempts, /api/progress/*
router.use('/', statsRouter);

// ============================================
// Health Check
// ============================================

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * GET /api
 * API info endpoint
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Exam App API',
    version: '1.0.0',
    endpoints: {
      topics: 'GET /api/topics',
      questions: {
        list: 'GET /api/questions/:topic',
        random: 'GET /api/questions/:topic/random',
        next: 'GET /api/questions/:topic/next',
        single: 'GET /api/question/:id'
      },
      solving: {
        solve: 'POST /api/solve',
        getCached: 'GET /api/solve/:questionId'
      },
      stats: {
        global: 'GET /api/stats',
        byTopic: 'GET /api/stats/:topic',
        summary: 'GET /api/stats/summary/all'
      },
      progress: {
        failed: 'GET /api/progress/failed',
        unanswered: 'GET /api/progress/unanswered',
        history: 'GET /api/progress/history'
      },
      attempts: {
        record: 'POST /api/attempts',
        byQuestion: 'GET /api/attempts/:questionId'
      },
      health: 'GET /api/health'
    }
  });
});

export default router;
