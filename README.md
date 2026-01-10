# Exam App

Aplicacion web para practicar preguntas de examen con resolucion IA, pipeline de PDFs, generacion de tests y verificacion oral.

## Caracteristicas

| Feature | Descripcion |
|---------|-------------|
| **Multi-asignatura** | Soporte para BDA, DS, FFI con modos personalizados |
| **Resolucion IA** | Claude analiza y explica cada respuesta |
| **Pipeline PDF** | Sube PDFs, extrae con Vision, aprueba preguntas |
| **Generacion Tests** | Genera variaciones de preguntas con IA |
| **Verificacion Oral** | Preguntas abiertas para verificar autoria |
| **Progreso** | Estadisticas, preguntas falladas, historial |
| **Teclado** | `←/→` navegar, `a/b/c/d` responder, `Enter` comprobar |

## Stack

```
Frontend: React 18 + Vite + React Router + Axios
Backend:  Express + better-sqlite3 + Claude Agent SDK
Testing:  Jest + Testing Library + Supertest
```

## Quick Start

```bash
npm install
npm run dev     # Backend :3001 + Frontend :5173
```

## Arquitectura

```
exam-app/
├── server/
│   ├── index.js                 # Express server
│   ├── routes.js                # Route dispatcher
│   ├── database.js              # SQLite helpers
│   ├── claudeService.js         # Claude solving
│   ├── questionParser.js        # Markdown parser
│   ├── routes/
│   │   ├── questions.js         # /api/questions/*
│   │   ├── solving.js           # /api/solve/*
│   │   ├── stats.js             # /api/stats/*
│   │   ├── subjects.js          # /api/subjects/*
│   │   ├── pipeline.js          # /api/pipeline/*
│   │   ├── generation.js        # /api/generate/*
│   │   └── verification.js      # /api/verification/*
│   ├── services/
│   │   ├── pdfService.js        # PDF extraction
│   │   ├── visionService.js     # Claude Vision OCR
│   │   ├── questionGenerator.js # Test generation
│   │   └── verificationGenerator.js
│   └── db/
│       └── schema.sql           # Database schema
│
├── src/
│   ├── App.jsx                  # Router
│   ├── shared/api.js            # API client
│   ├── subjects/                # Multi-subject UI
│   ├── questions/               # Question practice
│   ├── solving/                 # Answer display
│   ├── progress/                # Stats & review
│   ├── pipeline/                # PDF upload UI
│   ├── practice/                # Generated tests
│   └── verification/            # Oral verification
│
├── tests/backend/               # 20+ test files
├── data/                        # -> ../Preguntas/
└── subjects/                    # Uploaded PDFs & images
```

## NPM Scripts

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Backend + Frontend concurrente |
| `npm run server` | Solo backend (:3001) |
| `npm run client` | Solo frontend (:5173) |
| `npm run build` | Build produccion |
| `npm test` | Todos los tests |
| `npm run test:backend` | Tests backend |
| `npm run test:coverage` | Coverage report |

## API Reference

### Subjects

```
GET    /api/subjects                    Lista asignaturas
GET    /api/subjects/:id                Detalle asignatura
POST   /api/subjects                    Crear asignatura
PUT    /api/subjects/:id                Actualizar
GET    /api/subjects/:id/topics         Topics de asignatura
```

### Questions

```
GET    /api/topics                      Lista topics
GET    /api/questions/:topic            Preguntas de topic
GET    /api/questions/:topic/random     Pregunta aleatoria
GET    /api/questions/:topic/next       Siguiente sin responder
GET    /api/question/:id                Pregunta por ID

# Subject-aware
GET    /api/subjects/:subjectId/questions/:topic
GET    /api/subjects/:subjectId/questions/:topic/random
GET    /api/subjects/:subjectId/questions/:topic/next
```

### Solving (Claude AI)

```
POST   /api/solve                       Resolver con Claude
       Body: { questionId, questionText }
       Response: { answer, explanation, wrongOptions }

POST   /api/solve/batch                 Resolver multiples (max 10)
GET    /api/solve/:questionId           Solucion cacheada
DELETE /api/solve/:questionId           Limpiar cache
```

### Progress & Stats

```
GET    /api/stats                       Stats globales
GET    /api/stats/:topic                Stats por topic
GET    /api/stats/summary/all           Resumen completo
POST   /api/attempts                    Registrar intento
GET    /api/progress/failed             Preguntas falladas
GET    /api/progress/unanswered         Sin responder
GET    /api/progress/history            Historial
DELETE /api/progress/reset?confirm=yes  Reset progreso
```

### Pipeline (PDF Processing)

```
POST   /api/pipeline/upload             Subir PDF (FormData)
GET    /api/pipeline/exams              Listar examenes
GET    /api/pipeline/exams/:id          Detalle examen
DELETE /api/pipeline/exams/:id          Eliminar examen
POST   /api/pipeline/exams/:id/extract  Extraer paginas
POST   /api/pipeline/exams/:id/process  Procesar con Vision
GET    /api/pipeline/exams/:id/questions  Preguntas extraidas
POST   /api/pipeline/questions/:id/approve  Aprobar
POST   /api/pipeline/questions/:id/reject   Rechazar
POST   /api/pipeline/exams/:id/approve-all  Aprobar todas
```

### Generation (AI Test Generation)

```
POST   /api/generate/test-session       Crear sesion
       Body: { subjectId, topicFocus?, difficulty?, questionCount? }
POST   /api/generate/sessions/:id/start Iniciar generacion
GET    /api/generate/sessions/:id       Detalle sesion
GET    /api/generate/sessions/:id/questions  Preguntas generadas
POST   /api/generate/sessions/:id/attempt    Registrar respuesta
GET    /api/generate/sessions/:id/stats      Stats sesion
```

### Verification (Oral Exams)

```
POST   /api/verification/sessions       Crear sesion
       Body: { subjectId, studentName?, focusAreas?, questionCount? }
GET    /api/verification/sessions       Listar sesiones
GET    /api/verification/sessions/:id   Detalle con preguntas
POST   /api/verification/sessions/:id/generate  Generar preguntas
POST   /api/verification/sessions/:id/start     Iniciar
POST   /api/verification/sessions/:id/complete  Completar
POST   /api/verification/questions/:id/score    Puntuar (0-10)
```

## Database Schema

### Core Tables

```sql
subjects        -- Asignaturas (id, name, methodology, modes, claude_context)
topics          -- Temas (id, subject_id, name, order_num)
questions       -- Preguntas parseadas (id, subject_id, topic, content, options)
attempts        -- Intentos usuario (question_id, user_answer, is_correct)
solutions_cache -- Cache Claude (question_id, answer, explanation, wrong_options)
```

### Pipeline Tables

```sql
exam_pdfs         -- PDFs subidos (subject_id, filename, page_count, status)
exam_pages        -- Paginas extraidas (exam_id, page_number, image_path, markdown)
parsed_questions  -- Preguntas OCR (exam_id, page_id, content, options, status)
```

### Generation Tables

```sql
generation_sessions       -- Sesiones generacion (subject_id, difficulty, status)
generated_test_questions  -- Preguntas IA (session_id, content, correct_answer)
generated_question_attempts
```

### Verification Tables

```sql
verification_sessions   -- Sesiones orales (subject_id, student_name, score, status)
verification_questions  -- Preguntas abiertas (session_id, content, expected_answer, score)
```

## Asignaturas Soportadas

| Asignatura | Modo | Descripcion |
|------------|------|-------------|
| **BDA** | test | Bases de Datos Avanzadas - preguntas tipo test |
| **DS** | verification | Diseno Software - verificacion oral de entregas |
| **FFI** | verification | Fundamentos Fisicos - verificacion oral |

## Flujo de Trabajo

### Modo Test (BDA)

```
1. Seleccionar asignatura -> BDA
2. Seleccionar tema -> Tema1
3. Ver pregunta con opciones a/b/c/d
4. Seleccionar respuesta
5. Click "Comprobar" -> Claude resuelve
6. Ver explicacion detallada
7. Navegar a siguiente pregunta
```

### Pipeline PDF

```
1. Subir PDF de examen
2. Extraer paginas (pdf-lib)
3. Procesar con Claude Vision (OCR)
4. Revisar preguntas extraidas
5. Aprobar/Rechazar cada una
6. Preguntas aprobadas van a la BD
```

### Verificacion Oral

```
1. Crear sesion con estudiante y areas de enfoque
2. Generar preguntas abiertas con Claude
3. Iniciar sesion de verificacion
4. Mostrar preguntas al estudiante
5. Puntuar respuestas (0-10) con feedback
6. Completar sesion -> ver resultados
```

## Claude Integration

```javascript
// claudeService.js - Headless mode (usa CLI auth)
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: buildPrompt(question),
  options: { maxTurns: 1 }
});

// Response: { answer: "b", explanation: "...", wrongOptions: {...} }
```

### Servicios IA

| Servicio | Proposito | Timeout |
|----------|-----------|---------|
| `claudeService` | Resolver preguntas test | 60s |
| `visionService` | OCR de paginas PDF | 120s |
| `questionGenerator` | Generar variaciones | 120s |
| `verificationGenerator` | Preguntas orales | 120s |

## Keyboard Shortcuts

| Tecla | Accion |
|-------|--------|
| `←` | Pregunta anterior |
| `→` | Pregunta siguiente |
| `a/b/c/d` | Seleccionar opcion |
| `Enter` | Comprobar respuesta |

## Testing

```bash
npm test                    # Todos
npm run test:backend        # Solo backend
npm run test:coverage       # Con coverage

# Tests incluyen:
# - database.test.js
# - questions.routes.test.js
# - solving.integration.test.js
# - pipeline.integration.test.js
# - verification.routes.test.js
# - visionService.test.js
# - questionGenerator.test.js
# - verificationGenerator.test.js
```

## Troubleshooting

### Claude no responde

```bash
# Verificar CLI instalado
claude --version

# Re-autenticar si es necesario
claude auth
```

### Base de datos corrupta

```bash
# Recrear desde schema
rm server/db/exam.db*
npm run server  # Recrea automaticamente
```

### PDFs no se procesan

- Verificar que el PDF no esta protegido
- Max 50MB por archivo
- Solo formato PDF

### Frontend no conecta

- Backend debe estar en :3001
- Proxy configurado en `vite.config.js`

## Dependencias Clave

```json
{
  "@anthropic-ai/claude-agent-sdk": "^0.1.76",
  "express": "^4.18.2",
  "better-sqlite3": "^9.2.2",
  "react": "^18.2.0",
  "vite": "^5.0.0",
  "pdf-lib": "^1.17.1",
  "sharp": "^0.34.5",
  "multer": "^2.0.2",
  "zod": "^4.3.5"
}
```

## License

Uso educativo
