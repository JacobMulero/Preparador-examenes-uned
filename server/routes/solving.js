/**
 * Solving Routes
 * Handles question solving with Claude headless integration
 */

import { Router } from 'express';
import {
  db,
  getQuestionById,
  getCachedSolution,
  cacheSolution
} from '../database.js';
import { solveQuestion } from '../claudeService.js';

const router = Router();

/**
 * POST /api/solve
 * Sends a question to Claude for solving
 *
 * Request body:
 * {
 *   questionId: string,      // Question ID (e.g., "tema1_pregunta5")
 *   questionText: string     // Full question text including options
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     answer: "a",           // Correct answer letter
 *     explanation: "...",    // Why this is correct
 *     wrongOptions: {        // Why other options are wrong
 *       "b": "...",
 *       "c": "...",
 *       "d": "..."
 *     }
 *   },
 *   cached: boolean          // Whether result came from cache
 * }
 */
router.post('/solve', async (req, res) => {
  try {
    const { questionId, questionText } = req.body;

    // Validate required fields
    if (!questionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: questionId'
      });
    }

    if (!questionText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: questionText'
      });
    }

    // Check cache first
    const cached = getCachedSolution(questionId);
    if (cached) {
      console.log(`[Solving] Cache hit for question: ${questionId}`);
      return res.json({
        success: true,
        data: {
          answer: cached.correct_answer,
          explanation: cached.explanation,
          wrongOptions: cached.wrong_options || {}
        },
        cached: true
      });
    }

    console.log(`[Solving] Cache miss for question: ${questionId}, calling Claude...`);

    // Call Claude to solve the question
    const solution = await solveQuestion(questionText);

    console.log(`[Solving] Claude returned answer: ${solution.answer}`);

    // Cache the solution
    cacheSolution({
      question_id: questionId,
      correct_answer: solution.answer,
      explanation: solution.explanation,
      wrong_options: solution.wrongOptions || {}
    });

    console.log(`[Solving] Cached solution for: ${questionId}`);

    res.json({
      success: true,
      data: {
        answer: solution.answer,
        explanation: solution.explanation,
        wrongOptions: solution.wrongOptions || {}
      },
      cached: false
    });

  } catch (error) {
    console.error('[Solving] Error solving question:', error.message);

    // Determine appropriate error response
    if (error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Claude timeout',
        message: 'Claude took too long to respond. Please try again.'
      });
    }

    if (error.message.includes('Claude CLI')) {
      return res.status(503).json({
        success: false,
        error: 'Claude unavailable',
        message: 'Claude CLI is not available. Make sure it is installed and authenticated.'
      });
    }

    if (error.message.includes('parse')) {
      return res.status(502).json({
        success: false,
        error: 'Invalid Claude response',
        message: 'Could not parse Claude response. Please try again.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to solve question',
      message: error.message
    });
  }
});

/**
 * POST /api/solve/batch
 * Solve multiple questions (for pre-warming cache)
 *
 * Request body:
 * {
 *   questions: [
 *     { questionId: string, questionText: string },
 *     ...
 *   ]
 * }
 */
router.post('/solve/batch', async (req, res) => {
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'questions must be a non-empty array'
      });
    }

    // Limit batch size
    const MAX_BATCH = 10;
    if (questions.length > MAX_BATCH) {
      return res.status(400).json({
        success: false,
        error: `Batch size exceeds maximum of ${MAX_BATCH}`
      });
    }

    const results = [];
    let cached = 0;
    let solved = 0;
    let failed = 0;

    for (const q of questions) {
      const { questionId, questionText } = q;

      if (!questionId || !questionText) {
        results.push({
          questionId: questionId || 'unknown',
          success: false,
          error: 'Missing questionId or questionText'
        });
        failed++;
        continue;
      }

      // Check cache
      const cachedSolution = getCachedSolution(questionId);
      if (cachedSolution) {
        results.push({
          questionId,
          success: true,
          cached: true,
          data: {
            answer: cachedSolution.correct_answer,
            explanation: cachedSolution.explanation,
            wrongOptions: cachedSolution.wrong_options || {}
          }
        });
        cached++;
        continue;
      }

      // Solve with Claude
      try {
        const solution = await solveQuestion(questionText);

        // Cache it
        cacheSolution({
          question_id: questionId,
          correct_answer: solution.answer,
          explanation: solution.explanation,
          wrong_options: solution.wrongOptions || {}
        });

        results.push({
          questionId,
          success: true,
          cached: false,
          data: {
            answer: solution.answer,
            explanation: solution.explanation,
            wrongOptions: solution.wrongOptions || {}
          }
        });
        solved++;
      } catch (solveError) {
        results.push({
          questionId,
          success: false,
          error: solveError.message
        });
        failed++;
      }
    }

    res.json({
      success: true,
      summary: {
        total: questions.length,
        cached,
        solved,
        failed
      },
      results
    });

  } catch (error) {
    console.error('[Solving] Batch error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Batch solve failed',
      message: error.message
    });
  }
});

/**
 * GET /api/solve/:questionId
 * Get cached solution for a question (if exists)
 */
router.get('/solve/:questionId', (req, res) => {
  try {
    const { questionId } = req.params;

    const cached = getCachedSolution(questionId);

    if (!cached) {
      return res.status(404).json({
        success: false,
        error: 'No cached solution found',
        message: 'Use POST /api/solve to get a solution'
      });
    }

    res.json({
      success: true,
      data: {
        answer: cached.correct_answer,
        explanation: cached.explanation,
        wrongOptions: cached.wrong_options || {}
      },
      cached: true,
      solvedAt: cached.solved_at
    });

  } catch (error) {
    console.error('[Solving] Error fetching cached solution:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cached solution',
      message: error.message
    });
  }
});

/**
 * DELETE /api/solve/:questionId
 * Delete cached solution (force re-solve on next request)
 */
router.delete('/solve/:questionId', (req, res) => {
  try {
    const { questionId } = req.params;

    const stmt = db.prepare('DELETE FROM solutions_cache WHERE question_id = ?');
    const result = stmt.run(questionId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'No cached solution found'
      });
    }

    res.json({
      success: true,
      message: `Deleted cached solution for: ${questionId}`
    });

  } catch (error) {
    console.error('[Solving] Error deleting cached solution:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete cached solution',
      message: error.message
    });
  }
});

export default router;
