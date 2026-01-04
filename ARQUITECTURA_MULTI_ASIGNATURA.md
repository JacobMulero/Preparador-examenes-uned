# Arquitectura Multi-Asignatura - Study Platform

> Documento de diseno para extension futura de exam-app

---

## Arquitectura Actual de Tests

### Estructura

```
tests/
├── __mocks__/
│   └── styleMock.js                       # Mock CSS imports
├── backend/                               # Tests del servidor (Jest + Supertest)
│   ├── api.test.js                        # Tests de endpoints API
│   ├── claudeService.test.js              # Unit tests del servicio Claude
│   ├── claudeService.integration.test.js  # Integration tests con Claude real
│   ├── database.test.js                   # Tests de helpers SQLite
│   ├── errorHandlers.test.js              # Tests de error handlers en rutas
│   ├── fallbackDir.test.js                # Tests de FALLBACK_DIR branch
│   ├── initializeDatabase.test.js         # Tests de inicializacion DB
│   ├── questionParser.test.js             # Tests del parser Markdown
│   ├── routes.test.js                     # Tests exhaustivos de todas las rutas
│   └── solving.integration.test.js        # Integration tests de solving
├── frontend/                              # Tests React (Jest + Testing Library)
│   ├── AnswerPanel.test.jsx
│   ├── ProgressBar.test.jsx
│   ├── SolveButton.test.jsx
│   └── StatsPanel.test.jsx
├── integration.test.js                    # Tests E2E del flujo completo
├── setup.js                               # Setup backend (silencia console)
└── setup-frontend.js                      # Setup frontend (mocks DOM)
```

### Configuracion Jest (jest.config.js)

```javascript
export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/backend/**/*.test.js'],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/index.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 98,
      statements: 98
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000
};
```

### Scripts npm

```bash
npm test                # Ejecutar todos los tests
npm run test:backend    # Solo tests backend
npm run test:frontend   # Solo tests frontend
npm run test:coverage   # Tests con reporte de cobertura
npm run test:watch      # Modo watch
```

### Dependencias de Testing

```json
{
  "devDependencies": {
    "jest": "^30.2.0",
    "jest-environment-jsdom": "^30.2.0",
    "supertest": "^7.1.4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.1",
    "babel-jest": "^30.2.0"
  }
}
```

### Cobertura Actual

| Metrica | Threshold | Actual |
|---------|-----------|--------|
| Statements | 98% | ~99% |
| Branches | 90% | ~92% |
| Functions | 95% | ~97% |
| Lines | 98% | ~99% |

### Patrones de Testing Usados

1. **Mocking ES Modules**: `jest.unstable_mockModule()` antes de imports
2. **Supertest**: Para tests de endpoints HTTP
3. **Fixtures**: Archivos temporales en `tests/fixtures/`
4. **Spies**: `jest.spyOn()` para verificar llamadas

---

## Resumen Ejecutivo

Extension de exam-app para soportar multiples asignaturas con dos metodologias de estudio:

| Asignatura | ID | Metodologia | Estado |
|------------|-----|-------------|--------|
| Bases de Datos Avanzadas | `bda` | Test (preguntas Markdown) | Implementado |
| Fundamentos Fisicos de la Informatica | `ffi` | Test / Practica | Pendiente |
| Diseno de Software | `ds` | Practica (entregables) | Pendiente |

### Metodologias

1. **Tipo Test**: Preguntas predefinidas en Markdown (como BDA actual)
2. **Tipo Practica**:
   - PDFs de examenes anteriores -> Claude Vision -> Markdown
   - Entregable del alumno (codigo + docs) -> Analisis Claude -> Preguntas personalizadas

---

## Estructura de Carpetas

```
exam-app/
├── subjects/                              # Contenido multi-asignatura
│   ├── bda/                               # Bases de Datos Avanzadas
│   │   ├── config.json                    # Metadata y configuracion
│   │   ├── questions/                     # Preguntas Markdown (symlink a ../Preguntas/)
│   │   │   ├── Preguntas_Tema1.md
│   │   │   └── ...
│   │   └── materials/                     # Materiales de apoyo
│   │
│   ├── ffi/                               # Fundamentos Fisicos de la Informatica
│   │   ├── config.json
│   │   ├── questions/                     # Si tiene preguntas tipo test
│   │   ├── exams/                         # PDFs de examenes anteriores
│   │   │   ├── originals/                 # PDFs sin procesar
│   │   │   ├── images/                    # Paginas extraidas como PNG
│   │   │   └── parsed/                    # Markdown generado por Vision
│   │   └── deliverables/                  # Practicas entregadas
│   │       └── {student_id}/
│   │
│   └── ds/                                # Diseno de Software
│       ├── config.json
│       ├── exams/
│       │   ├── originals/
│       │   ├── images/
│       │   └── parsed/
│       └── deliverables/
│           └── {student_id}/
│               ├── uploads/               # Codigo y docs subidos
│               └── analysis/              # Analisis de Claude
│
├── server/                                # Backend Express (extendido)
│   ├── index.js
│   ├── routes.js
│   ├── database.js                        # Helpers SQLite (extendido)
│   ├── db/
│   │   ├── schema.sql                     # Esquema extendido
│   │   └── study.db
│   │
│   ├── routes/
│   │   ├── subjects.js                    # NUEVO: gestion asignaturas
│   │   ├── questions.js                   # Extendido: subject-aware
│   │   ├── solving.js                     # Extendido: contexto dinamico
│   │   ├── stats.js                       # Extendido: stats por subject
│   │   ├── pipeline.js                    # NUEVO: procesamiento PDFs
│   │   ├── deliverables.js                # NUEVO: gestion entregables
│   │   └── generation.js                  # NUEVO: generacion preguntas
│   │
│   ├── services/
│   │   ├── claudeService.js               # Extendido: contexto dinamico
│   │   ├── visionService.js               # NUEVO: Claude Vision para PDFs
│   │   ├── pdfService.js                  # NUEVO: PDF a imagenes
│   │   ├── questionGenerator.js           # NUEVO: generacion personalizada
│   │   └── deliverableAnalyzer.js         # NUEVO: analisis entregables
│   │
│   └── parsers/
│       ├── questionParser.js              # Existente
│       └── examParser.js                  # NUEVO: normaliza output Vision
│
├── src/                                   # Frontend React (extendido)
│   ├── subjects/                          # NUEVO: Dominio Asignaturas
│   │   ├── SubjectSelector.jsx            # Selector de asignatura
│   │   ├── SubjectCard.jsx                # Card con metodologia
│   │   └── SubjectDashboard.jsx           # Dashboard por asignatura
│   │
│   ├── questions/                         # Existente (reutilizable)
│   │   ├── TopicSelector.jsx              # Modificar: recibe subjectId
│   │   ├── QuestionList.jsx               # Sin cambios
│   │   └── QuestionCard.jsx               # Sin cambios
│   │
│   ├── solving/                           # Existente (reutilizable)
│   │   ├── SolveButton.jsx                # Sin cambios
│   │   └── AnswerPanel.jsx                # Sin cambios
│   │
│   ├── progress/                          # Existente (reutilizable)
│   │   ├── StatsPanel.jsx                 # Modificar: filtro por subject
│   │   ├── ProgressBar.jsx                # Sin cambios
│   │   └── ReviewMode.jsx                 # Sin cambios
│   │
│   ├── pipeline/                          # NUEVO: Dominio Pipeline PDF
│   │   ├── PipelineDashboard.jsx          # Vista admin procesamiento
│   │   ├── PdfUploader.jsx                # Subir PDFs examenes
│   │   ├── ProcessingStatus.jsx           # Estado tiempo real
│   │   ├── ExamPreview.jsx                # Preview paginas
│   │   └── QuestionEditor.jsx             # Editar preguntas parseadas
│   │
│   ├── practice/                          # NUEVO: Dominio Practica
│   │   ├── PracticeSetup.jsx              # Configurar sesion
│   │   ├── DeliverableUploader.jsx        # Subir practica
│   │   ├── AnalysisResults.jsx            # Ver analisis Claude
│   │   ├── GeneratedQuestions.jsx         # Preguntas personalizadas
│   │   └── PersonalizedSession.jsx        # Sesion de estudio
│   │
│   └── shared/
│       ├── api.js                         # Extendido: nuevos endpoints
│       └── Layout.jsx                     # Modificar: nav multi-subject
│
└── package.json
```

---

## Configuracion de Asignatura (config.json)

### Ejemplo BDA (Tipo Test)

```json
{
  "id": "bda",
  "name": "Bases de Datos Avanzadas",
  "shortName": "BDA",
  "description": "Query processing, optimization, transactions, concurrency, recovery",
  "language": "es",
  "methodology": ["test"],
  "topics": [
    { "id": "tema1", "name": "Query Processing", "description": "Cost estimation, sorting, joins" },
    { "id": "tema2", "name": "Query Optimization", "description": "Catalog statistics, equivalence rules" },
    { "id": "tema3", "name": "Transactions", "description": "ACID, serializability" },
    { "id": "tema4", "name": "Concurrency Control", "description": "Locking, 2PL, deadlocks" },
    { "id": "tema5", "name": "Recovery System", "description": "Logging, ARIES, checkpoints" }
  ],
  "claudeContext": {
    "expertise": "database internals, query processing, query optimization, transactions, concurrency control, recovery systems",
    "terminology": ["tupla", "bloque", "reunion", "accesos a disco"]
  }
}
```

### Ejemplo DS (Tipo Practica)

```json
{
  "id": "ds",
  "name": "Diseno de Software",
  "shortName": "DS",
  "description": "Patrones de diseno, arquitectura de software, UML, testing",
  "language": "es",
  "methodology": ["practice"],
  "claudeContext": {
    "expertise": "design patterns, software architecture, UML diagrams, SOLID principles, clean code, testing strategies",
    "terminology": ["patron", "acoplamiento", "cohesion", "refactoring"]
  },
  "practiceConfig": {
    "acceptedFileTypes": [".java", ".py", ".js", ".ts", ".md", ".pdf", ".png", ".jpg"],
    "maxFileSize": "10MB",
    "analysisDepth": "detailed"
  }
}
```

---

## Esquema Base de Datos (SQLite)

```sql
-- =============================================
-- TABLAS CORE (extendidas)
-- =============================================

-- Asignaturas
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,                    -- "bda", "ffi", "ds"
  name TEXT NOT NULL,
  short_name TEXT,
  description TEXT,
  language TEXT DEFAULT 'es',
  methodology TEXT NOT NULL,              -- JSON: ["test"] o ["practice"] o ambos
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

-- Preguntas (extendida con subject_id)
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,               -- NUEVO
  topic_id TEXT,
  question_number INTEGER,
  shared_statement TEXT,
  content TEXT NOT NULL,
  options TEXT NOT NULL,                  -- JSON: {a, b, c, d}
  source_type TEXT DEFAULT 'manual',      -- "manual", "pdf_parsed", "generated"
  source_reference TEXT,
  difficulty TEXT,
  parsed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

-- Intentos (extendida)
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  student_id TEXT,                        -- NUEVO: opcional
  user_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  explanation TEXT,
  session_id TEXT,                        -- NUEVO: agrupar intentos
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- Cache de soluciones (sin cambios)
CREATE TABLE IF NOT EXISTS solutions_cache (
  question_id TEXT PRIMARY KEY,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  wrong_options TEXT,
  solved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- =============================================
-- TABLAS PIPELINE PDF (Tipo Practica)
-- =============================================

-- PDFs de examenes subidos
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

-- Paginas individuales de PDFs
CREATE TABLE IF NOT EXISTS exam_pages (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  image_path TEXT,
  raw_markdown TEXT,                      -- Output directo de Vision
  processed_markdown TEXT,                -- Normalizado
  status TEXT DEFAULT 'pending',
  vision_tokens INTEGER,
  processed_at DATETIME,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE
);

-- Preguntas parseadas (antes de revision)
CREATE TABLE IF NOT EXISTS parsed_questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_id TEXT,
  question_number INTEGER,
  raw_content TEXT NOT NULL,
  normalized_content TEXT,
  options TEXT,
  status TEXT DEFAULT 'pending',          -- pending, reviewed, approved, rejected
  reviewer_notes TEXT,
  reviewed_at DATETIME,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE
);

-- =============================================
-- TABLAS ENTREGABLES Y GENERACION
-- =============================================

-- Entregables de alumnos
CREATE TABLE IF NOT EXISTS deliverables (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  student_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'uploaded',         -- uploaded, analyzing, completed, error
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  analyzed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Archivos dentro de un entregable
CREATE TABLE IF NOT EXISTS deliverable_files (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,                         -- code, document, image, pdf
  language TEXT,                          -- python, java, sql, markdown
  content_preview TEXT,
  analysis_notes TEXT,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE
);

-- Analisis de Claude sobre entregables
CREATE TABLE IF NOT EXISTS deliverable_analysis (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL,            -- strengths, weaknesses, topics, recommendations
  content TEXT NOT NULL,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE
);

-- Sesiones de generacion de preguntas
CREATE TABLE IF NOT EXISTS generation_sessions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  student_id TEXT,
  deliverable_id TEXT,
  exam_ids TEXT,                          -- JSON array
  topic_focus TEXT,                       -- JSON array
  difficulty TEXT DEFAULT 'mixed',
  question_count INTEGER DEFAULT 10,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Preguntas generadas por IA
CREATE TABLE IF NOT EXISTS generated_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_number INTEGER,
  content TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  wrong_explanations TEXT,
  rationale TEXT,                         -- Por que se genero esta pregunta
  based_on TEXT,
  difficulty TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES generation_sessions(id) ON DELETE CASCADE
);

-- =============================================
-- INDICES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_pdfs_subject ON exam_pdfs(subject_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_subject ON deliverables(subject_id);
CREATE INDEX IF NOT EXISTS idx_generated_questions_session ON generated_questions(session_id);
```

---

## Pipeline de Procesamiento PDF

### Flujo

```
1. Upload PDF     2. Extraer paginas     3. Claude Vision     4. Parsear     5. Revisar
   [exam.pdf] ───> [page_001.png] ───────> [raw.md] ─────────> [questions] ──> [approve]
                   [page_002.png]          [raw.md]            [questions]     [reject]
                   [page_N.png]            [raw.md]            [questions]     [edit]
```

### Vision Service (server/services/visionService.js)

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function processExamPage(imagePath, subjectContext) {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: base64Image
          }
        },
        {
          type: "text",
          text: `Analiza esta pagina de examen de ${subjectContext.name}.

Extrae TODAS las preguntas de tipo test en formato Markdown:

## Pregunta N

[Texto completo de la pregunta]

a) [Opcion A]
b) [Opcion B]
c) [Opcion C]
d) [Opcion D]

---

IMPORTANTE:
- Preserva formulas, simbolos y notacion
- Describe tablas/diagramas en texto
- Marca preguntas incompletas con [INCOMPLETO]
- Numera secuencialmente`
        }
      ]
    }]
  });

  return response.content[0].text;
}
```

---

## Generador de Preguntas Personalizadas

### Flujo

```
1. Subir practica    2. Analizar codigo    3. Identificar debilidades    4. Generar preguntas
   [*.java, *.py] ────> [Claude analiza] ───> [areas mejora] ──────────────> [10 preguntas]
   [memoria.pdf]                              [conceptos faltantes]          [personalizadas]
```

### Generator Service (server/services/questionGenerator.js)

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';

export async function generatePersonalizedQuestions(config) {
  const { subjectContext, referenceExams, deliverableAnalysis, count } = config;

  const prompt = `Eres un profesor experto en ${subjectContext.expertise}.

TAREA: Genera ${count} preguntas de examen personalizadas.

${referenceExams ? `ESTILO DE REFERENCIA:
${referenceExams.slice(0, 3).map(q => q.content).join('\n---\n')}` : ''}

${deliverableAnalysis ? `ANALISIS DEL ALUMNO:
- Fortalezas: ${deliverableAnalysis.strengths}
- Debilidades: ${deliverableAnalysis.weaknesses}
- Recomendaciones: ${deliverableAnalysis.recommendations}

IMPORTANTE: Genera preguntas que REFUERCEN las areas debiles.` : ''}

FORMATO JSON:
{
  "questions": [
    {
      "content": "Texto...",
      "options": { "a": "...", "b": "...", "c": "...", "d": "..." },
      "correctAnswer": "b",
      "explanation": "Explicacion detallada...",
      "wrongExplanations": { "a": "...", "c": "...", "d": "..." },
      "rationale": "Por que esta pregunta es relevante...",
      "difficulty": "medium"
    }
  ]
}`;

  const response = query({ prompt, options: { maxTurns: 1 } });
  // ... procesar respuesta ...
}
```

---

## API Endpoints

### Subjects (NUEVO)

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/subjects` | Lista asignaturas |
| GET | `/api/subjects/:id` | Detalle asignatura |
| POST | `/api/subjects` | Crear asignatura |
| PUT | `/api/subjects/:id` | Actualizar |

### Questions (Extendido)

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/subjects/:subjectId/topics` | Temas de asignatura |
| GET | `/api/subjects/:subjectId/questions/:topicId` | Preguntas por tema |
| GET | `/api/subjects/:subjectId/questions/random` | Aleatoria |

### Pipeline (NUEVO)

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/pipeline/upload` | Subir PDF examen |
| GET | `/api/pipeline/exams` | Lista PDFs procesados |
| POST | `/api/pipeline/exams/:id/process` | Iniciar procesamiento |
| GET | `/api/pipeline/exams/:id/questions` | Preguntas parseadas |
| POST | `/api/pipeline/questions/:id/approve` | Aprobar pregunta |

### Deliverables (NUEVO)

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/deliverables` | Subir entregable |
| POST | `/api/deliverables/:id/analyze` | Analizar con Claude |
| GET | `/api/deliverables/:id/analysis` | Resultado analisis |

### Generation (NUEVO)

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/generate/session` | Crear sesion generacion |
| POST | `/api/generate/sessions/:id/start` | Iniciar generacion |
| GET | `/api/generate/sessions/:id/questions` | Preguntas generadas |

---

## Componentes UI Nuevos

### SubjectSelector.jsx
```jsx
// Grid de asignaturas con badges de metodologia
// Click -> SubjectDashboard
```

### SubjectDashboard.jsx
```jsx
// Tabs: "Test Mode" | "Practice Mode"
// Test: TopicSelector existente
// Practice: PracticeSetup o PipelineDashboard (admin)
```

### PipelineDashboard.jsx
```jsx
// Vista admin para procesar PDFs
// - Drag & drop upload
// - Cola de procesamiento
// - Preview paginas + markdown
// - Editor de preguntas
```

### PracticeSetup.jsx
```jsx
// Configurar sesion personalizada:
// 1. Seleccionar examenes de referencia (checkboxes)
// 2. Subir tu practica (DeliverableUploader)
// 3. Elegir numero de preguntas
// 4. "Generar preguntas"
```

---

## Matriz de Reutilizacion

| Componente | Estado | Modificacion |
|------------|--------|--------------|
| QuestionCard.jsx | Reutilizable | Ninguna |
| QuestionList.jsx | Reutilizable | Recibir subjectId en URL |
| AnswerPanel.jsx | Reutilizable | Ninguna |
| SolveButton.jsx | Reutilizable | Ninguna |
| ProgressBar.jsx | Reutilizable | Ninguna |
| StatsPanel.jsx | Modificar | Filtro por subject |
| TopicSelector.jsx | Modificar | Eliminar descripciones hardcodeadas |
| Layout.jsx | Modificar | Nav multi-subject |
| claudeService.js | Extender | Contexto dinamico por subject |
| questionParser.js | Reutilizable | Ninguna |
| database.js | Extender | Helpers con subject_id |

---

## Dependencias Nuevas

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x.x",
    "pdf-lib": "^1.17.1",
    "sharp": "^0.33.x",
    "multer": "^1.4.5-lts.1"
  }
}
```

- `pdf-lib`: Leer PDFs y extraer paginas
- `sharp`: Convertir paginas a PNG de alta calidad
- `multer`: Upload de archivos
- `@anthropic-ai/sdk`: Claude Vision API

---

## Fases de Implementacion

### Fase 1: Fundacion Multi-Subject
- [ ] Extender schema con tablas subjects/topics
- [ ] Crear SubjectSelector y SubjectDashboard
- [ ] Refactorizar rutas para ser subject-aware
- [ ] Migrar BDA como primera asignatura

### Fase 2: Pipeline PDF
- [ ] Implementar pdfService (extraccion paginas)
- [ ] Implementar visionService (Claude Vision)
- [ ] Crear UI de pipeline (upload, status, editor)
- [ ] Workflow de revision y aprobacion

### Fase 3: Analisis Entregables
- [ ] Implementar deliverableAnalyzer
- [ ] UI de upload y visualizacion analisis
- [ ] Almacenamiento de resultados

### Fase 4: Generacion Preguntas
- [ ] Implementar questionGenerator
- [ ] UI de configuracion sesion
- [ ] Integracion con flujo de solving existente

### Fase 5: Polish
- [ ] Optimizacion (caching, batching)
- [ ] Manejo errores robusto
- [ ] Tests de integracion

---

## Archivos Criticos a Modificar

| Archivo | Cambios |
|---------|---------|
| `server/db/schema.sql` | Agregar tablas multi-subject |
| `server/database.js` | Helpers con subject_id |
| `server/routes/questions.js` | Prefijo `/subjects/:subjectId` |
| `server/claudeService.js` | Aceptar subjectContext |
| `src/shared/api.js` | Nuevos endpoints |
| `src/App.jsx` | Rutas multi-subject |
| `src/questions/TopicSelector.jsx` | Recibir config dinamica |

## Archivos Criticos a Crear

| Archivo | Proposito |
|---------|-----------|
| `server/services/visionService.js` | Claude Vision para PDFs |
| `server/services/pdfService.js` | Extraccion paginas PDF |
| `server/services/questionGenerator.js` | Generacion personalizada |
| `server/services/deliverableAnalyzer.js` | Analisis de practicas |
| `server/routes/subjects.js` | CRUD asignaturas |
| `server/routes/pipeline.js` | Procesamiento PDFs |
| `server/routes/deliverables.js` | Gestion entregables |
| `server/routes/generation.js` | Sesiones generacion |
| `src/subjects/SubjectSelector.jsx` | Selector asignaturas |
| `src/subjects/SubjectDashboard.jsx` | Dashboard por asignatura |
| `src/pipeline/*.jsx` | Componentes pipeline |
| `src/practice/*.jsx` | Componentes practica |
