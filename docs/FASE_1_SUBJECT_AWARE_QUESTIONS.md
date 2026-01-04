# FASE 1: Preguntas Conscientes de Asignatura

> **Objetivo:** Refactorizar el sistema de preguntas para que sea multi-asignatura
> **Prerequisitos:** Fase 0 completada (subjects y topics en DB)
> **Entregable:** Flujo completo de examen por asignatura (BDA funcional end-to-end)

---

## Resumen de Cambios

| Componente | Tipo | Descripcion |
|------------|------|-------------|
| `schema.sql` | Modificar | Agregar `subject_id` a `questions` |
| `questions.js` (rutas) | Modificar | Prefijo `/subjects/:subjectId` |
| `database.js` | Modificar | Queries con filtro `subject_id` |
| `SubjectDashboard.jsx` | Crear | Dashboard por asignatura |
| `TopicSelector.jsx` | Modificar | Recibe topics dinamicos |
| `App.jsx` | Modificar | Rutas anidadas por subject |
| `api.js` | Modificar | Endpoints subject-aware |

---

## 1. Schema de Base de Datos

### Modificar tabla questions

```sql
-- migration_002_questions_subject.sql

-- Agregar subject_id a questions (si no existe)
ALTER TABLE questions ADD COLUMN subject_id TEXT;

-- Crear indice
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);

-- Migrar preguntas existentes a BDA
UPDATE questions SET subject_id = 'bda' WHERE subject_id IS NULL;

-- Hacer subject_id NOT NULL (SQLite no permite ALTER COLUMN, hay que recrear)
-- En produccion: crear nueva tabla, migrar datos, renombrar

-- Para desarrollo limpio, el nuevo schema seria:
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,               -- NUEVO: obligatorio
  topic TEXT,                             -- Mantener por compatibilidad
  topic_id TEXT,                          -- Referencia a topics.id
  question_number INTEGER,
  question_type TEXT DEFAULT 'test',
  shared_statement TEXT,
  content TEXT NOT NULL,
  options TEXT,
  expected_answer TEXT,
  source_type TEXT DEFAULT 'manual',
  source_reference TEXT,
  difficulty TEXT,
  parsed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
```

### Script de migracion

```javascript
// server/migrations/002_questions_subject.js

export function migrate(db) {
  // Verificar si ya tiene subject_id
  const info = db.pragma(`table_info(questions)`);
  const hasSubjectId = info.some(col => col.name === 'subject_id');

  if (!hasSubjectId) {
    console.log('Adding subject_id to questions table...');

    // Agregar columna
    db.exec(`ALTER TABLE questions ADD COLUMN subject_id TEXT`);

    // Migrar existentes a BDA
    db.exec(`UPDATE questions SET subject_id = 'bda' WHERE subject_id IS NULL`);

    console.log('Migration completed');
  }
}
```

---

## 2. Database Helpers

### Modificar funciones existentes

```javascript
// server/database.js - MODIFICAR

// ============================================
// QUESTIONS (subject-aware)
// ============================================

/**
 * Obtiene preguntas por tema Y asignatura
 */
export function getQuestionsByTopic(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT id, subject_id, topic, question_number, shared_statement, content, options
    FROM questions
    WHERE topic = ? AND subject_id = ?
    ORDER BY question_number
  `);
  return stmt.all(topic, subjectId).map(row => ({
    ...row,
    options: JSON.parse(row.options || '{}')
  }));
}

/**
 * Obtiene pregunta por ID (verificando subject)
 */
export function getQuestionById(questionId, subjectId = null) {
  let query = `
    SELECT id, subject_id, topic, question_number, shared_statement, content, options
    FROM questions
    WHERE id = ?
  `;
  const params = [questionId];

  if (subjectId) {
    query += ' AND subject_id = ?';
    params.push(subjectId);
  }

  const stmt = db.prepare(query);
  const row = stmt.get(...params);

  if (!row) return null;

  return {
    ...row,
    options: JSON.parse(row.options || '{}')
  };
}

/**
 * Obtiene todos los topics de una asignatura (desde preguntas)
 */
export function getAllTopicsFromQuestions(subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT DISTINCT topic
    FROM questions
    WHERE subject_id = ? AND topic IS NOT NULL
    ORDER BY topic
  `);
  return stmt.all(subjectId).map(row => row.topic);
}

/**
 * Obtiene pregunta aleatoria de un topic
 */
export function getRandomQuestion(topic = null, subjectId = 'bda') {
  let query = `
    SELECT id, subject_id, topic, question_number, shared_statement, content, options
    FROM questions
    WHERE subject_id = ?
  `;
  const params = [subjectId];

  if (topic) {
    query += ' AND topic = ?';
    params.push(topic);
  }

  query += ' ORDER BY RANDOM() LIMIT 1';

  const stmt = db.prepare(query);
  const row = stmt.get(...params);

  if (!row) return null;

  return {
    ...row,
    options: JSON.parse(row.options || '{}')
  };
}

/**
 * Obtiene siguiente pregunta sin responder
 */
export function getNextUnansweredQuestion(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT q.id, q.subject_id, q.topic, q.question_number, q.shared_statement, q.content, q.options
    FROM questions q
    LEFT JOIN attempts a ON q.id = a.question_id
    WHERE q.topic = ? AND q.subject_id = ? AND a.id IS NULL
    ORDER BY q.question_number
    LIMIT 1
  `);
  const row = stmt.get(topic, subjectId);

  if (!row) return null;

  return {
    ...row,
    options: JSON.parse(row.options || '{}')
  };
}

/**
 * Cuenta preguntas por topic
 */
export function countQuestionsByTopic(topic, subjectId = 'bda') {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM questions
    WHERE topic = ? AND subject_id = ?
  `);
  return stmt.get(topic, subjectId).count;
}

/**
 * Inserta pregunta con subject_id
 */
export function upsertQuestion(question) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO questions
    (id, subject_id, topic, question_number, shared_statement, content, options, source_type, parsed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    question.id,
    question.subjectId || 'bda',
    question.topic,
    question.question_number,
    question.shared_statement || null,
    question.content,
    JSON.stringify(question.options),
    question.sourceType || 'manual'
  );
}
```

---

## 3. API Routes

### Modificar server/routes/questions.js

```javascript
import express from 'express';
import {
  getQuestionsByTopic,
  getQuestionById,
  getAllTopicsFromQuestions,
  getRandomQuestion,
  getNextUnansweredQuestion,
  countQuestionsByTopic,
  getSubjectById
} from '../database.js';
import { parseQuestionFile, getAvailableTopics } from '../questionParser.js';

const router = express.Router();

// ============================================
// RUTAS CON SUBJECT (nuevas)
// ============================================

/**
 * GET /api/subjects/:subjectId/topics
 * Lista topics de una asignatura
 */
router.get('/subjects/:subjectId/topics', (req, res) => {
  try {
    const { subjectId } = req.params;

    // Verificar que existe la asignatura
    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    // Obtener topics desde preguntas
    const topicNames = getAllTopicsFromQuestions(subjectId);

    // Agregar conteo de preguntas
    const topics = topicNames.map(name => ({
      id: `${subjectId}_${name.toLowerCase().replace(/\s+/g, '')}`,
      name,
      questionCount: countQuestionsByTopic(name, subjectId)
    }));

    res.json({
      success: true,
      subject: {
        id: subject.id,
        name: subject.name,
        shortName: subject.short_name
      },
      topics
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener temas'
    });
  }
});

/**
 * GET /api/subjects/:subjectId/questions/:topic
 * Preguntas de un topic
 */
router.get('/subjects/:subjectId/questions/:topic', (req, res) => {
  try {
    const { subjectId, topic } = req.params;

    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    const questions = getQuestionsByTopic(topic, subjectId);

    res.json({
      success: true,
      subject: { id: subject.id, name: subject.name },
      topic,
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
 * GET /api/subjects/:subjectId/questions/:topic/random
 * Pregunta aleatoria de un topic
 */
router.get('/subjects/:subjectId/questions/:topic/random', (req, res) => {
  try {
    const { subjectId, topic } = req.params;

    const question = getRandomQuestion(topic, subjectId);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'No hay preguntas disponibles'
      });
    }

    res.json({
      success: true,
      question
    });
  } catch (error) {
    console.error('Error fetching random question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener pregunta aleatoria'
    });
  }
});

/**
 * GET /api/subjects/:subjectId/questions/:topic/next
 * Siguiente pregunta sin responder
 */
router.get('/subjects/:subjectId/questions/:topic/next', (req, res) => {
  try {
    const { subjectId, topic } = req.params;

    let question = getNextUnansweredQuestion(topic, subjectId);

    // Si todas respondidas, dar aleatoria
    if (!question) {
      question = getRandomQuestion(topic, subjectId);
    }

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'No hay preguntas disponibles'
      });
    }

    res.json({
      success: true,
      question
    });
  } catch (error) {
    console.error('Error fetching next question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener siguiente pregunta'
    });
  }
});

/**
 * GET /api/subjects/:subjectId/question/:questionId
 * Pregunta especifica
 */
router.get('/subjects/:subjectId/question/:questionId', (req, res) => {
  try {
    const { subjectId, questionId } = req.params;

    const question = getQuestionById(questionId, subjectId);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Pregunta no encontrada'
      });
    }

    res.json({
      success: true,
      question
    });
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener pregunta'
    });
  }
});

// ============================================
// RUTAS LEGACY (compatibilidad con BDA)
// ============================================

/**
 * GET /api/topics
 * @deprecated Usar /api/subjects/:subjectId/topics
 */
router.get('/topics', (req, res) => {
  try {
    const topics = getAllTopicsFromQuestions('bda');
    res.json({
      success: true,
      topics: topics.map(name => ({
        id: name.toLowerCase().replace(/\s+/g, ''),
        name,
        questionCount: countQuestionsByTopic(name, 'bda')
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/questions/:topic
 * @deprecated Usar /api/subjects/:subjectId/questions/:topic
 */
router.get('/questions/:topic', (req, res) => {
  try {
    const questions = getQuestionsByTopic(req.params.topic, 'bda');
    res.json({ success: true, questions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

---

## 4. Componentes Frontend

### src/subjects/SubjectDashboard.jsx

```jsx
import { useState, useEffect } from 'react';
import { useParams, Routes, Route, Navigate } from 'react-router-dom';
import TopicSelector from '../questions/TopicSelector';
import QuestionList from '../questions/QuestionList';
import QuestionView from '../questions/QuestionView';
import StatsPanel from '../progress/StatsPanel';
import api from '../shared/api';
import './SubjectDashboard.css';

function SubjectDashboard() {
  const { subjectId } = useParams();
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSubject = async () => {
      try {
        setLoading(true);
        const data = await api.getSubject(subjectId);
        setSubject(data.subject);
      } catch (err) {
        setError('Error al cargar asignatura');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubject();
  }, [subjectId]);

  if (loading) {
    return <div className="subject-dashboard loading">Cargando...</div>;
  }

  if (error || !subject) {
    return <div className="subject-dashboard error">{error || 'Asignatura no encontrada'}</div>;
  }

  return (
    <div className="subject-dashboard">
      <header className="subject-header">
        <span className="subject-badge">{subject.short_name || subject.id.toUpperCase()}</span>
        <h1>{subject.name}</h1>
      </header>

      <Routes>
        {/* Selector de temas */}
        <Route index element={<TopicSelector subjectId={subjectId} />} />

        {/* Lista de preguntas de un tema */}
        <Route path="topic/:topic" element={<QuestionList subjectId={subjectId} />} />

        {/* Vista de pregunta individual */}
        <Route path="topic/:topic/question/:questionId" element={<QuestionView subjectId={subjectId} />} />

        {/* Estadisticas */}
        <Route path="stats" element={<StatsPanel subjectId={subjectId} />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
    </div>
  );
}

export default SubjectDashboard;
```

### src/subjects/SubjectDashboard.css

```css
.subject-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}

.subject-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}

.subject-badge {
  background: #4a90d9;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.9rem;
}

.subject-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.subject-dashboard.loading,
.subject-dashboard.error {
  text-align: center;
  padding: 3rem;
  color: #666;
}
```

### Modificar src/questions/TopicSelector.jsx

```jsx
import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../shared/api';
import './TopicSelector.css';

function TopicSelector({ subjectId: propSubjectId }) {
  const { subjectId: paramSubjectId } = useParams();
  const subjectId = propSubjectId || paramSubjectId || 'bda';

  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        setLoading(true);
        const data = await api.getSubjectTopics(subjectId);
        setTopics(data.topics);
      } catch (err) {
        setError('Error al cargar temas');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTopics();
  }, [subjectId]);

  if (loading) {
    return <div className="topic-selector loading">Cargando temas...</div>;
  }

  if (error) {
    return <div className="topic-selector error">{error}</div>;
  }

  return (
    <div className="topic-selector">
      <h2>Selecciona un Tema</h2>

      <div className="topics-grid">
        {topics.map(topic => (
          <Link
            key={topic.id}
            to={`/subjects/${subjectId}/topic/${topic.name}`}
            className="topic-card"
          >
            <h3>{topic.name}</h3>
            <span className="question-count">
              {topic.questionCount} preguntas
            </span>
          </Link>
        ))}
      </div>

      {topics.length === 0 && (
        <p className="no-topics">No hay temas disponibles</p>
      )}
    </div>
  );
}

export default TopicSelector;
```

### Modificar src/questions/QuestionList.jsx

```jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import QuestionCard from './QuestionCard';
import api from '../shared/api';
import './QuestionList.css';

function QuestionList({ subjectId: propSubjectId }) {
  const { subjectId: paramSubjectId, topic } = useParams();
  const subjectId = propSubjectId || paramSubjectId || 'bda';

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const data = await api.getSubjectQuestions(subjectId, topic);
        setQuestions(data.questions);
        setCurrentIndex(0);
      } catch (err) {
        setError('Error al cargar preguntas');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [subjectId, topic]);

  const handlePrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1));
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [questions.length]);

  if (loading) {
    return <div className="question-list loading">Cargando preguntas...</div>;
  }

  if (error) {
    return <div className="question-list error">{error}</div>;
  }

  if (questions.length === 0) {
    return (
      <div className="question-list empty">
        <p>No hay preguntas en este tema</p>
        <Link to={`/subjects/${subjectId}`}>Volver a temas</Link>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="question-list">
      <div className="navigation-bar">
        <Link to={`/subjects/${subjectId}`} className="back-link">
          ← Volver a temas
        </Link>
        <span className="progress">
          Pregunta {currentIndex + 1} de {questions.length}
        </span>
      </div>

      <QuestionCard
        question={currentQuestion}
        subjectId={subjectId}
      />

      <div className="navigation-buttons">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="nav-btn"
        >
          ← Anterior
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === questions.length - 1}
          className="nav-btn"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

export default QuestionList;
```

---

## 5. API Client

### src/shared/api.js - Modificar

```javascript
// AGREGAR/MODIFICAR en api.js

const api = {
  baseUrl: '/api',

  // ============================================
  // SUBJECTS
  // ============================================

  async getSubjects() {
    const response = await axios.get(`${this.baseUrl}/subjects`);
    return response.data;
  },

  async getSubject(subjectId) {
    const response = await axios.get(`${this.baseUrl}/subjects/${subjectId}`);
    return response.data;
  },

  // ============================================
  // TOPICS & QUESTIONS (subject-aware)
  // ============================================

  async getSubjectTopics(subjectId) {
    const response = await axios.get(`${this.baseUrl}/subjects/${subjectId}/topics`);
    return response.data;
  },

  async getSubjectQuestions(subjectId, topic) {
    const response = await axios.get(`${this.baseUrl}/subjects/${subjectId}/questions/${topic}`);
    return response.data;
  },

  async getSubjectRandomQuestion(subjectId, topic) {
    const response = await axios.get(`${this.baseUrl}/subjects/${subjectId}/questions/${topic}/random`);
    return response.data;
  },

  async getSubjectNextQuestion(subjectId, topic) {
    const response = await axios.get(`${this.baseUrl}/subjects/${subjectId}/questions/${topic}/next`);
    return response.data;
  },

  async getSubjectQuestion(subjectId, questionId) {
    const response = await axios.get(`${this.baseUrl}/subjects/${subjectId}/question/${questionId}`);
    return response.data;
  },

  // ============================================
  // LEGACY (compatibilidad)
  // ============================================

  async getTopics() {
    // Redirigir a BDA por defecto
    return this.getSubjectTopics('bda');
  },

  async getQuestions(topic) {
    return this.getSubjectQuestions('bda', topic);
  },

  // ... resto de metodos existentes (solve, attempts, stats)
};

export default api;
```

---

## 6. Routing Principal

### src/App.jsx

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './shared/Layout';
import SubjectSelector from './subjects/SubjectSelector';
import SubjectDashboard from './subjects/SubjectDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Pagina principal: selector de asignaturas */}
          <Route index element={<SubjectSelector />} />

          {/* Dashboard por asignatura con rutas anidadas */}
          <Route path="subjects/:subjectId/*" element={<SubjectDashboard />} />

          {/* Compatibilidad: rutas antiguas redirigen a BDA */}
          <Route path="topics" element={<Navigate to="/subjects/bda" replace />} />
          <Route path="topic/:topic" element={<RedirectToBDA />} />
          <Route path="topic/:topic/question/:id" element={<RedirectToBDA />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Helper para redirecciones con parametros
function RedirectToBDA() {
  const location = window.location.pathname;
  const newPath = location.replace('/topic/', '/subjects/bda/topic/');
  return <Navigate to={newPath} replace />;
}

export default App;
```

---

## 7. Tests

### tests/backend/questionsSubject.test.js

```javascript
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import questionsRouter from '../../server/routes/questions.js';
import * as db from '../../server/database.js';

jest.mock('../../server/database.js');

describe('Subject-aware Questions API', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', questionsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/subjects/:subjectId/topics', () => {
    it('should return topics for valid subject', async () => {
      db.getSubjectById.mockReturnValue({ id: 'bda', name: 'BDA' });
      db.getAllTopicsFromQuestions.mockReturnValue(['Tema1', 'Tema2']);
      db.countQuestionsByTopic.mockReturnValue(10);

      const res = await request(app).get('/api/subjects/bda/topics');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.topics).toHaveLength(2);
      expect(res.body.topics[0].questionCount).toBe(10);
    });

    it('should return 404 for invalid subject', async () => {
      db.getSubjectById.mockReturnValue(null);

      const res = await request(app).get('/api/subjects/invalid/topics');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/subjects/:subjectId/questions/:topic', () => {
    it('should return questions for topic', async () => {
      db.getSubjectById.mockReturnValue({ id: 'bda', name: 'BDA' });
      db.getQuestionsByTopic.mockReturnValue([
        { id: 'q1', content: 'Question 1', options: { a: 'A', b: 'B' } },
        { id: 'q2', content: 'Question 2', options: { a: 'A', b: 'B' } }
      ]);

      const res = await request(app).get('/api/subjects/bda/questions/Tema1');

      expect(res.status).toBe(200);
      expect(res.body.questions).toHaveLength(2);
      expect(db.getQuestionsByTopic).toHaveBeenCalledWith('Tema1', 'bda');
    });
  });

  describe('GET /api/subjects/:subjectId/questions/:topic/random', () => {
    it('should return random question', async () => {
      db.getRandomQuestion.mockReturnValue({
        id: 'q1',
        content: 'Random question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });

      const res = await request(app).get('/api/subjects/bda/questions/Tema1/random');

      expect(res.status).toBe(200);
      expect(res.body.question).toBeDefined();
      expect(db.getRandomQuestion).toHaveBeenCalledWith('Tema1', 'bda');
    });

    it('should return 404 when no questions', async () => {
      db.getRandomQuestion.mockReturnValue(null);

      const res = await request(app).get('/api/subjects/bda/questions/Empty/random');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/subjects/:subjectId/questions/:topic/next', () => {
    it('should return next unanswered question', async () => {
      db.getNextUnansweredQuestion.mockReturnValue({
        id: 'q3',
        content: 'Next question',
        options: {}
      });

      const res = await request(app).get('/api/subjects/bda/questions/Tema1/next');

      expect(res.status).toBe(200);
      expect(res.body.question.id).toBe('q3');
    });

    it('should fallback to random when all answered', async () => {
      db.getNextUnansweredQuestion.mockReturnValue(null);
      db.getRandomQuestion.mockReturnValue({
        id: 'q1',
        content: 'Random fallback',
        options: {}
      });

      const res = await request(app).get('/api/subjects/bda/questions/Tema1/next');

      expect(res.status).toBe(200);
      expect(db.getRandomQuestion).toHaveBeenCalled();
    });
  });

  describe('Legacy endpoints', () => {
    it('GET /api/topics should work for BDA', async () => {
      db.getAllTopicsFromQuestions.mockReturnValue(['Tema1']);
      db.countQuestionsByTopic.mockReturnValue(5);

      const res = await request(app).get('/api/topics');

      expect(res.status).toBe(200);
      expect(db.getAllTopicsFromQuestions).toHaveBeenCalledWith('bda');
    });

    it('GET /api/questions/:topic should work for BDA', async () => {
      db.getQuestionsByTopic.mockReturnValue([]);

      const res = await request(app).get('/api/questions/Tema1');

      expect(res.status).toBe(200);
      expect(db.getQuestionsByTopic).toHaveBeenCalledWith('Tema1', 'bda');
    });
  });
});
```

### tests/frontend/SubjectDashboard.test.jsx

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SubjectDashboard from '../../src/subjects/SubjectDashboard';
import api from '../../src/shared/api';

jest.mock('../../src/shared/api');

const renderWithRouter = (subjectId = 'bda') => {
  return render(
    <MemoryRouter initialEntries={[`/subjects/${subjectId}`]}>
      <Routes>
        <Route path="/subjects/:subjectId/*" element={<SubjectDashboard />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('SubjectDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render subject header', async () => {
    api.getSubject.mockResolvedValue({
      subject: { id: 'bda', name: 'Bases de Datos Avanzadas', short_name: 'BDA' }
    });
    api.getSubjectTopics.mockResolvedValue({ topics: [] });

    renderWithRouter('bda');

    await waitFor(() => {
      expect(screen.getByText('Bases de Datos Avanzadas')).toBeInTheDocument();
      expect(screen.getByText('BDA')).toBeInTheDocument();
    });
  });

  it('should show loading state', () => {
    api.getSubject.mockReturnValue(new Promise(() => {}));

    renderWithRouter('bda');

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it('should show error for invalid subject', async () => {
    api.getSubject.mockRejectedValue(new Error('Not found'));

    renderWithRouter('invalid');

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

---

## 8. Criterios de Aceptacion

### Tests que deben pasar

```bash
# Backend
npm test -- --testPathPattern=questionsSubject.test.js

# Frontend
npm test -- --testPathPattern=SubjectDashboard.test.jsx
```

### Validacion Manual

- [ ] `/` muestra selector de asignaturas con BDA
- [ ] `/subjects/bda` muestra dashboard con temas
- [ ] `/subjects/bda/topic/Tema1` muestra preguntas
- [ ] Navegacion con flechas funciona
- [ ] Atajos de teclado funcionan
- [ ] `/topics` redirige a `/subjects/bda`
- [ ] `/api/topics` sigue funcionando (legacy)

### Flujo E2E

1. Navegar a `/`
2. Click en BDA
3. Click en Tema1
4. Ver pregunta 1
5. Seleccionar opcion
6. Click "Comprobar"
7. Ver respuesta de Claude
8. Navegar a pregunta 2

---

## 9. Archivos a Crear/Modificar

### Crear

| Archivo | Lineas Aprox |
|---------|--------------|
| `src/subjects/SubjectDashboard.jsx` | 80 |
| `src/subjects/SubjectDashboard.css` | 40 |
| `tests/backend/questionsSubject.test.js` | 150 |
| `tests/frontend/SubjectDashboard.test.jsx` | 60 |

### Modificar

| Archivo | Cambios |
|---------|---------|
| `server/db/schema.sql` | +5 lineas (subject_id en questions) |
| `server/database.js` | ~100 lineas (modificar funciones existentes) |
| `server/routes/questions.js` | +100 lineas (nuevas rutas) |
| `src/shared/api.js` | +30 lineas (nuevos endpoints) |
| `src/questions/TopicSelector.jsx` | ~30 lineas (subject-aware) |
| `src/questions/QuestionList.jsx` | ~20 lineas (subject-aware) |
| `src/App.jsx` | ~20 lineas (nuevas rutas) |

---

## 10. Siguiente Fase

Una vez completada esta fase, el flujo completo de examen funciona para BDA.
La siguiente es **FASE_2_DELIVERABLE_UPLOAD.md** que permite subir entregables para DS.
