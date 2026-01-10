# Arquitectura exam-app

## Resumen

Aplicacion web para practicar examenes con dos modos principales:

1. **Modo Test (BDA)**: Preguntas tipo test con Claude AI para resolver
2. **Modo Verificacion (DS, FFI)**: Preguntas orales para verificar autoria de trabajos

## Stack

- **Frontend**: React 18 + Vite + React Router
- **Backend**: Express + better-sqlite3
- **IA**: @anthropic-ai/claude-agent-sdk

## Estructura

```
exam-app/
├── src/                          # Frontend React
│   ├── questions/               # Preguntas de test
│   ├── solving/                 # Resolver con Claude
│   ├── progress/                # Estadisticas
│   ├── practice/                # Practica generada
│   ├── verification/            # Verificacion oral
│   ├── pipeline/                # Pipeline PDFs
│   ├── subjects/                # Selector asignaturas
│   └── shared/                  # api.js, Layout
│
├── server/                       # Backend Express
│   ├── routes/                  # API endpoints
│   │   ├── questions.js
│   │   ├── solving.js
│   │   ├── stats.js
│   │   ├── subjects.js
│   │   ├── pipeline.js
│   │   ├── generation.js
│   │   └── verification.js
│   ├── services/                # Logica de negocio
│   │   ├── claudeService.js
│   │   ├── verificationGenerator.js
│   │   ├── pdfService.js
│   │   ├── visionService.js
│   │   └── questionGenerator.js
│   ├── database.js              # SQLite helpers
│   └── db/schema.sql            # Esquema BD
│
├── tests/                        # Tests
└── docs/                         # Documentacion
```

## Asignaturas

| ID | Nombre | Modo |
|----|--------|------|
| bda | Bases de Datos Avanzadas | Test |
| ds | Diseño de Software | Verificacion |
| ffi | Fundamentos Fisicos | Verificacion |

## API Principal

### Subjects
- `GET /api/subjects` - Lista asignaturas
- `GET /api/subjects/:id` - Detalle asignatura

### Questions (BDA)
- `GET /api/topics` - Lista temas
- `GET /api/questions/:topic` - Preguntas por tema
- `POST /api/solve` - Resolver con Claude

### Verification (DS, FFI)
- `POST /api/verification/sessions` - Crear sesion (con deliverableId opcional)
- `POST /api/verification/sessions/:id/generate` - Generar preguntas
- `GET /api/verification/sessions/:id` - Obtener sesion con preguntas
- `POST /api/verification/sessions/:id/start` - Iniciar sesion
- `POST /api/verification/questions/:id/score` - Puntuar pregunta
- `POST /api/verification/sessions/:id/complete` - Finalizar
- `GET /api/verification/sessions` - Listar sesiones por asignatura

### Pipeline
- `POST /api/pipeline/upload` - Subir PDF examen
- `POST /api/pipeline/exams/:id/extract` - Extraer paginas
- `POST /api/pipeline/exams/:id/process` - Procesar con Vision

## Base de Datos

```sql
-- Principales tablas
subjects                    -- Asignaturas
topics                      -- Temas por asignatura
questions                   -- Preguntas de test
attempts                    -- Intentos de usuario
solutions_cache             -- Cache de soluciones Claude
verification_sessions       -- Sesiones de verificacion
verification_questions      -- Preguntas de verificacion
exam_pdfs                   -- PDFs de examenes
exam_pages                  -- Paginas extraidas
```

## Flujo Verificacion

```
1. Profesor sube PDF del entregable via Pipeline (isDeliverable=true)
   ↓
2. Sistema extrae texto con Vision API (exam_pages)
   ↓
3. Profesor configura sesion (nombre, areas, count, deliverableId)
   ↓
4. Claude genera preguntas ESPECIFICAS al contenido del PDF
   ↓
5. Profesor hace preguntas oralmente al alumno
   ↓
6. Profesor puntua cada respuesta (0-10)
   ↓
7. Ver resultados finales
```
