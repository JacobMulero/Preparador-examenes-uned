/**
 * Generation Routes (Fase 3)
 * API endpoints for test question generation
 */

import express from 'express';
import {
  createGenerationSession,
  getGenerationSessionById,
  getGenerationSessionsBySubject,
  getGenerationSessionsByDeliverable,
  getGeneratedQuestionsBySession,
  getGeneratedQuestionById,
  recordGeneratedAttempt,
  getSessionStats,
  getSubjectById
} from '../database.js';
import { generateTestQuestions } from '../services/questionGenerator.js';

const router = express.Router();

/**
 * POST /api/generate/test-session
 * Create a new test generation session
 */
router.post('/test-session', async (req, res) => {
  try {
    const { subjectId, deliverableId, topicFocus, difficulty, questionCount } = req.body;

    // Validate required fields
    if (!subjectId) {
      return res.status(400).json({
        success: false,
        error: 'subjectId es requerido'
      });
    }

    // Verify subject exists
    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    // Create session
    const session = createGenerationSession({
      subjectId,
      deliverableId: deliverableId || null,
      sessionMode: 'test',
      topicFocus: topicFocus || null,
      difficulty: difficulty || 'mixed',
      questionCount: questionCount || 10
    });

    console.log(`[GenerationRoutes] Created session ${session.id} for subject ${subjectId}`);

    res.status(201).json({
      success: true,
      session
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear sesion'
    });
  }
});

/**
 * POST /api/generate/sessions/:id/start
 * Start question generation for a session
 */
router.post('/sessions/:id/start', async (req, res) => {
  try {
    const session = getGenerationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    if (session.status === 'generating') {
      return res.status(400).json({
        success: false,
        error: 'La generacion ya esta en progreso'
      });
    }

    if (session.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Las preguntas ya fueron generadas'
      });
    }

    console.log(`[GenerationRoutes] Starting generation for session ${req.params.id}`);

    // Respond immediately
    res.json({
      success: true,
      message: 'Generacion iniciada',
      sessionId: req.params.id
    });

    // Generate in background
    generateTestQuestions(req.params.id).catch(err => {
      console.error('[GenerationRoutes] Background generation error:', err);
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error starting generation:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar generacion'
    });
  }
});

/**
 * GET /api/generate/sessions/:id
 * Get session status and details
 */
router.get('/sessions/:id', (req, res) => {
  try {
    const session = getGenerationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    res.json({
      success: true,
      session
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesion'
    });
  }
});

/**
 * GET /api/generate/sessions/:id/questions
 * Get generated questions for a session
 */
router.get('/sessions/:id/questions', (req, res) => {
  try {
    const session = getGenerationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    const questions = getGeneratedQuestionsBySession(req.params.id);

    res.json({
      success: true,
      status: session.status,
      questions
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener preguntas'
    });
  }
});

/**
 * POST /api/generate/sessions/:id/attempt
 * Record an answer attempt for a generated question
 */
router.post('/sessions/:id/attempt', (req, res) => {
  try {
    const { questionId, userAnswer, timeSpentSeconds } = req.body;

    // Validate required fields
    if (!questionId || !userAnswer) {
      return res.status(400).json({
        success: false,
        error: 'questionId y userAnswer son requeridos'
      });
    }

    // Get question to verify answer
    const question = getGeneratedQuestionById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Pregunta no encontrada'
      });
    }

    // Check if answer is correct
    const isCorrect = userAnswer.toLowerCase() === question.correct_answer.toLowerCase();

    // Record attempt
    recordGeneratedAttempt({
      questionId,
      sessionId: req.params.id,
      userAnswer: userAnswer.toLowerCase(),
      isCorrect,
      timeSpentSeconds: timeSpentSeconds || null
    });

    res.json({
      success: true,
      isCorrect,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      wrongExplanations: question.wrongExplanations
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error recording attempt:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar intento'
    });
  }
});

/**
 * GET /api/generate/sessions/:id/stats
 * Get statistics for a session
 */
router.get('/sessions/:id/stats', (req, res) => {
  try {
    const session = getGenerationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    const stats = getSessionStats(req.params.id);
    const questions = getGeneratedQuestionsBySession(req.params.id);

    const accuracy = stats.total_attempts > 0
      ? ((stats.correct / stats.total_attempts) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      stats: {
        totalQuestions: questions.length,
        totalAttempts: stats.total_attempts || 0,
        correct: stats.correct || 0,
        accuracy: parseFloat(accuracy),
        avgTimeSeconds: stats.avg_time ? Math.round(stats.avg_time) : null,
        status: session.status
      }
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadisticas'
    });
  }
});

/**
 * GET /api/generate/subject/:subjectId/sessions
 * Get all generation sessions for a subject
 */
router.get('/subject/:subjectId/sessions', (req, res) => {
  try {
    const sessions = getGenerationSessionsBySubject(req.params.subjectId);

    res.json({
      success: true,
      sessions
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesiones'
    });
  }
});

/**
 * GET /api/generate/deliverable/:id/sessions
 * Get generation sessions for a deliverable (for future Fase 2 integration)
 */
router.get('/deliverable/:id/sessions', (req, res) => {
  try {
    const sessions = getGenerationSessionsByDeliverable(req.params.id);

    res.json({
      success: true,
      sessions
    });

  } catch (error) {
    console.error('[GenerationRoutes] Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesiones'
    });
  }
});

export default router;
