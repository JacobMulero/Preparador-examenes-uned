# FASE 5: Pipeline de PDFs con Vision

> **Estado:** IMPLEMENTADA
> **Ultima actualizacion:** 2026-01-06
> **Objetivo:** Extraer preguntas de examenes PDF usando Claude Vision
> **Prerequisitos:** Asignatura creada (Fase 0)

---

## Resumen

El pipeline permite subir PDFs de examenes anteriores, extraer las paginas como imagenes, procesarlas con Claude Vision para detectar preguntas, y aprobar/rechazar las preguntas extraidas antes de anadirlas al banco de preguntas.

**Flujo completo:**
```
PDF Upload → Extract Pages → Claude Vision → Parse Questions → Review → Approve → Questions Bank
```

---

## Estado de Implementacion

### Backend

| Archivo | Estado | Lineas | Descripcion |
|---------|--------|--------|-------------|
| `server/routes/pipeline.js` | ✅ | 754 | API completa del pipeline |
| `server/services/pdfService.js` | ✅ | ~200 | Manejo PDFs (pdf2pic, sharp) |
| `server/services/visionService.js` | ✅ | 296 | Claude Vision via Agent SDK |

### Frontend

| Archivo | Estado | Descripcion |
|---------|--------|-------------|
| `src/pipeline/PipelineDashboard.jsx` | ✅ | Dashboard principal |
| `src/pipeline/PdfUploader.jsx` | ✅ | Componente de subida |
| `src/pipeline/ExamCard.jsx` | ✅ | Tarjeta de examen |
| `src/pipeline/QuestionReview.jsx` | ✅ | Revision de preguntas |
| `src/pipeline/Pipeline.css` | ✅ | Estilos |

### Base de Datos

| Tabla | Estado | Descripcion |
|-------|--------|-------------|
| `exam_pdfs` | ✅ | PDFs subidos |
| `exam_pages` | ✅ | Paginas extraidas |
| `parsed_questions` | ✅ | Preguntas parseadas |

### Tests

| Archivo | Estado | Coverage |
|---------|--------|----------|
| `tests/backend/pipeline.integration.test.js` | ✅ | 83%+ |

---

## API Endpoints

### Upload & Management

```
POST   /api/pipeline/upload              - Subir PDF
GET    /api/pipeline/exams?subjectId=X   - Listar examenes
GET    /api/pipeline/exams/:examId       - Detalle examen + paginas
DELETE /api/pipeline/exams/:examId       - Eliminar examen
```

### Processing

```
POST   /api/pipeline/exams/:examId/extract              - Extraer paginas a imagenes
POST   /api/pipeline/exams/:examId/process              - Procesar todas con Vision
POST   /api/pipeline/exams/:examId/process-page/:pageId - Procesar una pagina
```

### Question Review

```
GET    /api/pipeline/exams/:examId/questions       - Preguntas del examen
GET    /api/pipeline/questions/:questionId         - Detalle pregunta
PUT    /api/pipeline/questions/:questionId         - Editar pregunta
POST   /api/pipeline/questions/:questionId/approve - Aprobar pregunta
POST   /api/pipeline/questions/:questionId/reject  - Rechazar pregunta
POST   /api/pipeline/exams/:examId/approve-all     - Aprobar todas
```

---

## Schema de Base de Datos (Implementado)

```sql
-- PDFs de examenes
CREATE TABLE IF NOT EXISTS exam_pdfs (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  page_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'uploaded',
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Paginas extraidas
CREATE TABLE IF NOT EXISTS exam_pages (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  raw_markdown TEXT,
  vision_tokens INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE
);

-- Preguntas parseadas
CREATE TABLE IF NOT EXISTS parsed_questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_id TEXT,
  question_number INTEGER NOT NULL,
  raw_content TEXT NOT NULL,
  normalized_content TEXT,
  options TEXT,
  status TEXT DEFAULT 'pending',
  review_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES exam_pages(id) ON DELETE SET NULL
);
```

**Estados de exam_pdfs.status:**
- `uploaded` - PDF subido
- `extracting` - Extrayendo paginas
- `extracted` - Paginas listas
- `parsing` - Procesando con Vision
- `completed` - Proceso terminado
- `error` - Error en alguna etapa

---

## Servicios Implementados

### pdfService.js

```javascript
// Funciones exportadas
export async function savePdfFile(subjectId, examId, buffer, originalName)
export async function getPdfPageCount(pdfPath)
export async function extractPdfPages(subjectId, examId, pdfPath)
export function deleteExamFiles(subjectId, examId, filename)
export function getImageBase64(imagePath)
export function getImageMediaType(imagePath)
```

**Dependencias:**
- `pdf2pic` - Conversion PDF a imagenes (300 DPI)
- `sharp` - Procesamiento de imagenes
- `pdf-lib` - Lectura de metadatos PDF

### visionService.js

```javascript
// Funciones exportadas
export async function processExamPage(imagePath, subjectContext)
export function parseExtractedQuestions(rawMarkdown, examId, pageId)
export async function processExamPages(pages, subjectContext, onProgress)
export function normalizeQuestions(questions)
```

**Integracion:**
- Usa `@anthropic-ai/claude-agent-sdk` para llamadas Vision
- Timeout de 2 minutos por pagina
- Parsea respuestas Markdown a objetos estructurados

---

## Prompt de Extraccion

El prompt usado para Claude Vision:

```
Esta es una página de examen de {nombre_asignatura}.

Analiza la imagen y extrae TODAS las preguntas de tipo test que encuentres.

Para cada pregunta, usa el siguiente formato Markdown:

## Pregunta N

[Texto completo de la pregunta]

a) [Opción A]
b) [Opción B]
c) [Opción C]
d) [Opción D]

---

INSTRUCCIONES:
1. Preserva el texto exactamente como aparece
2. Si hay tablas o diagramas, descríbelos: [Tabla: descripción]
3. Si una pregunta está incompleta, márcala con [INCOMPLETO]
4. Numera secuencialmente empezando desde 1
5. Si hay enunciado compartido, inclúyelo en cada pregunta
6. Si no hay preguntas de test: [NO HAY PREGUNTAS DE TEST EN ESTA PÁGINA]
```

---

## Estructura de Archivos

```
subjects/
└── bda/
    └── exams/
        ├── originals/           # PDFs originales
        │   └── {examId}_{filename}.pdf
        └── images/              # Imagenes extraidas
            └── {examId}/
                ├── page-1.png
                ├── page-2.png
                └── ...
```

---

## Navegacion UI

```
/subjects/bda/pipeline    →  PipelineDashboard
                              ├── PdfUploader
                              └── ExamCard (por cada examen)
                                  └── QuestionReview (al hacer clic)
```

---

## Uso desde CLI

```bash
# 1. Subir PDF
curl -X POST http://localhost:3001/api/pipeline/upload \
  -F "file=@examen.pdf" \
  -F "subjectId=bda"

# 2. Extraer paginas
curl -X POST http://localhost:3001/api/pipeline/exams/{examId}/extract

# 3. Procesar con Vision
curl -X POST http://localhost:3001/api/pipeline/exams/{examId}/process

# 4. Ver preguntas
curl http://localhost:3001/api/pipeline/exams/{examId}/questions

# 5. Aprobar todas
curl -X POST http://localhost:3001/api/pipeline/exams/{examId}/approve-all \
  -H "Content-Type: application/json" \
  -d '{"topic": "Exam"}'
```

---

## Dependencias

```json
{
  "pdf2pic": "^3.1.3",
  "pdf-lib": "^1.17.1",
  "sharp": "^0.33.5",
  "@anthropic-ai/claude-agent-sdk": "latest"
}
```

---

## Tests

```bash
npm run test:coverage -- --testPathPattern=pipeline

# Coverage actual: 83.48%
```

Tests incluidos:
- Upload PDF
- List exams
- Get exam details
- Delete exam
- Extract pages
- Process pages
- Get questions
- Update question
- Approve question
- Reject question
- Approve all

---

## Mejoras Futuras

1. **OCR fallback** - Para PDFs escaneados de baja calidad
2. **Batch processing** - Procesar multiples PDFs en paralelo
3. **Auto-topic detection** - Detectar tema automaticamente del contenido
4. **Duplicate detection** - Evitar preguntas duplicadas
5. **Export** - Exportar preguntas a Markdown/JSON
