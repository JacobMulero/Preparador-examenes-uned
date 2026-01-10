/**
 * Verification Routes - Oral verification of student authorship
 * Fase 4: Generates open-ended questions for professors to verify students
 *
 * NOTA: Los entregables se suben como PDF usando el pipeline existente (/api/pipeline)
 * y se vinculan mediante deliverableId (que apunta a exam_pdfs.id)
 */

import { Router } from 'express';
import {
  createVerificationSession,
  getVerificationSessionById,
  getVerificationSessionsBySubject,
  updateVerificationSession,
  getVerificationQuestionsBySession,
  getVerificationQuestionById,
  scoreVerificationQuestion,
  calculateVerificationSessionScore,
  getSubjectById,
  getExamPdf,
  getExamPages
} from '../database.js';
import { generateVerificationQuestions } from '../services/verificationGenerator.js';

const router = Router();

/**
 * POST /api/verification/sessions
 * Create a new verification session
 *
 * Body:
 * - subjectId: string (required)
 * - studentName: string (optional)
 * - focusAreas: string[] (optional)
 * - questionCount: number (default: 5)
 * - deliverableId: string (optional) - ID del PDF procesado en pipeline
 */
router.post('/sessions', async (req, res) => {
  try {
    const { subjectId, studentName, focusAreas, questionCount, deliverableId } = req.body;

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

    // If deliverableId provided, verify it exists and is processed
    if (deliverableId) {
      const pdf = getExamPdf(deliverableId);
      if (!pdf) {
        return res.status(404).json({
          success: false,
          error: 'Entregable (PDF) no encontrado'
        });
      }
      if (pdf.status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'El entregable debe estar procesado antes de crear la sesion'
        });
      }
    }

    // Create session
    const session = createVerificationSession({
      subjectId,
      studentName: studentName || null,
      focusAreas: focusAreas || null,
      questionCount: questionCount || 5,
      deliverableId: deliverableId || null
    });

    res.status(201).json({
      success: true,
      session
    });

  } catch (error) {
    console.error('[Verification] Error creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear sesion'
    });
  }
});

/**
 * POST /api/verification/sessions/:id/generate
 * Start generating questions for a session
 */
router.post('/sessions/:id/generate', async (req, res) => {
  try {
    const session = getVerificationSessionById(req.params.id);

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

    if (session.status === 'ready' || session.status === 'in_progress' || session.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Las preguntas ya fueron generadas'
      });
    }

    // Respond immediately
    res.json({
      success: true,
      message: 'Generacion iniciada',
      sessionId: req.params.id
    });

    // Generate in background
    generateVerificationQuestions(req.params.id).catch(err => {
      console.error('[Verification] Background generation error:', err);
    });

  } catch (error) {
    console.error('[Verification] Error starting generation:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar generacion'
    });
  }
});

/**
 * GET /api/verification/sessions/:id
 * Get session details with questions
 */
router.get('/sessions/:id', (req, res) => {
  try {
    const session = getVerificationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    const questions = getVerificationQuestionsBySession(req.params.id);
    const scoreData = calculateVerificationSessionScore(req.params.id);

    // Include deliverable info if linked
    let deliverableInfo = null;
    if (session.deliverable_id) {
      const pdf = getExamPdf(session.deliverable_id);
      if (pdf) {
        deliverableInfo = {
          id: pdf.id,
          filename: pdf.filename,
          status: pdf.status,
          pageCount: pdf.page_count
        };
      }
    }

    res.json({
      success: true,
      session: {
        ...session,
        avgScore: scoreData?.avg_score || null,
        questionsAnswered: scoreData?.answered || 0,
        deliverableInfo
      },
      questions
    });

  } catch (error) {
    console.error('[Verification] Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesion'
    });
  }
});

/**
 * GET /api/verification/sessions
 * Get all sessions for a subject
 */
router.get('/sessions', (req, res) => {
  try {
    const { subjectId } = req.query;

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        error: 'subjectId es requerido'
      });
    }

    const sessions = getVerificationSessionsBySubject(subjectId);

    res.json({
      success: true,
      sessions
    });

  } catch (error) {
    console.error('[Verification] Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesiones'
    });
  }
});

/**
 * POST /api/verification/sessions/:id/start
 * Start the verification session (professor is ready to ask questions)
 */
router.post('/sessions/:id/start', (req, res) => {
  try {
    const session = getVerificationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    if (session.status !== 'ready') {
      // Idempotente: si ya está in_progress, devolver success
      if (session.status === 'in_progress') {
        return res.json({
          success: true,
          session
        });
      }
      return res.status(400).json({
        success: false,
        error: 'La sesion debe estar en estado "ready" para iniciar'
      });
    }

    const updated = updateVerificationSession(req.params.id, { status: 'in_progress' });

    res.json({
      success: true,
      session: updated
    });

  } catch (error) {
    console.error('[Verification] Error starting session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar sesion'
    });
  }
});

/**
 * POST /api/verification/questions/:id/score
 * Score a verification question
 */
router.post('/questions/:id/score', (req, res) => {
  try {
    const { score, feedback, actualAnswer } = req.body;

    if (score === undefined || score === null) {
      return res.status(400).json({
        success: false,
        error: 'score es requerido'
      });
    }

    if (typeof score !== 'number' || score < 0 || score > 10) {
      return res.status(400).json({
        success: false,
        error: 'score debe ser un numero entre 0 y 10'
      });
    }

    const question = getVerificationQuestionById(req.params.id);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Pregunta no encontrada'
      });
    }

    const updated = scoreVerificationQuestion(
      req.params.id,
      score,
      feedback || null,
      actualAnswer || null
    );

    res.json({
      success: true,
      question: updated
    });

  } catch (error) {
    console.error('[Verification] Error scoring question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al puntuar pregunta'
    });
  }
});

/**
 * POST /api/verification/sessions/:id/complete
 * Complete the verification session with final notes
 */
router.post('/sessions/:id/complete', (req, res) => {
  try {
    const { notes, finalScore } = req.body;

    const session = getVerificationSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    // Calculate average score if not provided
    let score = finalScore;
    if (score === undefined || score === null) {
      const scoreData = calculateVerificationSessionScore(req.params.id);
      score = scoreData?.avg_score || 0;
    }

    const updated = updateVerificationSession(req.params.id, {
      status: 'completed',
      score,
      notes: notes || null
    });

    res.json({
      success: true,
      session: updated
    });

  } catch (error) {
    console.error('[Verification] Error completing session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al completar sesion'
    });
  }
});

/**
 * GET /api/verification/questions/:id
 * Get a single question with details
 */
router.get('/questions/:id', (req, res) => {
  try {
    const question = getVerificationQuestionById(req.params.id);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Pregunta no encontrada'
      });
    }

    res.json({
      success: true,
      question
    });

  } catch (error) {
    console.error('[Verification] Error fetching question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener pregunta'
    });
  }
});

export default router;
