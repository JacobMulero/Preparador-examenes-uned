/**
 * Stats Routes
 * Handles statistics, progress tracking, and attempt recording
 */

import { Router } from 'express';
import {
  db,
  recordAttempt,
  getAttemptsByQuestion,
  getFailedQuestions,
  getGlobalStats,
  getTopicStats
} from '../database.js';

const router = Router();

// ============================================
// Statistics Endpoints
// ============================================

/**
 * GET /api/stats
 * Returns global statistics across all topics
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     total_questions: number,
 *     questions_attempted: number,
 *     questions_remaining: number,
 *     total_attempts: number,
 *     correct_attempts: number,
 *     incorrect_attempts: number,
 *     accuracy: number (percentage)
 *   }
 * }
 */
router.get('/stats', (req, res) => {
  try {
    const stats = getGlobalStats();

    // Add calculated fields
    const response = {
      total_questions: stats.total_questions || 0,
      answered_questions: stats.questions_attempted || 0,
      questions_remaining: stats.questions_remaining || 0,
      total_attempts: stats.total_attempts || 0,
      correct_attempts: stats.correct_attempts || 0,
      incorrect_attempts: (stats.total_attempts || 0) - (stats.correct_attempts || 0),
      accuracy: stats.accuracy || 0,
      percentage: stats.accuracy || 0
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('[Stats] Error fetching global stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/stats/:topic
 * Returns statistics for a specific topic
 */
router.get('/stats/:topic', (req, res) => {
  try {
    const { topic } = req.params;
    const stats = getTopicStats(topic);

    const response = {
      topic: stats.topic,
      total_questions: stats.total_questions || 0,
      answered_questions: stats.questions_attempted || 0,
      questions_remaining: stats.questions_remaining || 0,
      total_attempts: stats.total_attempts || 0,
      correct_attempts: stats.correct_attempts || 0,
      incorrect_attempts: (stats.total_attempts || 0) - (stats.correct_attempts || 0),
      accuracy: stats.accuracy || 0,
      percentage: stats.accuracy || 0
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('[Stats] Error fetching topic stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch topic statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/stats/summary/all
 * Returns stats summary for all topics at once
 */
router.get('/stats/summary/all', (req, res) => {
  try {
    // Get all distinct topics
    const topicsStmt = db.prepare('SELECT DISTINCT topic FROM questions ORDER BY topic');
    const topics = topicsStmt.all().map(r => r.topic);

    const summaries = topics.map(topic => {
      const stats = getTopicStats(topic);
      return {
        topic,
        total: stats.total_questions || 0,
        answered: stats.questions_attempted || 0,
        correct: stats.correct_attempts || 0,
        accuracy: stats.accuracy || 0
      };
    });

    // Global summary
    const global = getGlobalStats();

    res.json({
      success: true,
      data: {
        global: {
          total: global.total_questions || 0,
          answered: global.questions_attempted || 0,
          correct: global.correct_attempts || 0,
          accuracy: global.accuracy || 0
        },
        byTopic: summaries
      }
    });

  } catch (error) {
    console.error('[Stats] Error fetching all stats:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics summary',
      message: error.message
    });
  }
});

// ============================================
// Progress Endpoints
// ============================================

/**
 * GET /api/progress/failed
 * Returns list of failed question IDs (questions where last attempt was wrong)
 */
router.get('/progress/failed', (req, res) => {
  try {
    const { topic } = req.query;

    let failed;
    if (topic) {
      // Get failed questions for specific topic
      const stmt = db.prepare(`
        SELECT DISTINCT q.id, q.topic, q.question_number, q.content, q.options
        FROM questions q
        INNER JOIN attempts a ON q.id = a.question_id
        WHERE q.topic = ? AND a.is_correct = 0
        AND NOT EXISTS (
          SELECT 1 FROM attempts a2
          WHERE a2.question_id = q.id AND a2.is_correct = 1
          AND a2.attempted_at > a.attempted_at
        )
        ORDER BY q.question_number
      `);
      failed = stmt.all(topic);
    } else {
      // Get all failed questions
      failed = getFailedQuestions();
    }

    // Parse options JSON
    const questions = failed.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
    }));

    res.json({
      success: true,
      data: questions,
      count: questions.length
    });

  } catch (error) {
    console.error('[Progress] Error fetching failed questions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch failed questions',
      message: error.message
    });
  }
});

/**
 * GET /api/progress/unanswered
 * Returns list of unanswered questions
 */
router.get('/progress/unanswered', (req, res) => {
  try {
    const { topic, limit } = req.query;
    const maxLimit = parseInt(limit) || 500; // Increased from 100

    let stmt;
    if (topic) {
      stmt = db.prepare(`
        SELECT q.id, q.topic, q.question_number, q.content, q.options, q.shared_statement
        FROM questions q
        LEFT JOIN attempts a ON q.id = a.question_id
        WHERE q.topic = ? AND a.id IS NULL
        ORDER BY q.question_number
        LIMIT ?
      `);
      var rows = stmt.all(topic, maxLimit);
    } else {
      stmt = db.prepare(`
        SELECT q.id, q.topic, q.question_number, q.content, q.options, q.shared_statement
        FROM questions q
        LEFT JOIN attempts a ON q.id = a.question_id
        WHERE a.id IS NULL
        ORDER BY q.topic, q.question_number
        LIMIT ?
      `);
      var rows = stmt.all(maxLimit);
    }

    // Parse options JSON for each question
    const questions = rows.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
    }));

    res.json({
      success: true,
      data: questions,
      count: questions.length
    });

  } catch (error) {
    console.error('[Progress] Error fetching unanswered questions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unanswered questions',
      message: error.message
    });
  }
});

/**
 * GET /api/progress/history
 * Returns attempt history (recent attempts)
 */
router.get('/progress/history', (req, res) => {
  try {
    const { limit, questionId } = req.query;
    const maxLimit = parseInt(limit) || 50;

    let stmt;
    let rows;

    if (questionId) {
      rows = getAttemptsByQuestion(questionId);
    } else {
      stmt = db.prepare(`
        SELECT a.*, q.topic, q.question_number
        FROM attempts a
        INNER JOIN questions q ON a.question_id = q.id
        ORDER BY a.attempted_at DESC
        LIMIT ?
      `);
      rows = stmt.all(maxLimit);
    }

    res.json({
      success: true,
      data: rows,
      count: rows.length
    });

  } catch (error) {
    console.error('[Progress] Error fetching history:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attempt history',
      message: error.message
    });
  }
});

// ============================================
// Attempts Endpoints
// ============================================

/**
 * POST /api/attempts
 * Records a user's attempt at answering a question
 *
 * Request body:
 * {
 *   questionId: string,       // Question ID
 *   userAnswer: string,       // User's answer (a, b, c, or d)
 *   correctAnswer: string,    // Correct answer
 *   isCorrect: boolean,       // Whether the answer was correct
 *   explanation?: string      // Optional explanation
 * }
 */
router.post('/attempts', (req, res) => {
  try {
    const { questionId, userAnswer, correctAnswer, isCorrect, explanation } = req.body;

    // Validate required fields
    if (!questionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: questionId'
      });
    }

    if (!userAnswer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: userAnswer'
      });
    }

    if (!correctAnswer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: correctAnswer'
      });
    }

    if (typeof isCorrect !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid field: isCorrect (must be boolean)'
      });
    }

    // Validate answer format
    const validAnswers = ['a', 'b', 'c', 'd'];
    if (!validAnswers.includes(userAnswer.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userAnswer: must be a, b, c, or d'
      });
    }

    if (!validAnswers.includes(correctAnswer.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid correctAnswer: must be a, b, c, or d'
      });
    }

    // Record the attempt
    const result = recordAttempt({
      question_id: questionId,
      user_answer: userAnswer.toLowerCase(),
      correct_answer: correctAnswer.toLowerCase(),
      is_correct: isCorrect,
      explanation: explanation || null
    });

    // Get updated stats for feedback
    const questionTopic = questionId.match(/^(tema\d+|sintema)_/i);
    let topicStats = null;
    if (questionTopic) {
      const topic = questionTopic[1].charAt(0).toUpperCase() + questionTopic[1].slice(1).toLowerCase();
      topicStats = getTopicStats(topic);
    }

    res.json({
      success: true,
      data: {
        attemptId: result.lastInsertRowid,
        isCorrect,
        topicStats: topicStats ? {
          answered: topicStats.questions_attempted,
          total: topicStats.total_questions,
          accuracy: topicStats.accuracy
        } : null
      }
    });

  } catch (error) {
    console.error('[Attempts] Error recording attempt:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to record attempt',
      message: error.message
    });
  }
});

/**
 * GET /api/attempts/:questionId
 * Returns all attempts for a specific question
 */
router.get('/attempts/:questionId', (req, res) => {
  try {
    const { questionId } = req.params;

    const attempts = getAttemptsByQuestion(questionId);

    res.json({
      success: true,
      data: attempts,
      count: attempts.length
    });

  } catch (error) {
    console.error('[Attempts] Error fetching attempts:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attempts',
      message: error.message
    });
  }
});

/**
 * DELETE /api/progress/reset
 * Reset all progress (attempts) - use with caution!
 */
router.delete('/progress/reset', (req, res) => {
  try {
    const { confirm, topic } = req.query;

    if (confirm !== 'yes') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required',
        message: 'Add ?confirm=yes to confirm reset'
      });
    }

    let result;
    if (topic) {
      // Reset only for specific topic
      const stmt = db.prepare(`
        DELETE FROM attempts WHERE question_id IN (
          SELECT id FROM questions WHERE topic = ?
        )
      `);
      result = stmt.run(topic);
    } else {
      // Reset all attempts
      const stmt = db.prepare('DELETE FROM attempts');
      result = stmt.run();
    }

    res.json({
      success: true,
      message: topic
        ? `Reset ${result.changes} attempts for topic: ${topic}`
        : `Reset all ${result.changes} attempts`,
      deletedCount: result.changes
    });

  } catch (error) {
    console.error('[Progress] Error resetting progress:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reset progress',
      message: error.message
    });
  }
});

export default router;
