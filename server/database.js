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

// Run migrations on module load
try {
  db.exec('ALTER TABLE questions ADD COLUMN parent_question_id TEXT');
  console.log('[Database] Migration: Added parent_question_id column');
} catch (e) {
  // Column already exists, ignore error
}

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
    INSERT INTO questions (id, subject_id, topic, question_number, shared_statement, content, options, parent_question_id, parsed_at)
    VALUES (@id, @subject_id, @topic, @question_number, @shared_statement, @content, @options, @parent_question_id, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      subject_id = @subject_id,
      topic = @topic,
      question_number = @question_number,
      shared_statement = @shared_statement,
      content = @content,
      options = @options,
      parent_question_id = @parent_question_id,
      parsed_at = CURRENT_TIMESTAMP
  `);

  return stmt.run({
    id: question.id,
    subject_id: question.subject_id || 'bda',
    topic: question.topic,
    question_number: question.question_number,
    shared_statement: question.shared_statement || null,
    content: question.content,
    options: JSON.stringify(question.options),
    parent_question_id: question.parent_question_id || null
  });
}

/**
 * Get all questions for a topic
 * @param {string} topic - Topic identifier
 * @param {string} subjectId - Subject ID (default: 'bda')
 */
function getQuestionsByTopic(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT
      q.*,
      p.content as parent_content,
      p.shared_statement as parent_statement,
      p.question_number as parent_number
    FROM questions q
    LEFT JOIN questions p ON q.parent_question_id = p.id
    WHERE q.topic = ? AND q.subject_id = ?
    ORDER BY q.question_number
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
  let query = `
    SELECT
      q.*,
      p.content as parent_content,
      p.shared_statement as parent_statement,
      p.question_number as parent_number
    FROM questions q
    LEFT JOIN questions p ON q.parent_question_id = p.id
    WHERE q.id = ?
  `;
  const params = [id];

  if (subjectId) {
    query += ' AND q.subject_id = ?';
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
      SELECT
        q.*,
        p.content as parent_content,
        p.shared_statement as parent_statement,
        p.question_number as parent_number
      FROM questions q
      LEFT JOIN questions p ON q.parent_question_id = p.id
      WHERE q.topic = ? AND q.subject_id = ?
      ORDER BY RANDOM() LIMIT 1
    `);
    const row = stmt.get(topic, subjectId);
    if (row) row.options = JSON.parse(row.options);
    return row;
  } else {
    stmt = db.prepare(`
      SELECT
        q.*,
        p.content as parent_content,
        p.shared_statement as parent_statement,
        p.question_number as parent_number
      FROM questions q
      LEFT JOIN questions p ON q.parent_question_id = p.id
      WHERE q.subject_id = ?
      ORDER BY RANDOM() LIMIT 1
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
// Exam Mode Helper Functions
// ============================================

/**
 * Get random questions from all topics for exam mode
 * @param {number} count - Number of questions
 * @param {string} subjectId - Subject ID
 * @param {string[]} excludeIds - Question IDs to exclude (optional)
 */
function getRandomQuestionsAllTopics(count, subjectId = 'bda', excludeIds = []) {
  let query = `
    SELECT * FROM questions
    WHERE subject_id = ?
  `;
  const params = [subjectId];

  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map(() => '?').join(',');
    query += ` AND id NOT IN (${placeholders})`;
    params.push(...excludeIds);
  }

  query += ` ORDER BY RANDOM() LIMIT ?`;
  params.push(count);

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);
  return rows.map(row => ({
    ...row,
    options: JSON.parse(row.options)
  }));
}

/**
 * Get IDs of questions that have been correctly answered
 * @param {string} subjectId - Subject ID (optional)
 */
function getCorrectlyAnsweredQuestionIds(subjectId = null) {
  let query = `
    SELECT DISTINCT q.id
    FROM questions q
    INNER JOIN (
      SELECT question_id, is_correct,
             ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY attempted_at DESC, id DESC) as rn
      FROM attempts
    ) a ON q.id = a.question_id AND a.rn = 1
    WHERE a.is_correct = 1
  `;
  const params = [];

  if (subjectId) {
    query += ` AND q.subject_id = ?`;
    params.push(subjectId);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);
  return rows.map(row => row.id);
}

/**
 * Get count of questions by subject
 * @param {string} subjectId - Subject ID
 */
function getQuestionCountBySubject(subjectId = 'bda') {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM questions WHERE subject_id = ?`);
  return stmt.get(subjectId).count;
}

// ============================================
// Adaptive Mode Functions
// ============================================

/**
 * Get questions prioritizing least-seen and failed ones
 * Scoring: never seen = 100, failed = 50, correct = 0
 * @param {number} count - Number of questions to retrieve
 * @param {string} subjectId - Subject ID
 */
function getAdaptiveQuestions(count, subjectId = 'bda') {
  // This query assigns priority scores:
  // - Questions never attempted: 100 points
  // - Questions with last attempt failed: 50 points
  // - Questions with last attempt correct: 0 points
  // Then sorts by score desc with randomness for equal scores
  const stmt = db.prepare(`
    WITH question_scores AS (
      SELECT
        q.*,
        CASE
          WHEN latest.question_id IS NULL THEN 100
          WHEN latest.is_correct = 0 THEN 50
          ELSE 0
        END as priority_score,
        latest.attempted_at as last_attempt
      FROM questions q
      LEFT JOIN (
        SELECT question_id, is_correct, attempted_at,
               ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY attempted_at DESC, id DESC) as rn
        FROM attempts
      ) latest ON q.id = latest.question_id AND latest.rn = 1
      WHERE q.subject_id = ?
    )
    SELECT * FROM question_scores
    ORDER BY priority_score DESC, RANDOM()
    LIMIT ?
  `);

  const rows = stmt.all(subjectId, count);
  return rows.map(row => ({
    ...row,
    options: JSON.parse(row.options),
    priority_score: row.priority_score,
    last_attempt: row.last_attempt
  }));
}

/**
 * Get question stats for adaptive mode display
 * @param {string} subjectId - Subject ID
 */
function getAdaptiveModeStats(subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN latest.question_id IS NULL THEN 1 ELSE 0 END) as never_seen,
      SUM(CASE WHEN latest.is_correct = 0 THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN latest.is_correct = 1 THEN 1 ELSE 0 END) as mastered
    FROM questions q
    LEFT JOIN (
      SELECT question_id, is_correct,
             ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY attempted_at DESC, id DESC) as rn
      FROM attempts
    ) latest ON q.id = latest.question_id AND latest.rn = 1
    WHERE q.subject_id = ?
  `);

  return stmt.get(subjectId);
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

// ============================================
// PDF Pipeline Helper Functions (Fase 2)
// ============================================

/**
 * Create a new exam PDF record
 * @param {Object} examPdf - Exam PDF data
 */
function createExamPdf(examPdf) {
  const stmt = db.prepare(`
    INSERT INTO exam_pdfs (id, subject_id, filename, original_path, page_count, status, is_deliverable)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    examPdf.id,
    examPdf.subjectId,
    examPdf.filename,
    examPdf.originalPath,
    examPdf.pageCount || null,
    examPdf.status || 'uploaded',
    examPdf.isDeliverable ? 1 : 0
  );
  return getExamPdf(examPdf.id);
}

/**
 * Get exam PDF by ID
 * @param {string} examId - Exam PDF ID
 */
function getExamPdf(examId) {
  const stmt = db.prepare('SELECT * FROM exam_pdfs WHERE id = ?');
  return stmt.get(examId);
}

/**
 * Get all exam PDFs for a subject
 * @param {string} subjectId - Subject ID
 */
function getExamPdfsBySubject(subjectId) {
  const stmt = db.prepare(`
    SELECT * FROM exam_pdfs WHERE subject_id = ? ORDER BY uploaded_at DESC
  `);
  return stmt.all(subjectId);
}

/**
 * Update exam PDF status
 * @param {string} examId - Exam PDF ID
 * @param {string} status - New status
 * @param {string} errorMessage - Error message (optional)
 */
function updateExamPdfStatus(examId, status, errorMessage = null) {
  const stmt = db.prepare(`
    UPDATE exam_pdfs
    SET status = ?, error_message = ?, processed_at = CASE WHEN ? IN ('completed', 'error') THEN CURRENT_TIMESTAMP ELSE processed_at END
    WHERE id = ?
  `);
  stmt.run(status, errorMessage, status, examId);
  return getExamPdf(examId);
}

/**
 * Update exam PDF page count
 * @param {string} examId - Exam PDF ID
 * @param {number} pageCount - Number of pages
 */
function updateExamPdfPageCount(examId, pageCount) {
  const stmt = db.prepare('UPDATE exam_pdfs SET page_count = ? WHERE id = ?');
  stmt.run(pageCount, examId);
  return getExamPdf(examId);
}

/**
 * Create an exam page record
 * @param {Object} page - Page data
 */
function createExamPage(page) {
  const stmt = db.prepare(`
    INSERT INTO exam_pages (id, exam_id, page_number, image_path, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(page.id, page.examId, page.pageNumber, page.imagePath, page.status || 'pending');
  return getExamPage(page.id);
}

/**
 * Get exam page by ID
 * @param {string} pageId - Page ID
 */
function getExamPage(pageId) {
  const stmt = db.prepare('SELECT * FROM exam_pages WHERE id = ?');
  return stmt.get(pageId);
}

/**
 * Get all pages for an exam
 * @param {string} examId - Exam PDF ID
 */
function getExamPages(examId) {
  const stmt = db.prepare('SELECT * FROM exam_pages WHERE exam_id = ? ORDER BY page_number');
  return stmt.all(examId);
}

/**
 * Update exam page with Vision results
 * @param {string} pageId - Page ID
 * @param {Object} data - Update data
 */
function updateExamPage(pageId, data) {
  const fields = [];
  const values = [];

  if (data.rawMarkdown !== undefined) {
    fields.push('raw_markdown = ?');
    values.push(data.rawMarkdown);
  }
  if (data.processedMarkdown !== undefined) {
    fields.push('processed_markdown = ?');
    values.push(data.processedMarkdown);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    values.push(data.status);
  }
  if (data.visionTokens !== undefined) {
    fields.push('vision_tokens = ?');
    values.push(data.visionTokens);
  }
  if (data.status === 'completed' || data.status === 'error') {
    fields.push('processed_at = CURRENT_TIMESTAMP');
  }

  if (fields.length === 0) return getExamPage(pageId);

  values.push(pageId);
  const stmt = db.prepare(`UPDATE exam_pages SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  return getExamPage(pageId);
}

/**
 * Create a parsed question record
 * @param {Object} question - Parsed question data
 */
function createParsedQuestion(question) {
  const stmt = db.prepare(`
    INSERT INTO parsed_questions (id, exam_id, page_id, question_number, raw_content, normalized_content, options, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    question.id,
    question.examId,
    question.pageId || null,
    question.questionNumber,
    question.rawContent,
    question.normalizedContent || null,
    question.options ? JSON.stringify(question.options) : null,
    question.status || 'pending'
  );
  return getParsedQuestion(question.id);
}

/**
 * Get parsed question by ID
 * @param {string} questionId - Parsed question ID
 */
function getParsedQuestion(questionId) {
  const stmt = db.prepare('SELECT * FROM parsed_questions WHERE id = ?');
  const row = stmt.get(questionId);
  if (row && row.options) {
    row.options = JSON.parse(row.options);
  }
  return row;
}

/**
 * Get all parsed questions for an exam
 * @param {string} examId - Exam PDF ID
 */
function getParsedQuestionsByExam(examId) {
  const stmt = db.prepare('SELECT * FROM parsed_questions WHERE exam_id = ? ORDER BY question_number');
  return stmt.all(examId).map(row => ({
    ...row,
    options: row.options ? JSON.parse(row.options) : null
  }));
}

/**
 * Get parsed questions by status
 * @param {string} status - Status filter
 * @param {string} examId - Exam ID (optional)
 */
function getParsedQuestionsByStatus(status, examId = null) {
  let query = 'SELECT * FROM parsed_questions WHERE status = ?';
  const params = [status];

  if (examId) {
    query += ' AND exam_id = ?';
    params.push(examId);
  }

  query += ' ORDER BY question_number';

  const stmt = db.prepare(query);
  return stmt.all(...params).map(row => ({
    ...row,
    options: row.options ? JSON.parse(row.options) : null
  }));
}

/**
 * Update parsed question status (approve/reject)
 * @param {string} questionId - Parsed question ID
 * @param {string} status - New status (approved/rejected)
 * @param {string} reviewerNotes - Notes from reviewer
 */
function updateParsedQuestionStatus(questionId, status, reviewerNotes = null) {
  const stmt = db.prepare(`
    UPDATE parsed_questions
    SET status = ?, reviewer_notes = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(status, reviewerNotes, questionId);
  return getParsedQuestion(questionId);
}

/**
 * Update parsed question content
 * @param {string} questionId - Parsed question ID
 * @param {Object} data - Update data
 */
function updateParsedQuestion(questionId, data) {
  const fields = [];
  const values = [];

  if (data.normalizedContent !== undefined) {
    fields.push('normalized_content = ?');
    values.push(data.normalizedContent);
  }
  if (data.options !== undefined) {
    fields.push('options = ?');
    values.push(JSON.stringify(data.options));
  }
  if (data.rawContent !== undefined) {
    fields.push('raw_content = ?');
    values.push(data.rawContent);
  }

  if (fields.length === 0) return getParsedQuestion(questionId);

  values.push(questionId);
  const stmt = db.prepare(`UPDATE parsed_questions SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  return getParsedQuestion(questionId);
}

/**
 * Delete exam PDF and all related data
 * @param {string} examId - Exam PDF ID
 */
function deleteExamPdf(examId) {
  const deletePages = db.prepare('DELETE FROM exam_pages WHERE exam_id = ?');
  const deleteQuestions = db.prepare('DELETE FROM parsed_questions WHERE exam_id = ?');
  const deleteExam = db.prepare('DELETE FROM exam_pdfs WHERE id = ?');

  const deleteAll = db.transaction(() => {
    deleteQuestions.run(examId);
    deletePages.run(examId);
    deleteExam.run(examId);
  });

  deleteAll();
}

// ============================================
// Generation Sessions Helper Functions (Fase 3)
// ============================================

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create a new generation session
 * @param {Object} session - Session data
 */
function createGenerationSession(session) {
  const id = session.id || generateUUID();
  const stmt = db.prepare(`
    INSERT INTO generation_sessions
    (id, subject_id, student_id, deliverable_id, session_mode, topic_focus, difficulty, question_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  stmt.run(
    id,
    session.subjectId,
    session.studentId || null,
    session.deliverableId || null,
    session.sessionMode || 'test',
    session.topicFocus ? JSON.stringify(session.topicFocus) : null,
    session.difficulty || 'mixed',
    session.questionCount || 10
  );
  return getGenerationSessionById(id);
}

/**
 * Get generation session by ID
 * @param {string} id - Session ID
 */
function getGenerationSessionById(id) {
  const stmt = db.prepare('SELECT * FROM generation_sessions WHERE id = ?');
  const row = stmt.get(id);
  if (!row) return null;
  return {
    ...row,
    topicFocus: row.topic_focus ? JSON.parse(row.topic_focus) : null
  };
}

/**
 * Get generation sessions by subject
 * @param {string} subjectId - Subject ID
 */
function getGenerationSessionsBySubject(subjectId) {
  const stmt = db.prepare(`
    SELECT * FROM generation_sessions
    WHERE subject_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(subjectId).map(row => ({
    ...row,
    topicFocus: row.topic_focus ? JSON.parse(row.topic_focus) : null
  }));
}

/**
 * Get generation sessions by deliverable
 * @param {string} deliverableId - Deliverable ID
 */
function getGenerationSessionsByDeliverable(deliverableId) {
  const stmt = db.prepare(`
    SELECT * FROM generation_sessions
    WHERE deliverable_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(deliverableId).map(row => ({
    ...row,
    topicFocus: row.topic_focus ? JSON.parse(row.topic_focus) : null
  }));
}

/**
 * Update generation session status
 * @param {string} id - Session ID
 * @param {string} status - New status
 * @param {string} errorMessage - Error message (optional)
 */
function updateGenerationSessionStatus(id, status, errorMessage = null) {
  const stmt = db.prepare(`
    UPDATE generation_sessions
    SET status = ?,
        error_message = ?,
        completed_at = CASE WHEN ? IN ('completed', 'error') THEN datetime('now') ELSE completed_at END
    WHERE id = ?
  `);
  stmt.run(status, errorMessage, status, id);
  return getGenerationSessionById(id);
}

// ============================================
// Generated Test Questions Helper Functions (Fase 3)
// ============================================

/**
 * Add a generated question
 * @param {Object} question - Question data
 */
function addGeneratedQuestion(question) {
  const id = question.id || generateUUID();
  const stmt = db.prepare(`
    INSERT INTO generated_test_questions
    (id, session_id, question_number, content, options, correct_answer, explanation, wrong_explanations, rationale, targeted_weakness, based_on_section, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    question.sessionId,
    question.questionNumber,
    question.content,
    JSON.stringify(question.options),
    question.correctAnswer,
    question.explanation,
    question.wrongExplanations ? JSON.stringify(question.wrongExplanations) : null,
    question.rationale || null,
    question.targetedWeakness || null,
    question.basedOnSection || null,
    question.difficulty || 'medium'
  );
  return id;
}

/**
 * Get generated questions by session
 * @param {string} sessionId - Session ID
 */
function getGeneratedQuestionsBySession(sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM generated_test_questions
    WHERE session_id = ?
    ORDER BY question_number
  `);
  return stmt.all(sessionId).map(row => ({
    ...row,
    options: JSON.parse(row.options),
    wrongExplanations: row.wrong_explanations ? JSON.parse(row.wrong_explanations) : null
  }));
}

/**
 * Get generated question by ID
 * @param {string} id - Question ID
 */
function getGeneratedQuestionById(id) {
  const stmt = db.prepare('SELECT * FROM generated_test_questions WHERE id = ?');
  const row = stmt.get(id);
  if (!row) return null;
  return {
    ...row,
    options: JSON.parse(row.options),
    wrongExplanations: row.wrong_explanations ? JSON.parse(row.wrong_explanations) : null
  };
}

// ============================================
// Generated Question Attempts Helper Functions (Fase 3)
// ============================================

/**
 * Record an attempt on a generated question
 * @param {Object} attempt - Attempt data
 */
function recordGeneratedAttempt(attempt) {
  const stmt = db.prepare(`
    INSERT INTO generated_question_attempts
    (question_id, session_id, user_answer, is_correct, time_spent_seconds)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    attempt.questionId,
    attempt.sessionId,
    attempt.userAnswer,
    attempt.isCorrect ? 1 : 0,
    attempt.timeSpentSeconds || null
  );
}

/**
 * Get attempts by session
 * @param {string} sessionId - Session ID
 */
function getGeneratedAttemptsBySession(sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM generated_question_attempts
    WHERE session_id = ?
    ORDER BY attempted_at
  `);
  return stmt.all(sessionId);
}

/**
 * Get session statistics
 * @param {string} sessionId - Session ID
 * @returns {Object} Statistics with total_attempts, correct, avg_time
 */
function getSessionStats(sessionId) {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_attempts,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
      AVG(time_spent_seconds) as avg_time
    FROM generated_question_attempts
    WHERE session_id = ?
  `);
  return stmt.get(sessionId);
}

// ============================================
// Verification Sessions Helper Functions (Fase 4)
// ============================================

/**
 * Create a new verification session
 * @param {Object} session - Session data
 */
function createVerificationSession(session) {
  const id = session.id || generateUUID();
  const stmt = db.prepare(`
    INSERT INTO verification_sessions
    (id, subject_id, deliverable_id, student_name, focus_areas, question_count, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  stmt.run(
    id,
    session.subjectId,
    session.deliverableId || null,
    session.studentName || null,
    session.focusAreas ? JSON.stringify(session.focusAreas) : null,
    session.questionCount || 5
  );
  return getVerificationSessionById(id);
}

/**
 * Get verification session by ID
 * @param {string} id - Session ID
 */
function getVerificationSessionById(id) {
  const stmt = db.prepare('SELECT * FROM verification_sessions WHERE id = ?');
  const row = stmt.get(id);
  if (!row) return null;
  return {
    ...row,
    focusAreas: row.focus_areas ? JSON.parse(row.focus_areas) : null
  };
}

/**
 * Get verification sessions by subject
 * @param {string} subjectId - Subject ID
 */
function getVerificationSessionsBySubject(subjectId) {
  const stmt = db.prepare(`
    SELECT * FROM verification_sessions
    WHERE subject_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(subjectId).map(row => ({
    ...row,
    focusAreas: row.focus_areas ? JSON.parse(row.focus_areas) : null
  }));
}

/**
 * Update verification session
 * @param {string} id - Session ID
 * @param {Object} updates - Fields to update
 */
function updateVerificationSession(id, updates) {
  const fields = [];
  const values = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.score !== undefined) {
    fields.push('score = ?');
    values.push(updates.score);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.status === 'completed') {
    fields.push("completed_at = datetime('now')");
  }

  if (fields.length === 0) return getVerificationSessionById(id);

  values.push(id);
  const stmt = db.prepare(`UPDATE verification_sessions SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  return getVerificationSessionById(id);
}

// ============================================
// Verification Questions Helper Functions (Fase 4)
// ============================================

/**
 * Add a verification question
 * @param {Object} question - Question data
 */
function addVerificationQuestion(question) {
  const id = question.id || generateUUID();
  const stmt = db.prepare(`
    INSERT INTO verification_questions
    (id, session_id, question_number, content, expected_answer, evaluation_criteria, related_section, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    question.sessionId,
    question.questionNumber,
    question.content,
    question.expectedAnswer || null,
    question.evaluationCriteria ? JSON.stringify(question.evaluationCriteria) : null,
    question.relatedSection || null,
    question.difficulty || 'medium'
  );
  return id;
}

/**
 * Get verification questions by session
 * @param {string} sessionId - Session ID
 */
function getVerificationQuestionsBySession(sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM verification_questions
    WHERE session_id = ?
    ORDER BY question_number
  `);
  return stmt.all(sessionId).map(row => ({
    ...row,
    evaluationCriteria: row.evaluation_criteria ? JSON.parse(row.evaluation_criteria) : null
  }));
}

/**
 * Get verification question by ID
 * @param {string} id - Question ID
 */
function getVerificationQuestionById(id) {
  const stmt = db.prepare('SELECT * FROM verification_questions WHERE id = ?');
  const row = stmt.get(id);
  if (!row) return null;
  return {
    ...row,
    evaluationCriteria: row.evaluation_criteria ? JSON.parse(row.evaluation_criteria) : null
  };
}

/**
 * Score a verification question
 * @param {string} id - Question ID
 * @param {number} score - Score (0-10)
 * @param {string} feedback - Feedback from professor
 * @param {string} actualAnswer - Transcribed answer from student
 */
function scoreVerificationQuestion(id, score, feedback = null, actualAnswer = null) {
  const stmt = db.prepare(`
    UPDATE verification_questions
    SET score = ?, feedback = ?, actual_answer = ?, answered_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(score, feedback, actualAnswer, id);
  return getVerificationQuestionById(id);
}

/**
 * Calculate verification session final score
 * @param {string} sessionId - Session ID
 */
function calculateVerificationSessionScore(sessionId) {
  const stmt = db.prepare(`
    SELECT AVG(score) as avg_score, COUNT(*) as answered,
           (SELECT question_count FROM verification_sessions WHERE id = ?) as total
    FROM verification_questions
    WHERE session_id = ? AND score IS NOT NULL
  `);
  return stmt.get(sessionId, sessionId);
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
  // Exam Mode
  getRandomQuestionsAllTopics,
  getCorrectlyAnsweredQuestionIds,
  getQuestionCountBySubject,
  // Adaptive Mode
  getAdaptiveQuestions,
  getAdaptiveModeStats,
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
  seedBDASubject,
  // PDF Pipeline (Fase 2)
  createExamPdf,
  getExamPdf,
  getExamPdfsBySubject,
  updateExamPdfStatus,
  updateExamPdfPageCount,
  createExamPage,
  getExamPage,
  getExamPages,
  updateExamPage,
  createParsedQuestion,
  getParsedQuestion,
  getParsedQuestionsByExam,
  getParsedQuestionsByStatus,
  updateParsedQuestionStatus,
  updateParsedQuestion,
  deleteExamPdf,
  // Question Generation (Fase 3)
  createGenerationSession,
  getGenerationSessionById,
  getGenerationSessionsBySubject,
  getGenerationSessionsByDeliverable,
  updateGenerationSessionStatus,
  addGeneratedQuestion,
  getGeneratedQuestionsBySession,
  getGeneratedQuestionById,
  recordGeneratedAttempt,
  getGeneratedAttemptsBySession,
  getSessionStats,
  // Verification Sessions (Fase 4)
  createVerificationSession,
  getVerificationSessionById,
  getVerificationSessionsBySubject,
  updateVerificationSession,
  addVerificationQuestion,
  getVerificationQuestionsBySession,
  getVerificationQuestionById,
  scoreVerificationQuestion,
  calculateVerificationSessionScore
};
