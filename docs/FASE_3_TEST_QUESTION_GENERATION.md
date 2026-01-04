# FASE 3: Generacion de Preguntas Tipo Test

> **Objetivo:** Generar preguntas tipo test personalizadas basadas en el analisis del trabajo
> **Prerequisitos:** Fase 2 completada (trabajo subido y analizado)
> **Entregable:** Sesion de estudio con preguntas a/b/c/d que atacan debilidades

---

## Resumen de Cambios

| Componente | Tipo | Descripcion |
|------------|------|-------------|
| `schema.sql` | Modificar | Tablas `generation_sessions`, `generated_test_questions` |
| `routes/generation.js` | Crear | Crear sesiones y generar preguntas |
| `services/questionGenerator.js` | Crear | Genera preguntas con Claude |
| `GeneratedTestQuestions.jsx` | Crear | UI de sesion de estudio |
| `PracticeSetup.jsx` | Crear | Configurar sesion |

---

## 1. Schema de Base de Datos

```sql
-- migration_004_generation.sql

-- Sesiones de generacion de preguntas
CREATE TABLE IF NOT EXISTS generation_sessions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  student_id TEXT,
  deliverable_id TEXT,
  session_mode TEXT NOT NULL DEFAULT 'test',  -- "test" | "verification"
  topic_focus TEXT,                           -- JSON array de secciones a enfocar
  difficulty TEXT DEFAULT 'mixed',            -- easy, medium, hard, mixed
  question_count INTEGER DEFAULT 10,
  status TEXT DEFAULT 'pending',              -- pending, generating, completed, error
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE SET NULL
);

-- Preguntas generadas por IA (tipo test)
CREATE TABLE IF NOT EXISTS generated_test_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_number INTEGER,
  content TEXT NOT NULL,
  options TEXT NOT NULL,                      -- JSON: {a, b, c, d}
  correct_answer TEXT NOT NULL,               -- "a", "b", "c", "d"
  explanation TEXT NOT NULL,
  wrong_explanations TEXT,                    -- JSON: explicacion por opcion incorrecta
  rationale TEXT,                             -- Por que se genero esta pregunta
  targeted_weakness TEXT,                     -- Debilidad que ataca
  based_on_section TEXT,                      -- Seccion del trabajo relacionada
  difficulty TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES generation_sessions(id) ON DELETE CASCADE
);

-- Intentos en preguntas generadas
CREATE TABLE IF NOT EXISTS generated_question_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES generated_test_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES generation_sessions(id) ON DELETE CASCADE
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_generation_sessions_subject ON generation_sessions(subject_id);
CREATE INDEX IF NOT EXISTS idx_generation_sessions_deliverable ON generation_sessions(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_generated_questions_session ON generated_test_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_generated_attempts_session ON generated_question_attempts(session_id);
```

---

## 2. Database Helpers

```javascript
// server/database.js - AGREGAR

import { v4 as uuidv4 } from 'uuid';

// ============================================
// GENERATION SESSIONS
// ============================================

export function createGenerationSession(session) {
  const id = session.id || uuidv4();
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

export function getGenerationSessionById(id) {
  const stmt = db.prepare('SELECT * FROM generation_sessions WHERE id = ?');
  const row = stmt.get(id);
  if (!row) return null;
  return {
    ...row,
    topicFocus: row.topic_focus ? JSON.parse(row.topic_focus) : null
  };
}

export function getGenerationSessionsByDeliverable(deliverableId) {
  const stmt = db.prepare(`
    SELECT * FROM generation_sessions
    WHERE deliverable_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(deliverableId);
}

export function updateGenerationSessionStatus(id, status, errorMessage = null) {
  const stmt = db.prepare(`
    UPDATE generation_sessions
    SET status = ?,
        error_message = ?,
        completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
    WHERE id = ?
  `);
  stmt.run(status, errorMessage, status, id);
  return getGenerationSessionById(id);
}

// ============================================
// GENERATED TEST QUESTIONS
// ============================================

export function addGeneratedQuestion(question) {
  const id = question.id || uuidv4();
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

export function getGeneratedQuestionsBySession(sessionId) {
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

export function getGeneratedQuestionById(id) {
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
// GENERATED QUESTION ATTEMPTS
// ============================================

export function recordGeneratedAttempt(attempt) {
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

export function getSessionStats(sessionId) {
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
```

---

## 3. Servicio de Generacion

### server/services/questionGenerator.js

```javascript
import Anthropic from '@anthropic-ai/sdk';
import {
  getDeliverableById,
  getDeliverableAnalysis,
  getDeliverableFiles,
  getSubjectById,
  getGenerationSessionById,
  updateGenerationSessionStatus,
  addGeneratedQuestion
} from '../database.js';
import fs from 'fs';

const client = new Anthropic();

/**
 * Genera preguntas tipo test basadas en el analisis del trabajo
 */
export async function generateTestQuestions(sessionId) {
  const session = getGenerationSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const subject = getSubjectById(session.subject_id);
  const claudeContext = subject.claude_context ? JSON.parse(subject.claude_context) : {};

  // Actualizar estado
  updateGenerationSessionStatus(sessionId, 'generating');

  try {
    // Obtener analisis del entregable (si existe)
    let analysisContext = '';
    let weaknesses = [];

    if (session.deliverable_id) {
      const analysis = getDeliverableAnalysis(session.deliverable_id);

      const strengthsData = analysis.find(a => a.analysis_type === 'strengths')?.content || [];
      const weaknessesData = analysis.find(a => a.analysis_type === 'weaknesses')?.content || [];

      weaknesses = weaknessesData;

      analysisContext = `
## ANALISIS DEL TRABAJO DEL ALUMNO

### Fortalezas detectadas:
${strengthsData.map(s => `- ${s.area}: ${s.description}`).join('\n')}

### Debilidades detectadas (PRIORIZAR PREGUNTAS SOBRE ESTAS):
${weaknessesData.map(w => `- ${w.area}: ${w.description} ${w.larmanRef ? `(Ver ${w.larmanRef})` : ''}`).join('\n')}
`;
    }

    // Construir prompt
    const prompt = buildGenerationPrompt(subject, claudeContext, session, analysisContext, weaknesses);

    // Llamar a Claude
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Parsear respuesta
    const questions = parseGeneratedQuestions(response.content[0].text);

    // Guardar preguntas
    let questionNumber = 1;
    for (const q of questions) {
      addGeneratedQuestion({
        sessionId,
        questionNumber: questionNumber++,
        content: q.content,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        wrongExplanations: q.wrongExplanations,
        rationale: q.rationale,
        targetedWeakness: q.targetedWeakness,
        basedOnSection: q.section,
        difficulty: q.difficulty
      });
    }

    // Actualizar estado
    updateGenerationSessionStatus(sessionId, 'completed');

    return questions;

  } catch (error) {
    console.error('Error generating questions:', error);
    updateGenerationSessionStatus(sessionId, 'error', error.message);
    throw error;
  }
}

/**
 * Construye el prompt para generar preguntas
 */
function buildGenerationPrompt(subject, claudeContext, session, analysisContext, weaknesses) {
  const count = session.question_count || 10;
  const difficulty = session.difficulty || 'mixed';

  // Determinar focos de las preguntas
  let topicFocus = '';
  if (session.topicFocus && session.topicFocus.length > 0) {
    topicFocus = `\n\nENFOCAR PREGUNTAS EN: ${session.topicFocus.join(', ')}`;
  }

  // Distribuir dificultad
  let difficultyInstructions = '';
  if (difficulty === 'mixed') {
    difficultyInstructions = `Distribuye las preguntas: 30% faciles, 50% medias, 20% dificiles.`;
  } else {
    difficultyInstructions = `Todas las preguntas deben ser de dificultad ${difficulty}.`;
  }

  return `Eres un profesor experto en ${claudeContext.expertise || 'diseno de software'}.
Libro de referencia: ${claudeContext.referenceBook || 'UML y Patrones - Craig Larman'}

## TAREA
Genera ${count} preguntas de tipo TEST (a/b/c/d) para practicar "${subject.name}".
${topicFocus}

${analysisContext}

## REQUISITOS DE LAS PREGUNTAS

1. **Personalizadas**: Si hay debilidades detectadas, genera preguntas que las ataquen directamente
2. **Educativas**: Cada pregunta debe ensenar algo util
3. **Bien fundamentadas**: Incluye referencias al libro de Larman
4. **Opciones plausibles**: Las opciones incorrectas deben ser errores comunes, no absurdos
5. **Explicaciones claras**: Explica POR QUE la respuesta es correcta y POR QUE las otras no

${difficultyInstructions}

## TEMAS A CUBRIR (segun Larman)

- Casos de Uso: Frontera del sistema, actores, EBP, relaciones
- Modelo de Dominio: Objetos conceptuales, cardinalidades, atributos
- Diagramas de Secuencia: Mensajes, patrones GRASP aplicados
- DCD: Navegabilidad, visibilidad, metodos
- GRASP: Experto, Creador, Controlador, Bajo Acoplamiento, Alta Cohesion
- GoF: Patrones aplicables y sus contextos

## FORMATO DE RESPUESTA (JSON)

Responde UNICAMENTE con un array JSON valido:

[
  {
    "content": "Texto de la pregunta...",
    "options": {
      "a": "Primera opcion",
      "b": "Segunda opcion",
      "c": "Tercera opcion",
      "d": "Cuarta opcion"
    },
    "correctAnswer": "b",
    "explanation": "Segun Larman Cap. X, la respuesta correcta es B porque...",
    "wrongExplanations": {
      "a": "A es incorrecta porque...",
      "c": "C es incorrecta porque...",
      "d": "D es incorrecta porque..."
    },
    "rationale": "Esta pregunta refuerza el concepto de...",
    "targetedWeakness": "modelo_dominio",
    "section": "modelo_dominio",
    "difficulty": "medium"
  }
]

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.`;
}

/**
 * Parsea la respuesta de Claude a array de preguntas
 */
function parseGeneratedQuestions(text) {
  // Buscar array JSON
  const jsonMatch = text.match(/\[[\s\S]*\]/);

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Error parsing questions JSON:', e);
    }
  }

  // Fallback: intentar extraer preguntas manualmente
  console.warn('Could not parse JSON, returning empty array');
  return [];
}

export default {
  generateTestQuestions
};
```

---

## 4. API Routes

### server/routes/generation.js

```javascript
import express from 'express';
import {
  createGenerationSession,
  getGenerationSessionById,
  getGenerationSessionsByDeliverable,
  getGeneratedQuestionsBySession,
  getGeneratedQuestionById,
  recordGeneratedAttempt,
  getSessionStats,
  getSubjectById,
  getDeliverableById
} from '../database.js';
import { generateTestQuestions } from '../services/questionGenerator.js';

const router = express.Router();

/**
 * POST /api/generate/test-session
 * Crear sesion de generacion tipo test
 */
router.post('/test-session', async (req, res) => {
  try {
    const { subjectId, deliverableId, topicFocus, difficulty, questionCount } = req.body;

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        error: 'subjectId es requerido'
      });
    }

    // Verificar subject existe
    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    // Verificar deliverable si se proporciona
    if (deliverableId) {
      const deliverable = getDeliverableById(deliverableId);
      if (!deliverable) {
        return res.status(404).json({
          success: false,
          error: 'Entregable no encontrado'
        });
      }
      if (deliverable.status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'El entregable debe estar analizado primero'
        });
      }
    }

    // Crear sesion
    const session = createGenerationSession({
      subjectId,
      deliverableId,
      sessionMode: 'test',
      topicFocus: topicFocus || null,
      difficulty: difficulty || 'mixed',
      questionCount: questionCount || 10
    });

    res.status(201).json({
      success: true,
      session
    });

  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear sesion'
    });
  }
});

/**
 * POST /api/generate/sessions/:id/start
 * Iniciar generacion de preguntas
 */
router.post('/sessions/:id/start', async (req, res) => {
  try {
    const session = getGenerationSessionById(req.params.id);

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

    if (session.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Las preguntas ya fueron generadas'
      });
    }

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Generacion iniciada',
      sessionId: req.params.id
    });

    // Generar en background
    generateTestQuestions(req.params.id).catch(err => {
      console.error('Background generation error:', err);
    });

  } catch (error) {
    console.error('Error starting generation:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar generacion'
    });
  }
});

/**
 * GET /api/generate/sessions/:id
 * Obtener estado de sesion
 */
router.get('/sessions/:id', (req, res) => {
  try {
    const session = getGenerationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesion'
    });
  }
});

/**
 * GET /api/generate/sessions/:id/questions
 * Obtener preguntas generadas
 */
router.get('/sessions/:id/questions', (req, res) => {
  try {
    const session = getGenerationSessionById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    const questions = getGeneratedQuestionsBySession(req.params.id);

    res.json({
      success: true,
      status: session.status,
      questions
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener preguntas'
    });
  }
});

/**
 * POST /api/generate/sessions/:id/attempt
 * Registrar intento de respuesta
 */
router.post('/sessions/:id/attempt', (req, res) => {
  try {
    const { questionId, userAnswer, timeSpentSeconds } = req.body;

    if (!questionId || !userAnswer) {
      return res.status(400).json({
        success: false,
        error: 'questionId y userAnswer son requeridos'
      });
    }

    const question = getGeneratedQuestionById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Pregunta no encontrada'
      });
    }

    const isCorrect = userAnswer.toLowerCase() === question.correct_answer.toLowerCase();

    recordGeneratedAttempt({
      questionId,
      sessionId: req.params.id,
      userAnswer,
      isCorrect,
      timeSpentSeconds
    });

    res.json({
      success: true,
      isCorrect,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      wrongExplanations: question.wrongExplanations
    });
  } catch (error) {
    console.error('Error recording attempt:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar intento'
    });
  }
});

/**
 * GET /api/generate/sessions/:id/stats
 * Estadisticas de la sesion
 */
router.get('/sessions/:id/stats', (req, res) => {
  try {
    const stats = getSessionStats(req.params.id);
    const session = getGenerationSessionById(req.params.id);
    const questions = getGeneratedQuestionsBySession(req.params.id);

    res.json({
      success: true,
      stats: {
        ...stats,
        total_questions: questions.length,
        answered: stats.total_attempts,
        accuracy: stats.total_attempts > 0 ? (stats.correct / stats.total_attempts * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadisticas'
    });
  }
});

/**
 * GET /api/generate/deliverable/:id/sessions
 * Sesiones de un entregable
 */
router.get('/deliverable/:id/sessions', (req, res) => {
  try {
    const sessions = getGenerationSessionsByDeliverable(req.params.id);

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sesiones'
    });
  }
});

export default router;
```

---

## 5. Componentes Frontend

### src/practice/PracticeSetup.jsx

```jsx
import { useState } from 'react';
import api from '../shared/api';
import './PracticeSetup.css';

const SECTIONS = [
  { id: 'casos_uso', name: 'Casos de Uso' },
  { id: 'modelo_dominio', name: 'Modelo de Dominio' },
  { id: 'diagramas_interaccion', name: 'Diagramas de Interaccion' },
  { id: 'dcd', name: 'DCD' },
  { id: 'grasp', name: 'Principios GRASP' },
  { id: 'gof', name: 'Patrones GoF' }
];

const DIFFICULTIES = [
  { id: 'easy', name: 'Facil' },
  { id: 'mixed', name: 'Mixto (recomendado)' },
  { id: 'hard', name: 'Dificil' }
];

function PracticeSetup({ subjectId, deliverableId, onSessionCreated }) {
  const [topicFocus, setTopicFocus] = useState([]);
  const [difficulty, setDifficulty] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleTopic = (topicId) => {
    setTopicFocus(prev =>
      prev.includes(topicId)
        ? prev.filter(t => t !== topicId)
        : [...prev, topicId]
    );
  };

  const handleStart = async () => {
    setLoading(true);
    setError(null);

    try {
      // Crear sesion
      const { session } = await api.createTestSession({
        subjectId,
        deliverableId,
        topicFocus: topicFocus.length > 0 ? topicFocus : null,
        difficulty,
        questionCount
      });

      // Iniciar generacion
      await api.startGeneration(session.id);

      if (onSessionCreated) {
        onSessionCreated(session);
      }

    } catch (err) {
      setError(err.message || 'Error al crear sesion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="practice-setup">
      <h2>Configurar Sesion de Estudio</h2>

      <div className="setup-section">
        <h3>Temas a enfocar (opcional)</h3>
        <p className="hint">Selecciona los temas en los que quieres mas preguntas</p>
        <div className="topic-chips">
          {SECTIONS.map(section => (
            <button
              key={section.id}
              className={`chip ${topicFocus.includes(section.id) ? 'selected' : ''}`}
              onClick={() => toggleTopic(section.id)}
            >
              {section.name}
            </button>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <h3>Dificultad</h3>
        <div className="difficulty-options">
          {DIFFICULTIES.map(d => (
            <label key={d.id} className="radio-option">
              <input
                type="radio"
                name="difficulty"
                value={d.id}
                checked={difficulty === d.id}
                onChange={() => setDifficulty(d.id)}
              />
              {d.name}
            </label>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <h3>Numero de preguntas</h3>
        <div className="count-selector">
          <button
            onClick={() => setQuestionCount(Math.max(5, questionCount - 5))}
            disabled={questionCount <= 5}
          >
            -
          </button>
          <span className="count">{questionCount}</span>
          <button
            onClick={() => setQuestionCount(Math.min(30, questionCount + 5))}
            disabled={questionCount >= 30}
          >
            +
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <button
        className="start-button"
        onClick={handleStart}
        disabled={loading}
      >
        {loading ? 'Creando sesion...' : 'Comenzar Practica'}
      </button>
    </div>
  );
}

export default PracticeSetup;
```

### src/practice/GeneratedTestQuestions.jsx

```jsx
import { useState, useEffect } from 'react';
import api from '../shared/api';
import './GeneratedTestQuestions.css';

function GeneratedTestQuestions({ sessionId, onComplete }) {
  const [status, setStatus] = useState('loading');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [startTime, setStartTime] = useState(null);

  // Cargar preguntas
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const data = await api.getSessionQuestions(sessionId);
        setStatus(data.status);

        if (data.status === 'completed' && data.questions.length > 0) {
          setQuestions(data.questions);
          setStartTime(Date.now());
        } else if (data.status === 'generating') {
          // Polling
          setTimeout(fetchQuestions, 2000);
        }
      } catch (err) {
        setStatus('error');
      }
    };

    fetchQuestions();
  }, [sessionId]);

  const handleAnswer = async (answer) => {
    if (result) return; // Ya respondio

    setSelectedAnswer(answer);

    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    try {
      const response = await api.submitGeneratedAnswer(sessionId, {
        questionId: questions[currentIndex].id,
        userAnswer: answer,
        timeSpentSeconds: timeSpent
      });

      setResult(response);
      setStats(prev => ({
        correct: prev.correct + (response.isCorrect ? 1 : 0),
        total: prev.total + 1
      }));

    } catch (err) {
      console.error('Error submitting answer:', err);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setResult(null);
      setStartTime(Date.now());
    } else {
      // Fin de la sesion
      if (onComplete) {
        onComplete(stats);
      }
    }
  };

  // Estados de carga
  if (status === 'loading' || status === 'generating') {
    return (
      <div className="generated-questions loading">
        <div className="spinner" />
        <p>Generando preguntas personalizadas...</p>
        <small>Esto puede tardar unos segundos</small>
      </div>
    );
  }

  if (status === 'error' || questions.length === 0) {
    return (
      <div className="generated-questions error">
        <h3>Error</h3>
        <p>No se pudieron cargar las preguntas</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="generated-questions">
      {/* Header con progreso */}
      <header className="session-header">
        <div className="progress-info">
          Pregunta {currentIndex + 1} de {questions.length}
        </div>
        <div className="stats-info">
          {stats.correct}/{stats.total} correctas
        </div>
      </header>

      {/* Barra de progreso */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Pregunta */}
      <div className="question-card">
        {currentQuestion.targeted_weakness && (
          <div className="weakness-tag">
            Refuerza: {currentQuestion.targeted_weakness}
          </div>
        )}

        <div className="question-content">
          {currentQuestion.content}
        </div>

        <div className="options">
          {Object.entries(currentQuestion.options).map(([key, value]) => (
            <button
              key={key}
              className={`option ${selectedAnswer === key ? 'selected' : ''} ${
                result
                  ? key === result.correctAnswer
                    ? 'correct'
                    : selectedAnswer === key
                      ? 'incorrect'
                      : ''
                  : ''
              }`}
              onClick={() => handleAnswer(key)}
              disabled={result !== null}
            >
              <span className="option-letter">{key.toUpperCase()}</span>
              <span className="option-text">{value}</span>
            </button>
          ))}
        </div>

        {/* Resultado y explicacion */}
        {result && (
          <div className={`result ${result.isCorrect ? 'correct' : 'incorrect'}`}>
            <h4>{result.isCorrect ? '✅ Correcto!' : '❌ Incorrecto'}</h4>

            <div className="explanation">
              <strong>Explicacion:</strong>
              <p>{result.explanation}</p>
            </div>

            {!result.isCorrect && result.wrongExplanations && (
              <div className="wrong-explanation">
                <strong>Por que {selectedAnswer.toUpperCase()} es incorrecta:</strong>
                <p>{result.wrongExplanations[selectedAnswer]}</p>
              </div>
            )}

            <button className="next-button" onClick={handleNext}>
              {currentIndex < questions.length - 1 ? 'Siguiente pregunta' : 'Ver resultados'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GeneratedTestQuestions;
```

---

## 6. API Client

```javascript
// src/shared/api.js - AGREGAR

// ============================================
// GENERATION
// ============================================

async createTestSession(config) {
  const response = await axios.post(`${this.baseUrl}/generate/test-session`, config);
  return response.data;
},

async startGeneration(sessionId) {
  const response = await axios.post(`${this.baseUrl}/generate/sessions/${sessionId}/start`);
  return response.data;
},

async getSession(sessionId) {
  const response = await axios.get(`${this.baseUrl}/generate/sessions/${sessionId}`);
  return response.data;
},

async getSessionQuestions(sessionId) {
  const response = await axios.get(`${this.baseUrl}/generate/sessions/${sessionId}/questions`);
  return response.data;
},

async submitGeneratedAnswer(sessionId, attempt) {
  const response = await axios.post(`${this.baseUrl}/generate/sessions/${sessionId}/attempt`, attempt);
  return response.data;
},

async getSessionStats(sessionId) {
  const response = await axios.get(`${this.baseUrl}/generate/sessions/${sessionId}/stats`);
  return response.data;
},
```

---

## 7. Tests

### tests/backend/generation.test.js

```javascript
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

describe('Generation API', () => {
  let app;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const router = (await import('../../server/routes/generation.js')).default;
    app.use('/api/generate', router);
  });

  describe('POST /api/generate/test-session', () => {
    it('should create session with valid data', async () => {
      // Mock database functions
      jest.mock('../../server/database.js');

      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: 'ds',
          questionCount: 10,
          difficulty: 'mixed'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session).toBeDefined();
    });

    it('should require subjectId', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/generate/sessions/:id/questions', () => {
    it('should return questions when ready', async () => {
      const res = await request(app)
        .get('/api/generate/sessions/test-session-id/questions');

      expect(res.body.success).toBeDefined();
    });
  });

  describe('POST /api/generate/sessions/:id/attempt', () => {
    it('should validate correct answer', async () => {
      const res = await request(app)
        .post('/api/generate/sessions/test-session-id/attempt')
        .send({
          questionId: 'q1',
          userAnswer: 'b'
        });

      expect(res.body).toBeDefined();
    });

    it('should require questionId and userAnswer', async () => {
      const res = await request(app)
        .post('/api/generate/sessions/test-session-id/attempt')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
```

---

## 8. Criterios de Aceptacion

### Tests que deben pasar

```bash
npm test -- --testPathPattern=generation.test.js
```

### Validacion Manual

- [ ] Crear sesion desde trabajo analizado
- [ ] Seleccionar topics de enfoque
- [ ] Ajustar numero de preguntas
- [ ] Generar preguntas con Claude
- [ ] Ver preguntas una a una
- [ ] Responder y ver explicacion
- [ ] Ver estadisticas al final

### Flujo E2E

1. Ir a trabajo ya analizado
2. Click "Practicar"
3. Configurar: 10 preguntas, mixto, enfoque GRASP
4. Click "Comenzar"
5. Esperar generacion
6. Responder 10 preguntas
7. Ver score final

---

## 9. Siguiente Fase

Una vez completada esta fase, se pueden generar preguntas tipo test personalizadas.
La siguiente es **FASE_4_VERIFICATION_MODE.md** que implementa el modo de verificacion de autoria.
