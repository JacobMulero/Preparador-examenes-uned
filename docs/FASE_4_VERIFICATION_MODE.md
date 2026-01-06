# FASE 4: Modo Verificacion de Autoria

> **Estado:** NO IMPLEMENTADA
> **Objetivo:** Verificar que el alumno ha hecho su trabajo mediante preguntas orales
> **Prerequisitos:** Fase 3 completada (generacion de preguntas)
> **Tipo de asignatura:** Practicas (DS, FFI) - no aplica a asignaturas tipo test (BDA)

---

## Resumen

El modo verificacion es para asignaturas donde el alumno entrega un trabajo practico (UML, codigo, diagramas) y el profesor quiere verificar que lo ha hecho el mismo. En lugar de preguntas de tipo test (a/b/c/d), se generan preguntas abiertas que el alumno debe responder oralmente.

**Diferencia con Fase 3:**
- Fase 3 (Test): Genera preguntas tipo test con 4 opciones
- Fase 4 (Verification): Genera preguntas abiertas para respuesta oral

---

## Arquitectura Actual del Proyecto

### Tablas de BD existentes (schema.sql)
```
attempts              - Intentos en preguntas de test
exam_pages            - Paginas de PDFs extraidos
exam_pdfs             - PDFs de examenes subidos
generated_question_attempts - Intentos en preguntas generadas
generated_test_questions    - Preguntas tipo test generadas (Fase 3)
generation_sessions         - Sesiones de generacion (Fase 3)
parsed_questions           - Preguntas parseadas del pipeline
questions                  - Preguntas base
solutions_cache            - Cache de soluciones Claude
subjects                   - Asignaturas
topics                     - Temas por asignatura
```

### Rutas existentes
```
server/routes/
├── generation.js    # Fase 3 - Generacion tipo test
├── pipeline.js      # Fase 5 - Pipeline PDFs
├── questions.js     # Preguntas y temas
├── solving.js       # Resolver con Claude
├── stats.js         # Estadisticas
└── subjects.js      # Asignaturas
```

---

## Componentes a Implementar

### 1. Schema de Base de Datos

```sql
-- Nuevas tablas para verificacion

-- Sesiones de verificacion oral
CREATE TABLE IF NOT EXISTS verification_sessions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  deliverable_id TEXT,                    -- Trabajo entregado (si existe)
  student_name TEXT,
  session_mode TEXT DEFAULT 'verification',
  focus_areas TEXT,                       -- JSON: areas a evaluar
  question_count INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',          -- pending, in_progress, completed
  score REAL,                             -- Puntuacion final (0-10)
  notes TEXT,                             -- Notas del profesor
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Preguntas de verificacion (abiertas, no tipo test)
CREATE TABLE IF NOT EXISTS verification_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_number INTEGER,
  content TEXT NOT NULL,                  -- Pregunta abierta
  expected_answer TEXT,                   -- Respuesta esperada/guia
  evaluation_criteria TEXT,               -- JSON: criterios de evaluacion
  related_section TEXT,                   -- Seccion del trabajo relacionada
  difficulty TEXT DEFAULT 'medium',
  actual_answer TEXT,                     -- Respuesta del alumno (transcrita)
  score REAL,                             -- Puntuacion de esta pregunta
  feedback TEXT,                          -- Feedback del profesor
  answered_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES verification_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_subject ON verification_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_verification_questions_session ON verification_questions(session_id);
```

### 2. Database Helpers (database.js)

```javascript
// ============================================
// VERIFICATION SESSIONS
// ============================================

export function createVerificationSession(session) {
  const id = session.id || crypto.randomUUID();
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

export function getVerificationSessionById(id) {
  const stmt = db.prepare('SELECT * FROM verification_sessions WHERE id = ?');
  const row = stmt.get(id);
  if (!row) return null;
  return {
    ...row,
    focusAreas: row.focus_areas ? JSON.parse(row.focus_areas) : null
  };
}

export function updateVerificationSession(id, updates) {
  // Implementar actualizacion de campos
}

// ============================================
// VERIFICATION QUESTIONS
// ============================================

export function addVerificationQuestion(question) {
  const id = question.id || crypto.randomUUID();
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

export function getVerificationQuestionsBySession(sessionId) {
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

export function scoreVerificationQuestion(id, score, feedback, actualAnswer) {
  const stmt = db.prepare(`
    UPDATE verification_questions
    SET score = ?, feedback = ?, actual_answer = ?, answered_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(score, feedback, actualAnswer, id);
}
```

### 3. Servicio de Generacion (verificationGenerator.js)

```javascript
// server/services/verificationGenerator.js

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  getVerificationSessionById,
  updateVerificationSession,
  addVerificationQuestion,
  getSubjectById
} from '../database.js';

/**
 * Genera preguntas de verificacion oral basadas en el trabajo del alumno
 */
export async function generateVerificationQuestions(sessionId) {
  const session = getVerificationSessionById(sessionId);
  if (!session) throw new Error('Session not found');

  const subject = getSubjectById(session.subject_id);

  // Actualizar estado
  updateVerificationSession(sessionId, { status: 'generating' });

  try {
    const prompt = buildVerificationPrompt(subject, session);

    // Usar Claude Agent SDK
    const response = await query({
      prompt: prompt,
      options: { maxTurns: 1 }
    });

    // Parsear respuesta
    const questions = parseVerificationQuestions(response.result);

    // Guardar preguntas
    let questionNumber = 1;
    for (const q of questions) {
      addVerificationQuestion({
        sessionId,
        questionNumber: questionNumber++,
        content: q.content,
        expectedAnswer: q.expectedAnswer,
        evaluationCriteria: q.criteria,
        relatedSection: q.section,
        difficulty: q.difficulty
      });
    }

    updateVerificationSession(sessionId, { status: 'ready' });
    return questions;

  } catch (error) {
    updateVerificationSession(sessionId, { status: 'error' });
    throw error;
  }
}

function buildVerificationPrompt(subject, session) {
  return `Eres un profesor experto en ${subject.name}.

TAREA: Genera ${session.question_count} preguntas de VERIFICACION ORAL para comprobar que el alumno ha hecho su propio trabajo.

TIPO DE PREGUNTAS:
- Preguntas abiertas que requieren explicacion
- No son tipo test (no tienen opciones a/b/c/d)
- El alumno debe responder oralmente explicando su razonamiento
- Deben verificar comprension profunda, no solo memorizado

AREAS A EVALUAR: ${session.focusAreas?.join(', ') || 'General'}

FORMATO JSON:
[
  {
    "content": "Explica por que elegiste X en lugar de Y para...",
    "expectedAnswer": "El alumno deberia mencionar...",
    "criteria": ["comprension del patron", "justificacion de la decision"],
    "section": "modelo_dominio",
    "difficulty": "medium"
  }
]

IMPORTANTE: Solo devuelve el JSON, sin texto adicional.`;
}
```

### 4. API Routes (routes/verification.js)

```javascript
// server/routes/verification.js

import { Router } from 'express';
import {
  createVerificationSession,
  getVerificationSessionById,
  getVerificationQuestionsBySession,
  scoreVerificationQuestion,
  updateVerificationSession,
  getSubjectById
} from '../database.js';
import { generateVerificationQuestions } from '../services/verificationGenerator.js';

const router = Router();

// POST /api/verification/sessions - Crear sesion
router.post('/sessions', async (req, res) => {
  try {
    const { subjectId, studentName, focusAreas, questionCount } = req.body;

    if (!subjectId) {
      return res.status(400).json({ success: false, error: 'subjectId requerido' });
    }

    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({ success: false, error: 'Asignatura no encontrada' });
    }

    const session = createVerificationSession({
      subjectId,
      studentName,
      focusAreas,
      questionCount: questionCount || 5
    });

    res.status(201).json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/verification/sessions/:id/generate - Generar preguntas
router.post('/sessions/:id/generate', async (req, res) => {
  try {
    const session = getVerificationSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesion no encontrada' });
    }

    // Responder inmediatamente, generar en background
    res.json({ success: true, message: 'Generando preguntas...' });

    generateVerificationQuestions(req.params.id).catch(console.error);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/verification/sessions/:id - Obtener sesion con preguntas
router.get('/sessions/:id', (req, res) => {
  try {
    const session = getVerificationSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sesion no encontrada' });
    }

    const questions = getVerificationQuestionsBySession(req.params.id);

    res.json({ success: true, session, questions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/verification/questions/:id/score - Puntuar respuesta
router.post('/questions/:id/score', (req, res) => {
  try {
    const { score, feedback, actualAnswer } = req.body;

    if (score === undefined || score < 0 || score > 10) {
      return res.status(400).json({ success: false, error: 'Score debe ser 0-10' });
    }

    scoreVerificationQuestion(req.params.id, score, feedback, actualAnswer);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/verification/sessions/:id/complete - Finalizar sesion
router.post('/sessions/:id/complete', (req, res) => {
  try {
    const { notes, finalScore } = req.body;

    updateVerificationSession(req.params.id, {
      status: 'completed',
      notes,
      score: finalScore
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

### 5. Componentes Frontend

#### VerificationSetup.jsx
```jsx
// src/verification/VerificationSetup.jsx
function VerificationSetup({ subjectId, onSessionCreated }) {
  const [studentName, setStudentName] = useState('');
  const [focusAreas, setFocusAreas] = useState([]);
  const [questionCount, setQuestionCount] = useState(5);

  const handleStart = async () => {
    const session = await api.createVerificationSession({
      subjectId,
      studentName,
      focusAreas,
      questionCount
    });
    await api.generateVerificationQuestions(session.id);
    onSessionCreated(session);
  };

  return (
    <div className="verification-setup">
      <h2>Configurar Verificacion Oral</h2>
      {/* Formulario de configuracion */}
    </div>
  );
}
```

#### VerificationSession.jsx
```jsx
// src/verification/VerificationSession.jsx
function VerificationSession({ sessionId }) {
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Vista para el profesor durante la verificacion oral
  // - Muestra pregunta actual
  // - Campo para transcribir respuesta del alumno
  // - Slider para puntuar (0-10)
  // - Campo de feedback
  // - Botones: Siguiente, Finalizar
}
```

---

## Flujo de Usuario

1. Profesor selecciona asignatura (DS, FFI - no BDA)
2. Click en "Verificacion Oral"
3. Introduce nombre del alumno
4. Selecciona areas a evaluar (opcional)
5. Click "Generar Preguntas"
6. Se generan N preguntas abiertas con Claude
7. Para cada pregunta:
   - Profesor lee la pregunta al alumno
   - Alumno responde oralmente
   - Profesor transcribe respuesta (opcional)
   - Profesor puntua (0-10) y da feedback
8. Al finalizar: ver resumen con puntuacion total

---

## Diferencias con Fase 3 (Test Questions)

| Aspecto | Fase 3 (Test) | Fase 4 (Verification) |
|---------|---------------|----------------------|
| Tipo pregunta | Opcion multiple (a/b/c/d) | Abierta/oral |
| Quien responde | Alumno en UI | Alumno oralmente |
| Evaluacion | Automatica (correctAnswer) | Manual (profesor) |
| Puntuacion | Correcto/Incorrecto | 0-10 escala |
| Proposito | Practicar examen | Verificar autoria |
| Asignaturas | Test (BDA) | Practicas (DS, FFI) |

---

## Archivos a Crear

| Archivo | Descripcion |
|---------|-------------|
| `server/routes/verification.js` | API de verificacion |
| `server/services/verificationGenerator.js` | Generador con Claude |
| `src/verification/VerificationSetup.jsx` | Config sesion |
| `src/verification/VerificationSession.jsx` | Sesion activa |
| `src/verification/VerificationResults.jsx` | Resumen final |
| `tests/backend/verification.test.js` | Tests backend |

---

## Siguiente Fase

Una vez implementada, el profesor podra verificar que los alumnos han hecho sus propios trabajos mediante preguntas orales personalizadas.
