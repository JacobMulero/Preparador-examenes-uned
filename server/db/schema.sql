-- Database schema for exam-app
-- SQLite database for tracking questions, attempts, and cached solutions

-- ============================================
-- FASE 0: Multi-Subject Foundation
-- ============================================

-- Subjects: asignaturas disponibles
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,                    -- "bda", "ffi", "ds"
  name TEXT NOT NULL,
  short_name TEXT,
  description TEXT,
  language TEXT DEFAULT 'es',
  methodology TEXT NOT NULL,              -- JSON: ["test"] o ["practice"]
  exam_type TEXT DEFAULT 'test',          -- "test" | "verification"
  modes TEXT NOT NULL,                    -- JSON: ["test"] o ["verification"] o ambos
  claude_context TEXT,                    -- JSON: expertise, terminology
  config TEXT,                            -- config.json completo
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Topics: temas/capitulos por asignatura
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,                    -- "bda_tema1"
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  order_num INTEGER DEFAULT 0,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);

-- ============================================
-- Core Tables
-- ============================================

-- Questions table: stores parsed questions from markdown files
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,                    -- Format: "tema1_pregunta5"
  subject_id TEXT DEFAULT 'bda',          -- Subject ID (Fase 1: multi-subject)
  topic TEXT NOT NULL,                    -- Topic identifier: "Tema1", "Tema2", etc.
  question_number INTEGER NOT NULL,       -- Question number within the topic
  shared_statement TEXT,                  -- Shared statement if multiple questions share context
  content TEXT NOT NULL,                  -- Full question text
  options TEXT NOT NULL,                  -- JSON array of options: {"a": "...", "b": "...", ...}
  parsed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Attempts table: records user answer attempts
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  user_answer TEXT NOT NULL,              -- User's selected option: "a", "b", "c", "d"
  correct_answer TEXT NOT NULL,           -- The correct option
  is_correct BOOLEAN NOT NULL,            -- Whether user's answer was correct
  explanation TEXT,                       -- Claude's explanation for the answer
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- Solutions cache: stores Claude's solutions to avoid redundant API calls
CREATE TABLE IF NOT EXISTS solutions_cache (
  question_id TEXT PRIMARY KEY,
  correct_answer TEXT NOT NULL,           -- The correct option: "a", "b", "c", "d"
  explanation TEXT NOT NULL,              -- Why this is the correct answer
  wrong_options TEXT,                     -- JSON explaining why other options are wrong
  solved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_attempts_correct ON attempts(is_correct);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);

-- ============================================
-- FASE 2: PDF Pipeline
-- ============================================

-- PDFs de exámenes subidos
CREATE TABLE IF NOT EXISTS exam_pdfs (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  page_count INTEGER,
  status TEXT DEFAULT 'uploaded',         -- uploaded, extracting, parsing, completed, error
  error_message TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Páginas individuales de PDFs
CREATE TABLE IF NOT EXISTS exam_pages (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  image_path TEXT,
  raw_markdown TEXT,                      -- Output directo de Vision
  processed_markdown TEXT,                -- Normalizado
  status TEXT DEFAULT 'pending',          -- pending, processing, completed, error
  vision_tokens INTEGER,
  processed_at DATETIME,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE
);

-- Preguntas parseadas (antes de revisión)
CREATE TABLE IF NOT EXISTS parsed_questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_id TEXT,
  question_number INTEGER,
  raw_content TEXT NOT NULL,
  normalized_content TEXT,
  options TEXT,                           -- JSON: {a, b, c, d}
  status TEXT DEFAULT 'pending',          -- pending, reviewed, approved, rejected
  reviewer_notes TEXT,
  reviewed_at DATETIME,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES exam_pages(id) ON DELETE SET NULL
);

-- Indexes for PDF pipeline
CREATE INDEX IF NOT EXISTS idx_exam_pdfs_subject ON exam_pdfs(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_pdfs_status ON exam_pdfs(status);
CREATE INDEX IF NOT EXISTS idx_exam_pages_exam ON exam_pages(exam_id);
CREATE INDEX IF NOT EXISTS idx_parsed_questions_exam ON parsed_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_parsed_questions_status ON parsed_questions(status);
