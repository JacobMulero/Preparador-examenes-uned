import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const DB_PATH = path.join(__dirname, 'db', 'exam.db');
const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

// Initialize database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

/**
 * Initialize database tables from schema.sql
 */
function initializeDatabase() {
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);
    console.log('[Database] Schema initialized successfully');
  } catch (error) {
    console.error('[Database] Error initializing schema:', error.message);
    throw error;
  }
}

// ============================================
// Question Helper Functions
// ============================================

/**
 * Insert or update a question
 * @param {Object} question - Question object
 */
function upsertQuestion(question) {
  const stmt = db.prepare(`
    INSERT INTO questions (id, topic, question_number, shared_statement, content, options, parsed_at)
    VALUES (@id, @topic, @question_number, @shared_statement, @content, @options, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      topic = @topic,
      question_number = @question_number,
      shared_statement = @shared_statement,
      content = @content,
      options = @options,
      parsed_at = CURRENT_TIMESTAMP
  `);

  return stmt.run({
    id: question.id,
    topic: question.topic,
    question_number: question.question_number,
    shared_statement: question.shared_statement || null,
    content: question.content,
    options: JSON.stringify(question.options)
  });
}

/**
 * Get all questions for a topic
 * @param {string} topic - Topic identifier
 */
function getQuestionsByTopic(topic) {
  const stmt = db.prepare(`
    SELECT * FROM questions WHERE topic = ? ORDER BY question_number
  `);
  const rows = stmt.all(topic);
  return rows.map(row => ({
    ...row,
    options: JSON.parse(row.options)
  }));
}

/**
 * Get a single question by ID
 * @param {string} id - Question ID
 */
function getQuestionById(id) {
  const stmt = db.prepare(`SELECT * FROM questions WHERE id = ?`);
  const row = stmt.get(id);
  if (row) {
    row.options = JSON.parse(row.options);
  }
  return row;
}

/**
 * Get all distinct topics
 */
function getAllTopics() {
  const stmt = db.prepare(`
    SELECT DISTINCT topic, COUNT(*) as question_count
    FROM questions
    GROUP BY topic
    ORDER BY topic
  `);
  return stmt.all();
}

/**
 * Get a random question from a topic
 * @param {string} topic - Topic identifier (optional, all topics if null)
 */
function getRandomQuestion(topic = null) {
  let stmt;
  if (topic) {
    stmt = db.prepare(`
      SELECT * FROM questions WHERE topic = ? ORDER BY RANDOM() LIMIT 1
    `);
    const row = stmt.get(topic);
    if (row) row.options = JSON.parse(row.options);
    return row;
  } else {
    stmt = db.prepare(`
      SELECT * FROM questions ORDER BY RANDOM() LIMIT 1
    `);
    const row = stmt.get();
    if (row) row.options = JSON.parse(row.options);
    return row;
  }
}

/**
 * Get next unanswered question for a topic
 * @param {string} topic - Topic identifier
 */
function getNextUnansweredQuestion(topic) {
  const stmt = db.prepare(`
    SELECT q.* FROM questions q
    LEFT JOIN attempts a ON q.id = a.question_id
    WHERE q.topic = ? AND a.id IS NULL
    ORDER BY q.question_number
    LIMIT 1
  `);
  const row = stmt.get(topic);
  if (row) row.options = JSON.parse(row.options);
  return row;
}

// ============================================
// Attempt Helper Functions
// ============================================

/**
 * Record a user's attempt
 * @param {Object} attempt - Attempt object
 */
function recordAttempt(attempt) {
  const stmt = db.prepare(`
    INSERT INTO attempts (question_id, user_answer, correct_answer, is_correct, explanation)
    VALUES (@question_id, @user_answer, @correct_answer, @is_correct, @explanation)
  `);

  return stmt.run({
    question_id: attempt.question_id,
    user_answer: attempt.user_answer,
    correct_answer: attempt.correct_answer,
    is_correct: attempt.is_correct ? 1 : 0,
    explanation: attempt.explanation || null
  });
}

/**
 * Get attempts for a question
 * @param {string} questionId - Question ID
 */
function getAttemptsByQuestion(questionId) {
  const stmt = db.prepare(`
    SELECT * FROM attempts WHERE question_id = ? ORDER BY attempted_at DESC, id DESC
  `);
  return stmt.all(questionId);
}

/**
 * Get all failed attempts (last attempt was wrong)
 */
function getFailedQuestions() {
  const stmt = db.prepare(`
    SELECT q.*, a.user_answer, a.correct_answer, a.explanation, a.attempted_at
    FROM questions q
    INNER JOIN (
      SELECT question_id, user_answer, correct_answer, explanation, attempted_at,
             ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY attempted_at DESC, id DESC) as rn
      FROM attempts
    ) a ON q.id = a.question_id AND a.rn = 1
    WHERE a.user_answer != a.correct_answer
    ORDER BY a.attempted_at DESC
  `);
  const rows = stmt.all();
  return rows.map(row => ({
    ...row,
    options: JSON.parse(row.options)
  }));
}

// ============================================
// Stats Helper Functions
// ============================================

/**
 * Get global statistics
 */
function getGlobalStats() {
  const stmt = db.prepare(`
    SELECT
      COUNT(DISTINCT question_id) as questions_attempted,
      COUNT(*) as total_attempts,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_attempts,
      ROUND(100.0 * SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as accuracy
    FROM attempts
  `);
  const stats = stmt.get();

  const totalQuestionsStmt = db.prepare(`SELECT COUNT(*) as total FROM questions`);
  const totalQuestions = totalQuestionsStmt.get().total;

  return {
    ...stats,
    total_questions: totalQuestions,
    questions_remaining: totalQuestions - (stats.questions_attempted || 0)
  };
}

/**
 * Get statistics for a specific topic
 * @param {string} topic - Topic identifier
 */
function getTopicStats(topic) {
  const stmt = db.prepare(`
    SELECT
      COUNT(DISTINCT a.question_id) as questions_attempted,
      COUNT(*) as total_attempts,
      SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct_attempts,
      ROUND(100.0 * SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as accuracy
    FROM attempts a
    INNER JOIN questions q ON a.question_id = q.id
    WHERE q.topic = ?
  `);
  const stats = stmt.get(topic);

  const totalQuestionsStmt = db.prepare(`SELECT COUNT(*) as total FROM questions WHERE topic = ?`);
  const totalQuestions = totalQuestionsStmt.get(topic).total;

  return {
    topic,
    ...stats,
    total_questions: totalQuestions,
    questions_remaining: totalQuestions - (stats.questions_attempted || 0)
  };
}

// ============================================
// Solutions Cache Helper Functions
// ============================================

/**
 * Get cached solution for a question
 * @param {string} questionId - Question ID
 */
function getCachedSolution(questionId) {
  const stmt = db.prepare(`SELECT * FROM solutions_cache WHERE question_id = ?`);
  const row = stmt.get(questionId);
  if (row && row.wrong_options) {
    row.wrong_options = JSON.parse(row.wrong_options);
  }
  return row;
}

/**
 * Cache a solution
 * @param {Object} solution - Solution object
 */
function cacheSolution(solution) {
  const stmt = db.prepare(`
    INSERT INTO solutions_cache (question_id, correct_answer, explanation, wrong_options, solved_at)
    VALUES (@question_id, @correct_answer, @explanation, @wrong_options, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      correct_answer = @correct_answer,
      explanation = @explanation,
      wrong_options = @wrong_options,
      solved_at = CURRENT_TIMESTAMP
  `);

  return stmt.run({
    question_id: solution.question_id,
    correct_answer: solution.correct_answer,
    explanation: solution.explanation,
    wrong_options: JSON.stringify(solution.wrong_options || {})
  });
}

// Export database instance and helper functions
export {
  db,
  initializeDatabase,
  // Questions
  upsertQuestion,
  getQuestionsByTopic,
  getQuestionById,
  getAllTopics,
  getRandomQuestion,
  getNextUnansweredQuestion,
  // Attempts
  recordAttempt,
  getAttemptsByQuestion,
  getFailedQuestions,
  // Stats
  getGlobalStats,
  getTopicStats,
  // Solutions Cache
  getCachedSolution,
  cacheSolution
};
