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
  is_deliverable INTEGER DEFAULT 0,       -- 1 si es entregable de alumno (verificacion)
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

-- ============================================
-- FASE 3: Test Question Generation
-- ============================================

-- Sesiones de generacion de preguntas
CREATE TABLE IF NOT EXISTS generation_sessions (
  id TEXT PRIMARY KEY,                        -- UUID
  subject_id TEXT NOT NULL,
  student_id TEXT,                            -- Opcional: identificar estudiante
  deliverable_id TEXT,                        -- Opcional: enlazar con entregable (Fase 2)
  session_mode TEXT NOT NULL DEFAULT 'test',  -- "test" | "verification"
  topic_focus TEXT,                           -- JSON array de secciones a enfocar
  difficulty TEXT DEFAULT 'mixed',            -- easy, medium, hard, mixed
  question_count INTEGER DEFAULT 10,
  status TEXT DEFAULT 'pending',              -- pending, generating, completed, error
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  -- deliverable_id FK omitido: Fase 2 opcional
);

-- Preguntas generadas por IA (tipo test)
CREATE TABLE IF NOT EXISTS generated_test_questions (
  id TEXT PRIMARY KEY,                        -- UUID
  session_id TEXT NOT NULL,
  question_number INTEGER,
  content TEXT NOT NULL,                      -- Texto de la pregunta
  options TEXT NOT NULL,                      -- JSON: {a, b, c, d}
  correct_answer TEXT NOT NULL,               -- "a", "b", "c", "d"
  explanation TEXT NOT NULL,                  -- Explicacion de la respuesta correcta
  wrong_explanations TEXT,                    -- JSON: explicacion por opcion incorrecta
  rationale TEXT,                             -- Por que se genero esta pregunta
  targeted_weakness TEXT,                     -- Debilidad que ataca
  based_on_section TEXT,                      -- Seccion del trabajo relacionada
  difficulty TEXT DEFAULT 'medium',           -- easy, medium, hard
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES generation_sessions(id) ON DELETE CASCADE
);

-- Intentos en preguntas generadas
CREATE TABLE IF NOT EXISTS generated_question_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_answer TEXT NOT NULL,                  -- "a", "b", "c", "d"
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES generated_test_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES generation_sessions(id) ON DELETE CASCADE
);

-- Indexes for generation
CREATE INDEX IF NOT EXISTS idx_generation_sessions_subject ON generation_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_generation_sessions_deliverable ON generation_sessions(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_generation_sessions_status ON generation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_generated_questions_session ON generated_test_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_generated_attempts_question ON generated_question_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_generated_attempts_session ON generated_question_attempts(session_id);

-- ============================================
-- FASE 4: Verification Mode (Oral Questions)
-- ============================================

-- Sesiones de verificacion oral
-- deliverable_id apunta a exam_pdfs.id (se usa el pipeline existente)
CREATE TABLE IF NOT EXISTS verification_sessions (
  id TEXT PRIMARY KEY,                        -- UUID
  subject_id TEXT NOT NULL,
  deliverable_id TEXT,                        -- ID del PDF procesado (exam_pdfs.id)
  student_name TEXT,                          -- Nombre del alumno
  focus_areas TEXT,                           -- JSON: areas a evaluar
  question_count INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',              -- pending, generating, ready, in_progress, completed
  score REAL,                                 -- Puntuacion final (0-10)
  notes TEXT,                                 -- Notas del profesor
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Preguntas de verificacion (abiertas, no tipo test)
CREATE TABLE IF NOT EXISTS verification_questions (
  id TEXT PRIMARY KEY,                        -- UUID
  session_id TEXT NOT NULL,
  question_number INTEGER NOT NULL,
  content TEXT NOT NULL,                      -- Pregunta abierta
  expected_answer TEXT,                       -- Respuesta esperada/guia
  evaluation_criteria TEXT,                   -- JSON: criterios de evaluacion
  related_section TEXT,                       -- Seccion del trabajo relacionada
  difficulty TEXT DEFAULT 'medium',           -- easy, medium, hard
  actual_answer TEXT,                         -- Respuesta del alumno (transcrita)
  score REAL,                                 -- Puntuacion de esta pregunta (0-10)
  feedback TEXT,                              -- Feedback del profesor
  answered_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES verification_sessions(id) ON DELETE CASCADE
);

-- Indexes for verification
CREATE INDEX IF NOT EXISTS idx_verification_sessions_subject ON verification_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_verification_sessions_status ON verification_sessions(status);
CREATE INDEX IF NOT EXISTS idx_verification_questions_session ON verification_questions(session_id);
