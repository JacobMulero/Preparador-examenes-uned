# FASE 0: Fundacion Multi-Asignatura

> **Objetivo:** Crear la infraestructura base para soportar multiples asignaturas
> **Prerequisitos:** exam-app funcionando con BDA
> **Entregable:** Selector de asignaturas funcional con BDA migrado

---

## Resumen de Cambios

| Componente | Tipo | Descripcion |
|------------|------|-------------|
| `schema.sql` | Modificar | Agregar tablas `subjects`, `topics` |
| `database.js` | Modificar | Nuevos helpers para subjects |
| `routes/subjects.js` | Crear | CRUD de asignaturas |
| `SubjectSelector.jsx` | Crear | Grid de seleccion |
| `SubjectCard.jsx` | Crear | Card por asignatura |
| `subjects.test.js` | Crear | Tests backend |
| `SubjectSelector.test.jsx` | Crear | Tests frontend |

---

## 1. Schema de Base de Datos

### Nuevas Tablas

```sql
-- subjects.sql (agregar a schema.sql)

-- Asignaturas
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

-- Temas/Capitulos por asignatura
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,                    -- "bda_tema1"
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  order_num INTEGER DEFAULT 0,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);
```

### Migracion de Datos

```sql
-- migration_001_subjects.sql

-- Insertar BDA como primera asignatura
INSERT INTO subjects (id, name, short_name, description, language, methodology, exam_type, modes, claude_context, config)
VALUES (
  'bda',
  'Bases de Datos Avanzadas',
  'BDA',
  'Query processing, optimization, transactions, concurrency, recovery',
  'es',
  '["test"]',
  'test',
  '["test"]',
  '{"expertise": "database internals, query processing, query optimization, transactions, concurrency control, recovery systems", "terminology": ["tupla", "bloque", "reunion", "accesos a disco"]}',
  NULL
);

-- Migrar topics existentes (extraer de los archivos Preguntas_TemaX.md)
INSERT INTO topics (id, subject_id, name, description, order_num) VALUES
  ('bda_tema1', 'bda', 'Query Processing', 'Cost estimation, sorting, join algorithms', 1),
  ('bda_tema2', 'bda', 'Query Optimization', 'Catalog statistics, equivalence rules', 2),
  ('bda_tema3', 'bda', 'Transactions', 'ACID, serializability, schedules', 3),
  ('bda_tema4', 'bda', 'Concurrency Control', 'Locking, 2PL, deadlocks', 4),
  ('bda_tema5', 'bda', 'Recovery System', 'Logging, ARIES, checkpoints', 5),
  ('bda_tema6', 'bda', 'Tema 6', 'Contenido adicional', 6),
  ('bda_tema7', 'bda', 'Tema 7', 'Contenido adicional', 7),
  ('bda_sintema', 'bda', 'Sin Tema', 'Preguntas generales', 99);
```

---

## 2. Database Helpers

### Nuevas Funciones en database.js

```javascript
// server/database.js - AGREGAR

// ============================================
// SUBJECTS
// ============================================

export function getAllSubjects() {
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

export function getSubjectById(subjectId) {
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

export function createSubject(subject) {
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

export function updateSubject(subjectId, updates) {
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
// TOPICS (por asignatura)
// ============================================

export function getTopicsBySubject(subjectId) {
  const stmt = db.prepare(`
    SELECT id, name, description, order_num
    FROM topics
    WHERE subject_id = ?
    ORDER BY order_num
  `);
  return stmt.all(subjectId);
}

export function createTopic(topic) {
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

export function getTopic(topicId) {
  const stmt = db.prepare('SELECT * FROM topics WHERE id = ?');
  return stmt.get(topicId);
}
```

---

## 3. API Routes

### server/routes/subjects.js

```javascript
import express from 'express';
import {
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  getTopicsBySubject
} from '../database.js';

const router = express.Router();

/**
 * GET /api/subjects
 * Lista todas las asignaturas
 */
router.get('/', (req, res) => {
  try {
    const subjects = getAllSubjects();
    res.json({
      success: true,
      subjects
    });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener asignaturas'
    });
  }
});

/**
 * GET /api/subjects/:id
 * Detalle de una asignatura
 */
router.get('/:id', (req, res) => {
  try {
    const subject = getSubjectById(req.params.id);

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    res.json({
      success: true,
      subject
    });
  } catch (error) {
    console.error('Error fetching subject:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener asignatura'
    });
  }
});

/**
 * POST /api/subjects
 * Crear nueva asignatura
 */
router.post('/', (req, res) => {
  try {
    const { id, name, shortName, description, methodology, examType, modes, claudeContext } = req.body;

    if (!id || !name || !methodology || !modes) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: id, name, methodology, modes'
      });
    }

    // Verificar que no existe
    const existing = getSubjectById(id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Ya existe una asignatura con ese ID'
      });
    }

    const subject = createSubject({
      id,
      name,
      shortName,
      description,
      methodology,
      examType,
      modes,
      claudeContext
    });

    res.status(201).json({
      success: true,
      subject
    });
  } catch (error) {
    console.error('Error creating subject:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear asignatura'
    });
  }
});

/**
 * PUT /api/subjects/:id
 * Actualizar asignatura
 */
router.put('/:id', (req, res) => {
  try {
    const existing = getSubjectById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    const subject = updateSubject(req.params.id, req.body);

    res.json({
      success: true,
      subject
    });
  } catch (error) {
    console.error('Error updating subject:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar asignatura'
    });
  }
});

/**
 * GET /api/subjects/:id/topics
 * Temas de una asignatura
 */
router.get('/:id/topics', (req, res) => {
  try {
    const subject = getSubjectById(req.params.id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    const topics = getTopicsBySubject(req.params.id);

    res.json({
      success: true,
      subject: {
        id: subject.id,
        name: subject.name
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

export default router;
```

### Registrar en routes.js

```javascript
// server/routes.js - MODIFICAR
import subjectsRouter from './routes/subjects.js';

// En registerRoutes():
app.use('/api/subjects', subjectsRouter);
```

---

## 4. Componentes Frontend

### src/subjects/SubjectSelector.jsx

```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SubjectCard from './SubjectCard';
import api from '../shared/api';
import './SubjectSelector.css';

function SubjectSelector() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const data = await api.getSubjects();
        setSubjects(data.subjects);
      } catch (err) {
        setError('Error al cargar asignaturas');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubjects();
  }, []);

  if (loading) {
    return <div className="subject-selector loading">Cargando asignaturas...</div>;
  }

  if (error) {
    return <div className="subject-selector error">{error}</div>;
  }

  return (
    <div className="subject-selector">
      <h1>Selecciona una Asignatura</h1>

      <div className="subjects-grid">
        {subjects.map(subject => (
          <SubjectCard key={subject.id} subject={subject} />
        ))}
      </div>

      {subjects.length === 0 && (
        <p className="no-subjects">No hay asignaturas disponibles</p>
      )}
    </div>
  );
}

export default SubjectSelector;
```

### src/subjects/SubjectCard.jsx

```jsx
import { Link } from 'react-router-dom';
import './SubjectCard.css';

function SubjectCard({ subject }) {
  const methodologyLabels = {
    test: 'Tipo Test',
    practice: 'Practica'
  };

  const modeLabels = {
    test: { icon: '📝', label: 'Test' },
    verification: { icon: '✅', label: 'Verificacion' }
  };

  return (
    <Link to={`/subjects/${subject.id}`} className="subject-card">
      <div className="subject-header">
        <span className="subject-short">{subject.short_name || subject.id.toUpperCase()}</span>
        <h2>{subject.name}</h2>
      </div>

      {subject.description && (
        <p className="subject-description">{subject.description}</p>
      )}

      <div className="subject-badges">
        {subject.methodology.map(m => (
          <span key={m} className="badge methodology">
            {methodologyLabels[m] || m}
          </span>
        ))}
      </div>

      <div className="subject-modes">
        <span className="modes-label">Modos disponibles:</span>
        <div className="modes-list">
          {subject.modes.map(mode => (
            <span key={mode} className="mode-badge">
              {modeLabels[mode]?.icon} {modeLabels[mode]?.label || mode}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export default SubjectCard;
```

### src/subjects/SubjectSelector.css

```css
.subject-selector {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.subject-selector h1 {
  text-align: center;
  margin-bottom: 2rem;
  color: #333;
}

.subjects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.subject-selector.loading,
.subject-selector.error {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.no-subjects {
  text-align: center;
  color: #666;
  grid-column: 1 / -1;
}
```

### src/subjects/SubjectCard.css

```css
.subject-card {
  display: block;
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s, box-shadow 0.2s;
}

.subject-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.subject-header {
  margin-bottom: 1rem;
}

.subject-short {
  display: inline-block;
  background: #4a90d9;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.subject-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #333;
}

.subject-description {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  line-height: 1.4;
}

.subject-badges {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge.methodology {
  background: #e8f4fd;
  color: #4a90d9;
}

.subject-modes {
  border-top: 1px solid #eee;
  padding-top: 1rem;
}

.modes-label {
  display: block;
  font-size: 0.75rem;
  color: #999;
  margin-bottom: 0.5rem;
}

.modes-list {
  display: flex;
  gap: 0.5rem;
}

.mode-badge {
  background: #f0f0f0;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
}
```

---

## 5. API Client

### src/shared/api.js - Agregar

```javascript
// AGREGAR a api.js

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

async getSubjectTopics(subjectId) {
  const response = await axios.get(`${this.baseUrl}/subjects/${subjectId}/topics`);
  return response.data;
},

async createSubject(subject) {
  const response = await axios.post(`${this.baseUrl}/subjects`, subject);
  return response.data;
},

async updateSubject(subjectId, updates) {
  const response = await axios.put(`${this.baseUrl}/subjects/${subjectId}`, updates);
  return response.data;
},
```

---

## 6. Routing

### src/App.jsx - Modificar

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './shared/Layout';
import SubjectSelector from './subjects/SubjectSelector';
// ... otros imports existentes

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Nueva ruta principal: selector de asignaturas */}
          <Route index element={<SubjectSelector />} />

          {/* Rutas por asignatura (fase siguiente) */}
          <Route path="subjects/:subjectId/*" element={<SubjectRoutes />} />

          {/* Compatibilidad: redirigir rutas antiguas a BDA */}
          <Route path="topics" element={<Navigate to="/subjects/bda" replace />} />
          <Route path="topic/:topic/*" element={<Navigate to="/subjects/bda" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Placeholder para rutas de asignatura (se implementa en Fase 1)
function SubjectRoutes() {
  return <div>Subject Dashboard - Fase 1</div>;
}

export default App;
```

---

## 7. Tests

### tests/backend/subjects.test.js

```javascript
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import subjectsRouter from '../../server/routes/subjects.js';
import * as db from '../../server/database.js';

// Mock database
jest.mock('../../server/database.js');

describe('Subjects API', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/subjects', subjectsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/subjects', () => {
    it('should return list of subjects', async () => {
      db.getAllSubjects.mockReturnValue([
        { id: 'bda', name: 'Bases de Datos', methodology: ['test'], modes: ['test'] },
        { id: 'ds', name: 'Diseno Software', methodology: ['practice'], modes: ['test', 'verification'] }
      ]);

      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subjects).toHaveLength(2);
      expect(res.body.subjects[0].id).toBe('bda');
    });

    it('should return empty array when no subjects', async () => {
      db.getAllSubjects.mockReturnValue([]);

      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);
      expect(res.body.subjects).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      db.getAllSubjects.mockImplementation(() => {
        throw new Error('DB error');
      });

      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/subjects/:id', () => {
    it('should return subject details', async () => {
      db.getSubjectById.mockReturnValue({
        id: 'bda',
        name: 'Bases de Datos Avanzadas',
        methodology: ['test'],
        modes: ['test'],
        claudeContext: { expertise: 'databases' }
      });

      const res = await request(app).get('/api/subjects/bda');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subject.id).toBe('bda');
      expect(res.body.subject.claudeContext).toBeDefined();
    });

    it('should return 404 for non-existent subject', async () => {
      db.getSubjectById.mockReturnValue(null);

      const res = await request(app).get('/api/subjects/xyz');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/subjects', () => {
    it('should create new subject', async () => {
      db.getSubjectById.mockReturnValue(null); // No existe
      db.createSubject.mockReturnValue({
        id: 'ffi',
        name: 'Fundamentos Fisicos',
        methodology: ['test'],
        modes: ['test']
      });

      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: 'ffi',
          name: 'Fundamentos Fisicos',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.subject.id).toBe('ffi');
    });

    it('should reject duplicate subject', async () => {
      db.getSubjectById.mockReturnValue({ id: 'bda' }); // Ya existe

      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: 'bda',
          name: 'Bases de Datos',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({ id: 'test' }); // Falta name, methodology, modes

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/subjects/:id', () => {
    it('should update subject', async () => {
      db.getSubjectById.mockReturnValue({ id: 'bda', name: 'Old Name' });
      db.updateSubject.mockReturnValue({ id: 'bda', name: 'New Name' });

      const res = await request(app)
        .put('/api/subjects/bda')
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.subject.name).toBe('New Name');
    });

    it('should return 404 for non-existent subject', async () => {
      db.getSubjectById.mockReturnValue(null);

      const res = await request(app)
        .put('/api/subjects/xyz')
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/subjects/:id/topics', () => {
    it('should return topics for subject', async () => {
      db.getSubjectById.mockReturnValue({ id: 'bda', name: 'BDA' });
      db.getTopicsBySubject.mockReturnValue([
        { id: 'bda_tema1', name: 'Query Processing', order_num: 1 },
        { id: 'bda_tema2', name: 'Optimization', order_num: 2 }
      ]);

      const res = await request(app).get('/api/subjects/bda/topics');

      expect(res.status).toBe(200);
      expect(res.body.topics).toHaveLength(2);
      expect(res.body.subject.id).toBe('bda');
    });

    it('should return 404 for non-existent subject', async () => {
      db.getSubjectById.mockReturnValue(null);

      const res = await request(app).get('/api/subjects/xyz/topics');

      expect(res.status).toBe(404);
    });
  });
});
```

### tests/frontend/SubjectSelector.test.jsx

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SubjectSelector from '../../src/subjects/SubjectSelector';
import api from '../../src/shared/api';

jest.mock('../../src/shared/api');

const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('SubjectSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading state initially', () => {
    api.getSubjects.mockReturnValue(new Promise(() => {})); // Never resolves

    renderWithRouter(<SubjectSelector />);

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it('should render subjects grid', async () => {
    api.getSubjects.mockResolvedValue({
      subjects: [
        { id: 'bda', name: 'Bases de Datos', short_name: 'BDA', methodology: ['test'], modes: ['test'] },
        { id: 'ds', name: 'Diseno Software', short_name: 'DS', methodology: ['practice'], modes: ['test', 'verification'] }
      ]
    });

    renderWithRouter(<SubjectSelector />);

    await waitFor(() => {
      expect(screen.getByText('Bases de Datos')).toBeInTheDocument();
      expect(screen.getByText('Diseno Software')).toBeInTheDocument();
    });
  });

  it('should show error message on API failure', async () => {
    api.getSubjects.mockRejectedValue(new Error('Network error'));

    renderWithRouter(<SubjectSelector />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  it('should show empty state when no subjects', async () => {
    api.getSubjects.mockResolvedValue({ subjects: [] });

    renderWithRouter(<SubjectSelector />);

    await waitFor(() => {
      expect(screen.getByText(/no hay asignaturas/i)).toBeInTheDocument();
    });
  });

  it('should link to subject page', async () => {
    api.getSubjects.mockResolvedValue({
      subjects: [
        { id: 'bda', name: 'BDA', methodology: ['test'], modes: ['test'] }
      ]
    });

    renderWithRouter(<SubjectSelector />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /bda/i });
      expect(link).toHaveAttribute('href', '/subjects/bda');
    });
  });
});
```

---

## 8. Criterios de Aceptacion

### Tests que deben pasar

```bash
# Backend
npm test -- --testPathPattern=subjects.test.js

# Frontend
npm test -- --testPathPattern=SubjectSelector.test.jsx
```

### Validacion Manual

- [ ] `GET /api/subjects` devuelve lista con BDA
- [ ] `GET /api/subjects/bda` devuelve detalles completos
- [ ] `GET /api/subjects/bda/topics` devuelve 8 topics (Tema1-7 + SinTema)
- [ ] UI muestra grid de asignaturas
- [ ] Click en BDA navega a `/subjects/bda`
- [ ] Redirect de `/topics` a `/subjects/bda` funciona

### Cobertura Minima

| Archivo | Lines | Branches |
|---------|-------|----------|
| routes/subjects.js | 95% | 90% |
| database.js (nuevas funciones) | 95% | 85% |

---

## 9. Archivos a Crear/Modificar

### Crear

| Archivo | Lineas Aprox |
|---------|--------------|
| `server/routes/subjects.js` | 120 |
| `src/subjects/SubjectSelector.jsx` | 50 |
| `src/subjects/SubjectCard.jsx` | 60 |
| `src/subjects/SubjectSelector.css` | 30 |
| `src/subjects/SubjectCard.css` | 80 |
| `tests/backend/subjects.test.js` | 150 |
| `tests/frontend/SubjectSelector.test.jsx` | 80 |

### Modificar

| Archivo | Cambios |
|---------|---------|
| `server/db/schema.sql` | +30 lineas (tablas subjects, topics) |
| `server/database.js` | +80 lineas (helpers subjects) |
| `server/routes.js` | +2 lineas (import + use) |
| `src/shared/api.js` | +25 lineas (endpoints subjects) |
| `src/App.jsx` | +15 lineas (rutas subjects) |

---

## 10. Siguiente Fase

Una vez completada esta fase, se puede proceder a **FASE_1_SUBJECT_AWARE_QUESTIONS.md** que hace que las preguntas sean conscientes de la asignatura.
