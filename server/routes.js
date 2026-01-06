/**
 * Main Routes Configuration
 * Mounts all route modules under the /api prefix
 */

import { Router } from 'express';

// Import route modules
import questionsRouter from './routes/questions.js';
import solvingRouter from './routes/solving.js';
import statsRouter from './routes/stats.js';
import subjectsRouter from './routes/subjects.js';
import pipelineRouter from './routes/pipeline.js';
import generationRouter from './routes/generation.js';

const router = Router();

// ============================================
// Mount Route Modules
// ============================================

// Subjects routes (Fase 0): /api/subjects
router.use('/subjects', subjectsRouter);

// Pipeline routes (Fase 2): /api/pipeline
router.use('/pipeline', pipelineRouter);

// Generation routes (Fase 3): /api/generate
router.use('/generate', generationRouter);

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
    version: '1.3.0',
    endpoints: {
      subjects: {
        list: 'GET /api/subjects',
        detail: 'GET /api/subjects/:id',
        create: 'POST /api/subjects',
        update: 'PUT /api/subjects/:id',
        topics: 'GET /api/subjects/:id/topics'
      },
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
      pipeline: {
        upload: 'POST /api/pipeline/upload',
        listExams: 'GET /api/pipeline/exams?subjectId=',
        examDetails: 'GET /api/pipeline/exams/:examId',
        deleteExam: 'DELETE /api/pipeline/exams/:examId',
        extractPages: 'POST /api/pipeline/exams/:examId/extract',
        processExam: 'POST /api/pipeline/exams/:examId/process',
        processPage: 'POST /api/pipeline/exams/:examId/process-page/:pageId',
        questions: 'GET /api/pipeline/exams/:examId/questions',
        approveQuestion: 'POST /api/pipeline/questions/:questionId/approve',
        rejectQuestion: 'POST /api/pipeline/questions/:questionId/reject',
        approveAll: 'POST /api/pipeline/exams/:examId/approve-all'
      },
      generation: {
        createSession: 'POST /api/generate/test-session',
        startGeneration: 'POST /api/generate/sessions/:id/start',
        getSession: 'GET /api/generate/sessions/:id',
        getQuestions: 'GET /api/generate/sessions/:id/questions',
        recordAttempt: 'POST /api/generate/sessions/:id/attempt',
        getStats: 'GET /api/generate/sessions/:id/stats',
        subjectSessions: 'GET /api/generate/subject/:subjectId/sessions'
      },
      health: 'GET /api/health'
    }
  });
});

export default router;
