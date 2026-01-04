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

  return stmt.run({
    id: question.id,
    subject_id: question.subject_id || 'bda',
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
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function getQuestionsByTopic(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT * FROM questions WHERE topic = ? AND subject_id = ? ORDER BY question_number
  `);
  const rows = stmt.all(topic, subjectId);
  return rows.map(row => ({
    ...row,
    options: JSON.parse(row.options)
  }));
}

/**
 * Get a single question by ID
 * @param {string} id - Question ID
 * @param {string} subjectId - Subject ID (optional, if not provided, returns any matching question)
 */
function getQuestionById(id, subjectId = null) {
  let query = 'SELECT * FROM questions WHERE id = ?';
  const params = [id];

  if (subjectId) {
    query += ' AND subject_id = ?';
    params.push(subjectId);
  }

  const stmt = db.prepare(query);
  const row = stmt.get(...params);
  if (row) {
    row.options = JSON.parse(row.options);
  }
  return row;
}

/**
 * Get all distinct topics
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function getAllTopics(subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT DISTINCT topic, COUNT(*) as question_count
    FROM questions
    WHERE subject_id = ?
    GROUP BY topic
    ORDER BY topic
  `);
  return stmt.all(subjectId);
}

/**
 * Get a random question from a topic
 * @param {string} topic - Topic identifier (optional, all topics if null)
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function getRandomQuestion(topic = null, subjectId = 'bda') {
  let stmt;
  if (topic) {
    stmt = db.prepare(`
      SELECT * FROM questions WHERE topic = ? AND subject_id = ? ORDER BY RANDOM() LIMIT 1
    `);
    const row = stmt.get(topic, subjectId);
    if (row) row.options = JSON.parse(row.options);
    return row;
  } else {
    stmt = db.prepare(`
      SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM() LIMIT 1
    `);
    const row = stmt.get(subjectId);
    if (row) row.options = JSON.parse(row.options);
    return row;
  }
}

/**
 * Get next unanswered question for a topic
 * @param {string} topic - Topic identifier
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function getNextUnansweredQuestion(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT q.* FROM questions q
    LEFT JOIN attempts a ON q.id = a.question_id
    WHERE q.topic = ? AND q.subject_id = ? AND a.id IS NULL
    ORDER BY q.question_number
    LIMIT 1
  `);
  const row = stmt.get(topic, subjectId);
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

// ============================================
// Subject Helper Functions (Fase 0)
// ============================================

/**
 * Get all subjects
 */
function getAllSubjects() {
  const stmt = db.prepare(`
    SELECT id, name, short_name, description, methodology, exam_type, modes
    FROM subjects
    ORDER BY name
  `);
  return stmt.all().map(row => ({
    ...row,
    methodology: JSON.parse(row.methodology),
    modes: JSON.parse(row.modes)
  }));
}

/**
 * Get a subject by ID
 * @param {string} subjectId - Subject ID
 */
function getSubjectById(subjectId) {
  const stmt = db.prepare(`
    SELECT *
    FROM subjects
    WHERE id = ?
  `);
  const row = stmt.get(subjectId);
  if (!row) return null;

  return {
    ...row,
    methodology: JSON.parse(row.methodology),
    modes: JSON.parse(row.modes),
    claudeContext: row.claude_context ? JSON.parse(row.claude_context) : null,
    config: row.config ? JSON.parse(row.config) : null
  };
}

/**
 * Create a new subject
 * @param {Object} subject - Subject data
 */
function createSubject(subject) {
  const stmt = db.prepare(`
    INSERT INTO subjects (id, name, short_name, description, language, methodology, exam_type, modes, claude_context, config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    subject.id,
    subject.name,
    subject.shortName || null,
    subject.description || null,
    subject.language || 'es',
    JSON.stringify(subject.methodology),
    subject.examType || 'test',
    JSON.stringify(subject.modes),
    subject.claudeContext ? JSON.stringify(subject.claudeContext) : null,
    subject.config ? JSON.stringify(subject.config) : null
  );
  return getSubjectById(subject.id);
}

/**
 * Update a subject
 * @param {string} subjectId - Subject ID
 * @param {Object} updates - Fields to update
 */
function updateSubject(subjectId, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.shortName !== undefined) {
    fields.push('short_name = ?');
    values.push(updates.shortName);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.methodology !== undefined) {
    fields.push('methodology = ?');
    values.push(JSON.stringify(updates.methodology));
  }
  if (updates.modes !== undefined) {
    fields.push('modes = ?');
    values.push(JSON.stringify(updates.modes));
  }
  if (updates.claudeContext !== undefined) {
    fields.push('claude_context = ?');
    values.push(JSON.stringify(updates.claudeContext));
  }

  if (fields.length === 0) return getSubjectById(subjectId);

  values.push(subjectId);
  const stmt = db.prepare(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return getSubjectById(subjectId);
}

// ============================================
// Topics by Subject Helper Functions (Fase 0)
// ============================================

/**
 * Get topics for a subject
 * @param {string} subjectId - Subject ID
 */
function getTopicsBySubject(subjectId) {
  const stmt = db.prepare(`
    SELECT id, name, description, order_num
    FROM topics
    WHERE subject_id = ?
    ORDER BY order_num
  `);
  return stmt.all(subjectId);
}

/**
 * Create a topic
 * @param {Object} topic - Topic data
 */
function createTopic(topic) {
  const stmt = db.prepare(`
    INSERT INTO topics (id, subject_id, name, description, order_num)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    topic.id,
    topic.subjectId,
    topic.name,
    topic.description || null,
    topic.orderNum || 0
  );
  return getTopic(topic.id);
}

/**
 * Get a topic by ID
 * @param {string} topicId - Topic ID
 */
function getTopic(topicId) {
  const stmt = db.prepare('SELECT * FROM topics WHERE id = ?');
  return stmt.get(topicId);
}

/**
 * Seed BDA as default subject with its topics
 */
function seedBDASubject() {
  // Check if BDA already exists
  const existing = getSubjectById('bda');
  if (existing) {
    console.log('[Database] BDA subject already exists, skipping seed');
    return existing;
  }

  console.log('[Database] Seeding BDA subject and topics...');

  // Create BDA subject
  createSubject({
    id: 'bda',
    name: 'Bases de Datos Avanzadas',
    shortName: 'BDA',
    description: 'Query processing, optimization, transactions, concurrency, recovery',
    language: 'es',
    methodology: ['test'],
    examType: 'test',
    modes: ['test'],
    claudeContext: {
      expertise: 'database internals, query processing, query optimization, transactions, concurrency control, recovery systems',
      terminology: ['tupla', 'bloque', 'reunion', 'accesos a disco']
    }
  });

  // Create BDA topics (matching existing Tema1-7 + SinTema)
  const bdaTopics = [
    { id: 'bda_tema1', name: 'Query Processing', description: 'Cost estimation, sorting, join algorithms', orderNum: 1 },
    { id: 'bda_tema2', name: 'Query Optimization', description: 'Catalog statistics, equivalence rules', orderNum: 2 },
    { id: 'bda_tema3', name: 'Transactions', description: 'ACID, serializability, schedules', orderNum: 3 },
    { id: 'bda_tema4', name: 'Concurrency Control', description: 'Locking, 2PL, deadlocks', orderNum: 4 },
    { id: 'bda_tema5', name: 'Recovery System', description: 'Logging, ARIES, checkpoints', orderNum: 5 },
    { id: 'bda_tema6', name: 'Tema 6', description: 'Contenido adicional', orderNum: 6 },
    { id: 'bda_tema7', name: 'Tema 7', description: 'Contenido adicional', orderNum: 7 },
    { id: 'bda_sintema', name: 'Sin Tema', description: 'Preguntas generales', orderNum: 99 }
  ];

  for (const topic of bdaTopics) {
    createTopic({
      id: topic.id,
      subjectId: 'bda',
      name: topic.name,
      description: topic.description,
      orderNum: topic.orderNum
    });
  }

  console.log('[Database] BDA subject and topics seeded successfully');
  return getSubjectById('bda');
}

/**
 * Migration: Add subject_id to questions table if not exists
 * Migrates existing questions to BDA subject
 */
function migrateQuestionsSubjectId() {
  try {
    // Check if subject_id column exists
    const tableInfo = db.pragma('table_info(questions)');
    const hasSubjectId = tableInfo.some(col => col.name === 'subject_id');

    if (!hasSubjectId) {
      console.log('[Database] Adding subject_id column to questions...');
      db.exec(`ALTER TABLE questions ADD COLUMN subject_id TEXT DEFAULT 'bda'`);
      console.log('[Database] Migrating existing questions to BDA subject...');
      db.exec(`UPDATE questions SET subject_id = 'bda' WHERE subject_id IS NULL`);
      console.log('[Database] Migration completed successfully');
    }
  } catch (error) {
    console.error('[Database] Migration error:', error.message);
  }
}

// Export database instance and helper functions
export {
  db,
  initializeDatabase,
  migrateQuestionsSubjectId,
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
  cacheSolution,
  // Subjects (Fase 0)
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  // Topics by Subject (Fase 0)
  getTopicsBySubject,
  createTopic,
  getTopic,
  // Seed
  seedBDASubject
};
