/**
 * Questions Routes
 * Handles question listing, retrieval, and parsing
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  db,
  upsertQuestion,
  getQuestionsByTopic,
  getQuestionById,
  getAllTopics,
  getRandomQuestion,
  getNextUnansweredQuestion,
  getSubjectById
} from '../database.js';
import { parseQuestionFile, getAvailableTopics } from '../questionParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Path to questions data directory
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FALLBACK_DIR = path.join(__dirname, '..', '..', '..', 'Preguntas');

/**
 * Get the questions directory path
 */
function getQuestionsDir() {
  if (fs.existsSync(DATA_DIR)) {
    return DATA_DIR;
  }
  if (fs.existsSync(FALLBACK_DIR)) {
    return FALLBACK_DIR;
  }
  throw new Error('Questions directory not found. Expected data/ symlink or ../Preguntas/');
}

/**
 * Check if a topic has been parsed and loaded into the database
 * @param {string} topic - Topic name
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function isTopicLoaded(topic, subjectId = 'bda') {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM questions WHERE topic = ? AND subject_id = ?');
  const result = stmt.get(topic, subjectId);
  return result.count > 0;
}

/**
 * Parse and load questions for a topic into the database
 * @param {string} topic - Topic name
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function loadTopicQuestions(topic, subjectId = 'bda') {
  const dataDir = getQuestionsDir();
  const filePath = path.join(dataDir, `Preguntas_${topic}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Questions file not found for topic: ${topic}`);
  }

  console.log(`[Questions] Parsing questions for topic: ${topic} (subject: ${subjectId})`);
  const questions = parseQuestionFile(filePath);

  console.log(`[Questions] Inserting ${questions.length} questions for topic: ${topic}`);

  // Use a transaction for batch insert
  const insertStmt = db.prepare(`
    INSERT INTO questions (id, subject_id, topic, question_number, shared_statement, content, options, parsed_at)
    VALUES (@id, @subject_id, @topic, @question_number, @shared_statement, @content, @options, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      subject_id = @subject_id,
      topic = @topic,
      question_number = @question_number,
      shared_statement = @shared_statement,
      content = @content,
      options = @options,
      parsed_at = CURRENT_TIMESTAMP
  `);

  const insertMany = db.transaction((questions) => {
    for (const q of questions) {
      insertStmt.run({
        id: q.id,
        subject_id: subjectId,
        topic: q.topic,
        question_number: q.question_number,
        shared_statement: q.shared_statement || null,
        content: q.content,
        options: JSON.stringify(q.options)
      });
    }
  });

  insertMany(questions);
  console.log(`[Questions] Successfully loaded ${questions.length} questions for topic: ${topic}`);

  return questions.length;
}

/**
 * Ensure topic questions are loaded (lazy loading)
 * @param {string} topic - Topic name
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function ensureTopicLoaded(topic, subjectId = 'bda') {
  if (!isTopicLoaded(topic, subjectId)) {
    loadTopicQuestions(topic, subjectId);
  }
}

// ============================================
// Subject-Aware Routes (Fase 1)
// ============================================

/**
 * GET /api/subjects/:subjectId/topics
 * Returns list of topics for a specific subject
 */
router.get('/subjects/:subjectId/topics', (req, res) => {
  try {
    const { subjectId } = req.params;

    // Verify subject exists
    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // For BDA, use file-based topics (lazy loading from Preguntas folder)
    if (subjectId === 'bda') {
      const dataDir = getQuestionsDir();
      const availableTopics = getAvailableTopics(dataDir);

      // Get question counts from database
      const dbTopics = getAllTopics(subjectId);
      const dbTopicsMap = new Map(dbTopics.map(t => [t.topic, t.question_count]));

      const topics = availableTopics.map(topic => ({
        id: `${subjectId}_${topic.toLowerCase()}`,
        name: topic,
        questionCount: dbTopicsMap.get(topic) || 0,
        loaded: dbTopicsMap.has(topic)
      }));

      return res.json({
        success: true,
        subject: { id: subject.id, name: subject.name, shortName: subject.short_name },
        topics
      });
    }

    // For other subjects, get topics from questions table
    const dbTopics = getAllTopics(subjectId);
    const topics = dbTopics.map(t => ({
      id: `${subjectId}_${t.topic.toLowerCase()}`,
      name: t.topic,
      questionCount: t.question_count,
      loaded: true
    }));

    res.json({
      success: true,
      subject: { id: subject.id, name: subject.name, shortName: subject.short_name },
      topics
    });
  } catch (error) {
    console.error('[API] Error fetching subject topics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch topics',
      message: error.message
    });
  }
});

/**
 * GET /api/subjects/:subjectId/questions/:topic
 * Returns all questions for a topic in a specific subject
 */
router.get('/subjects/:subjectId/questions/:topic', (req, res) => {
  try {
    const { subjectId, topic } = req.params;

    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    // Ensure topic is loaded (for BDA, lazy load from files)
    ensureTopicLoaded(topic, subjectId);

    const questions = getQuestionsByTopic(topic, subjectId);

    res.json({
      success: true,
      subject: { id: subject.id, name: subject.name },
      topic,
      data: questions,
      count: questions.length
    });
  } catch (error) {
    console.error('[API] Error fetching subject questions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions',
      message: error.message
    });
  }
});

/**
 * GET /api/subjects/:subjectId/questions/:topic/random
 * Returns a random question from a topic in a specific subject
 */
router.get('/subjects/:subjectId/questions/:topic/random', (req, res) => {
  try {
    const { subjectId, topic } = req.params;

    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    ensureTopicLoaded(topic, subjectId);

    const question = getRandomQuestion(topic, subjectId);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'No questions found for this topic'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[API] Error fetching random question:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch random question',
      message: error.message
    });
  }
});

/**
 * GET /api/subjects/:subjectId/questions/:topic/next
 * Returns the next unanswered question in a topic for a specific subject
 */
router.get('/subjects/:subjectId/questions/:topic/next', (req, res) => {
  try {
    const { subjectId, topic } = req.params;

    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    ensureTopicLoaded(topic, subjectId);

    let question = getNextUnansweredQuestion(topic, subjectId);

    // If all answered, get random
    if (!question) {
      question = getRandomQuestion(topic, subjectId);
    }

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'No questions available',
        allCompleted: true
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[API] Error fetching next question:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch next question',
      message: error.message
    });
  }
});

/**
 * GET /api/subjects/:subjectId/question/:questionId
 * Returns a specific question by ID for a subject
 */
router.get('/subjects/:subjectId/question/:questionId', (req, res) => {
  try {
    const { subjectId, questionId } = req.params;

    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    const question = getQuestionById(questionId, subjectId);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[API] Error fetching question:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch question',
      message: error.message
    });
  }
});

// ============================================
// Legacy Routes (backward compatibility with BDA)
// ============================================

/**
 * GET /api/topics
 * @deprecated Use /api/subjects/:subjectId/topics instead
 * Returns list of all available topics from the Preguntas folder
 */
router.get('/topics', (req, res) => {
  try {
    const dataDir = getQuestionsDir();
    const availableTopics = getAvailableTopics(dataDir);

    // Get question counts from database for loaded topics
    const dbTopics = getAllTopics();
    const dbTopicsMap = new Map(dbTopics.map(t => [t.topic, t.question_count]));

    // Build response with file-based topics and DB counts
    const topics = availableTopics.map(topic => ({
      topic,
      question_count: dbTopicsMap.get(topic) || 0,
      loaded: dbTopicsMap.has(topic)
    }));

    res.json({
      success: true,
      data: topics
    });
  } catch (error) {
    console.error('[API] Error fetching topics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch topics',
      message: error.message
    });
  }
});

/**
 * GET /api/questions/:topic
 * Returns all questions for a specific topic
 * Parses and loads questions on first request
 */
router.get('/questions/:topic', (req, res) => {
  try {
    const { topic } = req.params;

    // Ensure topic is loaded (parse on first request)
    ensureTopicLoaded(topic);

    const questions = getQuestionsByTopic(topic);

    res.json({
      success: true,
      data: questions,
      count: questions.length
    });
  } catch (error) {
    console.error('[API] Error fetching questions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions',
      message: error.message
    });
  }
});

/**
 * GET /api/questions/:topic/random
 * Returns a random question from the topic
 * Prioritizes unanswered questions, then failed questions
 */
router.get('/questions/:topic/random', (req, res) => {
  try {
    const { topic } = req.params;
    const { mode } = req.query; // 'all', 'unanswered', 'failed'

    // Ensure topic is loaded
    ensureTopicLoaded(topic);

    let question = null;

    if (mode === 'unanswered') {
      // Only unanswered questions
      question = getRandomUnansweredQuestion(topic);
    } else if (mode === 'failed') {
      // Only failed questions
      question = getRandomFailedQuestion(topic);
    } else {
      // Smart mode: prioritize unanswered, then failed, then any
      question = getRandomUnansweredQuestion(topic);

      if (!question) {
        question = getRandomFailedQuestion(topic);
      }

      if (!question) {
        question = getRandomQuestion(topic);
      }
    }

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'No questions found',
        message: mode === 'unanswered'
          ? 'All questions have been answered'
          : mode === 'failed'
            ? 'No failed questions found'
            : 'No questions found for this topic'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[API] Error fetching random question:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch random question',
      message: error.message
    });
  }
});

/**
 * GET /api/questions/:topic/next
 * Returns the next unanswered question in order
 */
router.get('/questions/:topic/next', (req, res) => {
  try {
    const { topic } = req.params;

    // Ensure topic is loaded
    ensureTopicLoaded(topic);

    const question = getNextUnansweredQuestion(topic);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'No unanswered questions remaining',
        allCompleted: true,
        message: 'All questions in this topic have been answered'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[API] Error fetching next question:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch next question',
      message: error.message
    });
  }
});

/**
 * GET /api/question/:id
 * Returns a specific question by ID
 */
router.get('/question/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Extract topic from ID to ensure it's loaded
    const topicMatch = id.match(/^(tema\d+|sintema)_/i);
    if (topicMatch) {
      const topic = topicMatch[1].charAt(0).toUpperCase() + topicMatch[1].slice(1).toLowerCase();
      ensureTopicLoaded(topic);
    }

    const question = getQuestionById(id);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[API] Error fetching question:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch question',
      message: error.message
    });
  }
});

/**
 * POST /api/questions/:topic/reload
 * Force reload questions from file (useful after file updates)
 */
router.post('/questions/:topic/reload', (req, res) => {
  try {
    const { topic } = req.params;

    const count = loadTopicQuestions(topic);

    res.json({
      success: true,
      message: `Reloaded ${count} questions for topic: ${topic}`,
      count
    });
  } catch (error) {
    console.error('[API] Error reloading questions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reload questions',
      message: error.message
    });
  }
});

// ============================================
// Helper functions for random question selection
// ============================================

/**
 * Get a random unanswered question for a topic
 * @param {string} topic - Topic name
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function getRandomUnansweredQuestion(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT q.* FROM questions q
    LEFT JOIN attempts a ON q.id = a.question_id
    WHERE q.topic = ? AND q.subject_id = ? AND a.id IS NULL
    ORDER BY RANDOM()
    LIMIT 1
  `);
  const row = stmt.get(topic, subjectId);
  if (row) row.options = JSON.parse(row.options);
  return row;
}

/**
 * Get a random failed question for a topic
 * @param {string} topic - Topic name
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function getRandomFailedQuestion(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT DISTINCT q.* FROM questions q
    INNER JOIN attempts a ON q.id = a.question_id
    WHERE q.topic = ? AND q.subject_id = ? AND a.is_correct = 0
    AND NOT EXISTS (
      SELECT 1 FROM attempts a2
      WHERE a2.question_id = q.id AND a2.is_correct = 1
      AND a2.attempted_at > a.attempted_at
    )
    ORDER BY RANDOM()
    LIMIT 1
  `);
  const row = stmt.get(topic, subjectId);
  if (row) row.options = JSON.parse(row.options);
  return row;
}

export default router;
