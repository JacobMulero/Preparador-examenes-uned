# FASE 5: Pipeline de Procesamiento PDF

> **Objetivo:** Extraer preguntas de PDFs de examenes anteriores usando Claude Vision
> **Prerequisitos:** Fase 0 y 1 completadas
> **Entregable:** Subir PDF, ver paginas extraidas, aprobar preguntas parseadas

---

## Resumen de Cambios

| Componente | Tipo | Descripcion |
|------------|------|-------------|
| `schema.sql` | Modificar | Tablas `exam_pdfs`, `exam_pages`, `parsed_questions` |
| `services/pdfService.js` | Crear | Extrae paginas de PDF como imagenes |
| `services/visionService.js` | Crear | Claude Vision para OCR |
| `routes/pipeline.js` | Crear | Upload, proceso, revision |
| `PipelineDashboard.jsx` | Crear | Vista admin |
| `PdfUploader.jsx` | Crear | Drag & drop PDFs |
| `pdf-lib`, `sharp` | Instalar | Procesamiento PDF |

---

## 1. Dependencias

```bash
npm install pdf-lib sharp uuid
```

---

## 2. Schema de Base de Datos

```sql
-- migration_006_pipeline.sql

-- PDFs de examenes subidos
CREATE TABLE IF NOT EXISTS exam_pdfs (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  exam_type TEXT DEFAULT 'test',          -- "test" | "verification"
  year INTEGER,
  convocatoria TEXT,                      -- "febrero", "septiembre"
  page_count INTEGER,
  status TEXT DEFAULT 'uploaded',         -- uploaded, extracting, parsing, review, completed, error
  error_message TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Paginas individuales extraidas
CREATE TABLE IF NOT EXISTS exam_pages (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  image_path TEXT,                        -- Ruta al PNG
  raw_markdown TEXT,                      -- Output de Vision
  processed_markdown TEXT,                -- Normalizado
  status TEXT DEFAULT 'pending',          -- pending, processing, completed, error
  vision_tokens INTEGER,
  error_message TEXT,
  processed_at DATETIME,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE
);

-- Preguntas parseadas (antes de revision)
CREATE TABLE IF NOT EXISTS parsed_questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  page_id TEXT,
  question_number INTEGER,
  question_type TEXT DEFAULT 'test',      -- "test" | "open"
  raw_content TEXT NOT NULL,
  normalized_content TEXT,
  options TEXT,                           -- JSON: {a, b, c, d} o NULL
  section_id TEXT,                        -- Para verificacion
  status TEXT DEFAULT 'pending',          -- pending, approved, rejected, edited
  reviewer_notes TEXT,
  approved_at DATETIME,
  FOREIGN KEY (exam_id) REFERENCES exam_pdfs(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES exam_pages(id) ON DELETE SET NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_exam_pdfs_subject ON exam_pdfs(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_pages_exam ON exam_pages(exam_id);
CREATE INDEX IF NOT EXISTS idx_parsed_questions_exam ON parsed_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_parsed_questions_status ON parsed_questions(status);
```

---

## 3. Database Helpers

```javascript
// server/database.js - AGREGAR

import { v4 as uuidv4 } from 'uuid';

// ============================================
// EXAM PDFS
// ============================================

export function createExamPdf(data) {
  const id = data.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO exam_pdfs
    (id, subject_id, filename, original_path, exam_type, year, convocatoria, page_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploaded')
  `);
  stmt.run(
    id,
    data.subjectId,
    data.filename,
    data.originalPath,
    data.examType || 'test',
    data.year || null,
    data.convocatoria || null,
    data.pageCount || 0
  );
  return getExamPdfById(id);
}

export function getExamPdfById(id) {
  const stmt = db.prepare('SELECT * FROM exam_pdfs WHERE id = ?');
  return stmt.get(id);
}

export function getExamPdfsBySubject(subjectId) {
  const stmt = db.prepare(`
    SELECT * FROM exam_pdfs
    WHERE subject_id = ?
    ORDER BY year DESC, uploaded_at DESC
  `);
  return stmt.all(subjectId);
}

export function updateExamPdfStatus(id, status, pageCount = null, errorMessage = null) {
  let query = 'UPDATE exam_pdfs SET status = ?';
  const params = [status];

  if (pageCount !== null) {
    query += ', page_count = ?';
    params.push(pageCount);
  }
  if (errorMessage !== null) {
    query += ', error_message = ?';
    params.push(errorMessage);
  }
  if (status === 'completed') {
    query += ', processed_at = datetime("now")';
  }

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);
  return getExamPdfById(id);
}

// ============================================
// EXAM PAGES
// ============================================

export function createExamPage(data) {
  const id = data.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO exam_pages (id, exam_id, page_number, image_path, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);
  stmt.run(id, data.examId, data.pageNumber, data.imagePath);
  return id;
}

export function getExamPages(examId) {
  const stmt = db.prepare(`
    SELECT * FROM exam_pages
    WHERE exam_id = ?
    ORDER BY page_number
  `);
  return stmt.all(examId);
}

export function updateExamPage(id, updates) {
  const fields = [];
  const values = [];

  if (updates.rawMarkdown !== undefined) {
    fields.push('raw_markdown = ?');
    values.push(updates.rawMarkdown);
  }
  if (updates.processedMarkdown !== undefined) {
    fields.push('processed_markdown = ?');
    values.push(updates.processedMarkdown);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.visionTokens !== undefined) {
    fields.push('vision_tokens = ?');
    values.push(updates.visionTokens);
  }
  if (updates.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.errorMessage);
  }
  if (updates.status === 'completed') {
    fields.push('processed_at = datetime("now")');
  }

  values.push(id);
  const stmt = db.prepare(`UPDATE exam_pages SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

// ============================================
// PARSED QUESTIONS
// ============================================

export function createParsedQuestion(data) {
  const id = data.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO parsed_questions
    (id, exam_id, page_id, question_number, question_type, raw_content, normalized_content, options, section_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  stmt.run(
    id,
    data.examId,
    data.pageId || null,
    data.questionNumber,
    data.questionType || 'test',
    data.rawContent,
    data.normalizedContent || null,
    data.options ? JSON.stringify(data.options) : null,
    data.sectionId || null
  );
  return id;
}

export function getParsedQuestions(examId, status = null) {
  let query = 'SELECT * FROM parsed_questions WHERE exam_id = ?';
  const params = [examId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY question_number';

  const stmt = db.prepare(query);
  return stmt.all(...params).map(row => ({
    ...row,
    options: row.options ? JSON.parse(row.options) : null
  }));
}

export function updateParsedQuestion(id, updates) {
  const fields = [];
  const values = [];

  if (updates.normalizedContent !== undefined) {
    fields.push('normalized_content = ?');
    values.push(updates.normalizedContent);
  }
  if (updates.options !== undefined) {
    fields.push('options = ?');
    values.push(updates.options ? JSON.stringify(updates.options) : null);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.reviewerNotes !== undefined) {
    fields.push('reviewer_notes = ?');
    values.push(updates.reviewerNotes);
  }
  if (updates.status === 'approved') {
    fields.push('approved_at = datetime("now")');
  }

  values.push(id);
  const stmt = db.prepare(`UPDATE parsed_questions SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function approveParsedQuestion(id, options = {}) {
  const { topic, subjectId } = options;
  const parsed = db.prepare('SELECT * FROM parsed_questions WHERE id = ?').get(id);

  if (!parsed) return null;

  // Insertar en tabla questions principal
  const questionId = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO questions
    (id, subject_id, topic, question_number, question_type, content, options, source_type, source_reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pdf_parsed', ?)
  `);

  stmt.run(
    questionId,
    subjectId || 'bda',
    topic || null,
    parsed.question_number,
    parsed.question_type,
    parsed.normalized_content || parsed.raw_content,
    parsed.options,
    id // Referencia a parsed_question original
  );

  // Actualizar estado
  updateParsedQuestion(id, { status: 'approved' });

  return questionId;
}
```

---

## 4. Servicio de PDF

### server/services/pdfService.js

```javascript
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  updateExamPdfStatus,
  createExamPage
} from '../database.js';

/**
 * Extrae paginas de un PDF como imagenes PNG
 */
export async function extractPdfPages(examId, pdfPath, outputDir) {
  try {
    // Crear directorio de salida
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Leer PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    updateExamPdfStatus(examId, 'extracting', pageCount);

    const pageIds = [];

    // Procesar cada pagina
    // NOTA: pdf-lib no renderiza a imagen directamente, necesitamos otra estrategia
    // Usamos pdf2pic o similar en produccion
    // Por ahora, simulamos con placeholder

    for (let i = 0; i < pageCount; i++) {
      const pageNum = i + 1;
      const imagePath = path.join(outputDir, `page_${String(pageNum).padStart(3, '0')}.png`);

      // En produccion, aqui iria la conversion real
      // Por ahora creamos un placeholder
      await createPlaceholderImage(imagePath, pageNum, pageCount);

      // Registrar pagina en BD
      const pageId = createExamPage({
        examId,
        pageNumber: pageNum,
        imagePath
      });

      pageIds.push(pageId);
    }

    updateExamPdfStatus(examId, 'extracted');

    return {
      pageCount,
      pageIds
    };

  } catch (error) {
    console.error('Error extracting PDF:', error);
    updateExamPdfStatus(examId, 'error', null, error.message);
    throw error;
  }
}

/**
 * Crea imagen placeholder (para desarrollo)
 */
async function createPlaceholderImage(outputPath, pageNum, totalPages) {
  // Crear imagen gris con texto
  const width = 800;
  const height = 1100;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f0f0f0"/>
      <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#666"
            text-anchor="middle" dominant-baseline="middle">
        Pagina ${pageNum} de ${totalPages}
      </text>
      <text x="50%" y="60%" font-family="Arial" font-size="14" fill="#999"
            text-anchor="middle" dominant-baseline="middle">
        (Placeholder - usar pdf2pic en produccion)
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
}

/**
 * Convierte PDF real a imagenes (requiere Poppler instalado)
 * npm install pdf-poppler o usar servicio externo
 */
export async function extractPdfPagesReal(examId, pdfPath, outputDir) {
  // Esta implementacion requiere pdf-poppler o similar
  // const pdf = require('pdf-poppler');
  //
  // const opts = {
  //   format: 'png',
  //   out_dir: outputDir,
  //   out_prefix: 'page',
  //   page: null // todas las paginas
  // };
  //
  // await pdf.convert(pdfPath, opts);

  throw new Error('Implementacion real requiere pdf-poppler');
}

export default {
  extractPdfPages,
  extractPdfPagesReal
};
```

---

## 5. Servicio de Vision

### server/services/visionService.js

```javascript
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import {
  getExamPdfById,
  getExamPages,
  updateExamPage,
  updateExamPdfStatus,
  createParsedQuestion,
  getSubjectById
} from '../database.js';

const client = new Anthropic();

/**
 * Procesa una pagina de examen con Claude Vision
 */
export async function processExamPage(pageId, imagePath, examType = 'test', subjectContext = {}) {
  try {
    // Leer imagen
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // Determinar media type
    const ext = imagePath.split('.').pop().toLowerCase();
    const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg';

    // Seleccionar prompt segun tipo
    const prompt = examType === 'test'
      ? buildTestExtractionPrompt(subjectContext)
      : buildVerificationExtractionPrompt(subjectContext);

    // Llamar a Claude Vision
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    });

    const rawMarkdown = response.content[0].text;
    const tokens = response.usage.input_tokens + response.usage.output_tokens;

    // Actualizar pagina
    updateExamPage(pageId, {
      rawMarkdown,
      status: 'completed',
      visionTokens: tokens
    });

    return {
      markdown: rawMarkdown,
      tokens
    };

  } catch (error) {
    console.error('Vision error:', error);
    updateExamPage(pageId, {
      status: 'error',
      errorMessage: error.message
    });
    throw error;
  }
}

/**
 * Prompt para extraer preguntas tipo test
 */
function buildTestExtractionPrompt(context) {
  return `Analiza esta pagina de examen de ${context.name || 'una asignatura'}.

Extrae TODAS las preguntas de tipo test en formato Markdown:

## Pregunta N

[Texto completo de la pregunta, incluyendo cualquier contexto o enunciado compartido]

a) [Opcion A]
b) [Opcion B]
c) [Opcion C]
d) [Opcion D]

---

INSTRUCCIONES:
1. Preserva EXACTAMENTE el texto, formulas y simbolos
2. Si hay tablas o diagramas, descríbelos en texto claro
3. Si una pregunta hace referencia a un enunciado comun, incluye ese enunciado
4. Numera las preguntas secuencialmente
5. Usa el separador --- entre preguntas
6. Si una pregunta parece incompleta, marcala con [INCOMPLETO]
7. Si no hay preguntas en esta pagina, responde: [SIN PREGUNTAS]

IMPORTANTE: Extrae solo el contenido visible, no inventes ni completes.`;
}

/**
 * Prompt para extraer preguntas de verificacion (abiertas)
 */
function buildVerificationExtractionPrompt(context) {
  return `Analiza esta pagina de examen de verificacion de autoria de ${context.name || 'Diseno de Software'}.

Este es un examen donde el alumno debe demostrar que conoce SU PROPIO trabajo.
Las preguntas son ABIERTAS (no multiple choice).

Extrae TODAS las preguntas en formato Markdown:

## Pregunta N

[Texto completo de la pregunta]

**Seccion del trabajo relacionada:** [casos_uso | descripcion_cu | modelo_dominio | diagramas_interaccion | contrato | dcd]
**Tipo de respuesta esperada:** [lista_nombres | secuencia_acciones | objetos_roles | instancias_clases | operacion_firma | clases_operaciones]

---

INSTRUCCIONES:
1. Preserva EXACTAMENTE la redaccion de cada pregunta
2. Identifica que seccion del trabajo evalua cada pregunta
3. Indica que tipo de elementos debe enumerar el alumno
4. Si no hay preguntas visibles, responde: [SIN PREGUNTAS]`;
}

/**
 * Procesa todas las paginas de un examen
 */
export async function processAllPages(examId) {
  const exam = getExamPdfById(examId);
  if (!exam) throw new Error('Exam not found');

  const subject = getSubjectById(exam.subject_id);
  const subjectContext = subject ? { name: subject.name } : {};

  const pages = getExamPages(examId);
  updateExamPdfStatus(examId, 'parsing');

  for (const page of pages) {
    if (page.status === 'completed') continue;

    try {
      await processExamPage(
        page.id,
        page.image_path,
        exam.exam_type,
        subjectContext
      );
    } catch (error) {
      console.error(`Error processing page ${page.page_number}:`, error);
      // Continuar con siguiente pagina
    }
  }

  // Parsear markdown a preguntas
  await parseMarkdownToQuestions(examId);

  updateExamPdfStatus(examId, 'review');
}

/**
 * Parsea el markdown de las paginas a preguntas individuales
 */
async function parseMarkdownToQuestions(examId) {
  const pages = getExamPages(examId);
  const exam = getExamPdfById(examId);
  let questionNum = 1;

  for (const page of pages) {
    if (!page.raw_markdown) continue;

    // Dividir por preguntas
    const questionBlocks = page.raw_markdown.split(/^---$/m);

    for (const block of questionBlocks) {
      const trimmed = block.trim();
      if (!trimmed || trimmed === '[SIN PREGUNTAS]') continue;

      // Extraer numero de pregunta si existe
      const numMatch = trimmed.match(/^##\s*Pregunta\s*(\d+)/i);
      const num = numMatch ? parseInt(numMatch[1]) : questionNum;

      // Extraer opciones si existen (tipo test)
      const options = extractOptions(trimmed);

      // Extraer seccion si existe (tipo verificacion)
      const sectionMatch = trimmed.match(/\*\*Seccion.*?:\*\*\s*(\w+)/i);
      const sectionId = sectionMatch ? sectionMatch[1] : null;

      createParsedQuestion({
        examId,
        pageId: page.id,
        questionNumber: num,
        questionType: options ? 'test' : 'open',
        rawContent: trimmed,
        options,
        sectionId
      });

      questionNum++;
    }
  }
}

/**
 * Extrae opciones a/b/c/d del texto
 */
function extractOptions(text) {
  const options = {};
  const patterns = [
    /^a\)\s*(.+)$/mi,
    /^b\)\s*(.+)$/mi,
    /^c\)\s*(.+)$/mi,
    /^d\)\s*(.+)$/mi
  ];

  for (const [i, pattern] of patterns.entries()) {
    const match = text.match(pattern);
    if (match) {
      options[String.fromCharCode(97 + i)] = match[1].trim();
    }
  }

  return Object.keys(options).length === 4 ? options : null;
}

export default {
  processExamPage,
  processAllPages
};
```

---

## 6. API Routes

### server/routes/pipeline.js

```javascript
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  createExamPdf,
  getExamPdfById,
  getExamPdfsBySubject,
  getExamPages,
  getParsedQuestions,
  updateParsedQuestion,
  approveParsedQuestion,
  getSubjectById
} from '../database.js';
import { extractPdfPages } from '../services/pdfService.js';
import { processAllPages } from '../services/visionService.js';

const router = express.Router();

// Configurar multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'pdfs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  }
});

/**
 * POST /api/pipeline/upload
 * Subir PDF de examen
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { subjectId, examType, year, convocatoria } = req.body;

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        error: 'subjectId es requerido'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se subio ningun archivo'
      });
    }

    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    // Crear registro
    const exam = createExamPdf({
      subjectId,
      filename: req.file.originalname,
      originalPath: req.file.path,
      examType: examType || 'test',
      year: year ? parseInt(year) : null,
      convocatoria
    });

    res.status(201).json({
      success: true,
      exam
    });

  } catch (error) {
    console.error('Error uploading PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al subir PDF'
    });
  }
});

/**
 * GET /api/pipeline/exams
 * Lista examenes (opcionalmente filtrados)
 */
router.get('/exams', (req, res) => {
  try {
    const { subjectId } = req.query;

    let exams;
    if (subjectId) {
      exams = getExamPdfsBySubject(subjectId);
    } else {
      const stmt = db.prepare('SELECT * FROM exam_pdfs ORDER BY uploaded_at DESC');
      exams = stmt.all();
    }

    res.json({
      success: true,
      exams
    });
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener examenes'
    });
  }
});

/**
 * GET /api/pipeline/exams/:id
 * Detalle de un examen
 */
router.get('/exams/:id', (req, res) => {
  try {
    const exam = getExamPdfById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Examen no encontrado'
      });
    }

    const pages = getExamPages(req.params.id);
    const questions = getParsedQuestions(req.params.id);

    res.json({
      success: true,
      exam,
      pages,
      questions
    });
  } catch (error) {
    console.error('Error fetching exam:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener examen'
    });
  }
});

/**
 * POST /api/pipeline/exams/:id/extract
 * Extraer paginas del PDF
 */
router.post('/exams/:id/extract', async (req, res) => {
  try {
    const exam = getExamPdfById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Examen no encontrado'
      });
    }

    // Directorio de salida
    const outputDir = path.join(process.cwd(), 'uploads', 'pdfs', req.params.id);

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Extraccion iniciada'
    });

    // Extraer en background
    extractPdfPages(req.params.id, exam.original_path, outputDir).catch(err => {
      console.error('Background extraction error:', err);
    });

  } catch (error) {
    console.error('Error starting extraction:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar extraccion'
    });
  }
});

/**
 * POST /api/pipeline/exams/:id/process
 * Procesar paginas con Vision
 */
router.post('/exams/:id/process', async (req, res) => {
  try {
    const exam = getExamPdfById(req.params.id);

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Examen no encontrado'
      });
    }

    if (!['extracted', 'review', 'error'].includes(exam.status)) {
      return res.status(400).json({
        success: false,
        error: 'El examen debe estar extraido primero'
      });
    }

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Procesamiento iniciado'
    });

    // Procesar en background
    processAllPages(req.params.id).catch(err => {
      console.error('Background processing error:', err);
    });

  } catch (error) {
    console.error('Error starting processing:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar procesamiento'
    });
  }
});

/**
 * GET /api/pipeline/exams/:id/questions
 * Preguntas parseadas de un examen
 */
router.get('/exams/:id/questions', (req, res) => {
  try {
    const { status } = req.query;
    const questions = getParsedQuestions(req.params.id, status);

    res.json({
      success: true,
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
 * PUT /api/pipeline/questions/:id
 * Editar pregunta parseada
 */
router.put('/questions/:id', (req, res) => {
  try {
    const { normalizedContent, options, reviewerNotes } = req.body;

    updateParsedQuestion(req.params.id, {
      normalizedContent,
      options,
      reviewerNotes,
      status: 'edited'
    });

    res.json({
      success: true,
      message: 'Pregunta actualizada'
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar pregunta'
    });
  }
});

/**
 * POST /api/pipeline/questions/:id/approve
 * Aprobar pregunta y moverla a la BD principal
 */
router.post('/questions/:id/approve', (req, res) => {
  try {
    const { topic, subjectId } = req.body;

    const questionId = approveParsedQuestion(req.params.id, { topic, subjectId });

    if (!questionId) {
      return res.status(404).json({
        success: false,
        error: 'Pregunta no encontrada'
      });
    }

    res.json({
      success: true,
      questionId,
      message: 'Pregunta aprobada y agregada al banco'
    });
  } catch (error) {
    console.error('Error approving question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al aprobar pregunta'
    });
  }
});

/**
 * POST /api/pipeline/questions/:id/reject
 * Rechazar pregunta
 */
router.post('/questions/:id/reject', (req, res) => {
  try {
    const { reason } = req.body;

    updateParsedQuestion(req.params.id, {
      status: 'rejected',
      reviewerNotes: reason
    });

    res.json({
      success: true,
      message: 'Pregunta rechazada'
    });
  } catch (error) {
    console.error('Error rejecting question:', error);
    res.status(500).json({
      success: false,
      error: 'Error al rechazar pregunta'
    });
  }
});

export default router;
```

---

## 7. Componentes Frontend

### src/pipeline/PipelineDashboard.jsx

```jsx
import { useState, useEffect } from 'react';
import PdfUploader from './PdfUploader';
import ExamList from './ExamList';
import ExamDetail from './ExamDetail';
import api from '../shared/api';
import './PipelineDashboard.css';

function PipelineDashboard({ subjectId }) {
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExams();
  }, [subjectId]);

  const fetchExams = async () => {
    try {
      const data = await api.getPipelineExams(subjectId);
      setExams(data.exams);
    } catch (err) {
      console.error('Error fetching exams:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (exam) => {
    setExams(prev => [exam, ...prev]);
  };

  const handleExamSelect = (exam) => {
    setSelectedExam(exam);
  };

  const handleBack = () => {
    setSelectedExam(null);
    fetchExams(); // Refresh
  };

  if (selectedExam) {
    return <ExamDetail exam={selectedExam} onBack={handleBack} />;
  }

  return (
    <div className="pipeline-dashboard">
      <h2>Pipeline de Examenes</h2>

      <PdfUploader
        subjectId={subjectId}
        onUploadComplete={handleUploadComplete}
      />

      {loading ? (
        <p>Cargando examenes...</p>
      ) : (
        <ExamList
          exams={exams}
          onSelect={handleExamSelect}
        />
      )}
    </div>
  );
}

export default PipelineDashboard;
```

### src/pipeline/QuestionEditor.jsx

```jsx
import { useState } from 'react';
import api from '../shared/api';
import './QuestionEditor.css';

function QuestionEditor({ question, onApprove, onReject, onUpdate }) {
  const [content, setContent] = useState(question.normalized_content || question.raw_content);
  const [options, setOptions] = useState(question.options || { a: '', b: '', c: '', d: '' });
  const [topic, setTopic] = useState('');
  const [editing, setEditing] = useState(false);

  const handleOptionChange = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    await api.updateParsedQuestion(question.id, {
      normalizedContent: content,
      options: question.question_type === 'test' ? options : null
    });
    setEditing(false);
    if (onUpdate) onUpdate();
  };

  const handleApprove = async () => {
    await api.approveParsedQuestion(question.id, { topic });
    if (onApprove) onApprove();
  };

  const handleReject = async () => {
    const reason = prompt('Razon del rechazo:');
    if (reason) {
      await api.rejectParsedQuestion(question.id, reason);
      if (onReject) onReject();
    }
  };

  return (
    <div className={`question-editor status-${question.status}`}>
      <div className="editor-header">
        <span className="question-number">Pregunta {question.question_number}</span>
        <span className={`status-badge ${question.status}`}>{question.status}</span>
      </div>

      {editing ? (
        <div className="edit-mode">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />

          {question.question_type === 'test' && (
            <div className="options-editor">
              {['a', 'b', 'c', 'd'].map(key => (
                <div key={key} className="option-input">
                  <span>{key})</span>
                  <input
                    value={options[key]}
                    onChange={(e) => handleOptionChange(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="edit-actions">
            <button onClick={handleSave}>Guardar</button>
            <button onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="view-mode">
          <div className="content">{content}</div>

          {question.options && (
            <div className="options">
              {Object.entries(question.options).map(([k, v]) => (
                <div key={k}>{k}) {v}</div>
              ))}
            </div>
          )}

          {question.status === 'pending' && (
            <div className="review-actions">
              <input
                type="text"
                placeholder="Topic (opcional)"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <button className="edit-btn" onClick={() => setEditing(true)}>Editar</button>
              <button className="approve-btn" onClick={handleApprove}>Aprobar</button>
              <button className="reject-btn" onClick={handleReject}>Rechazar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QuestionEditor;
```

---

## 8. API Client

```javascript
// src/shared/api.js - AGREGAR

// ============================================
// PIPELINE
// ============================================

async uploadExamPdf(formData, onProgress) {
  const response = await axios.post(`${this.baseUrl}/pipeline/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
  });
  return response.data;
},

async getPipelineExams(subjectId = null) {
  const params = subjectId ? { subjectId } : {};
  const response = await axios.get(`${this.baseUrl}/pipeline/exams`, { params });
  return response.data;
},

async getPipelineExam(examId) {
  const response = await axios.get(`${this.baseUrl}/pipeline/exams/${examId}`);
  return response.data;
},

async extractExamPages(examId) {
  const response = await axios.post(`${this.baseUrl}/pipeline/exams/${examId}/extract`);
  return response.data;
},

async processExamPages(examId) {
  const response = await axios.post(`${this.baseUrl}/pipeline/exams/${examId}/process`);
  return response.data;
},

async getParsedQuestions(examId, status = null) {
  const params = status ? { status } : {};
  const response = await axios.get(`${this.baseUrl}/pipeline/exams/${examId}/questions`, { params });
  return response.data;
},

async updateParsedQuestion(questionId, updates) {
  const response = await axios.put(`${this.baseUrl}/pipeline/questions/${questionId}`, updates);
  return response.data;
},

async approveParsedQuestion(questionId, options) {
  const response = await axios.post(`${this.baseUrl}/pipeline/questions/${questionId}/approve`, options);
  return response.data;
},

async rejectParsedQuestion(questionId, reason) {
  const response = await axios.post(`${this.baseUrl}/pipeline/questions/${questionId}/reject`, { reason });
  return response.data;
},
```

---

## 9. Criterios de Aceptacion

### Tests que deben pasar

```bash
npm test -- --testPathPattern=pipeline.test.js
```

### Validacion Manual

- [ ] Subir PDF de examen
- [ ] Ver estado del examen
- [ ] Extraer paginas como imagenes
- [ ] Procesar con Vision
- [ ] Ver preguntas parseadas
- [ ] Editar pregunta si necesario
- [ ] Aprobar pregunta (mueve a BD principal)
- [ ] Rechazar pregunta con razon

### Flujo E2E

1. Ir a Pipeline (admin)
2. Subir PDF de examen
3. Click "Extraer paginas"
4. Click "Procesar con Vision"
5. Revisar preguntas parseadas
6. Editar opciones si necesario
7. Aprobar preguntas correctas
8. Verificar que aparecen en banco de preguntas

---

## 10. Notas de Produccion

### Conversion PDF Real

Para produccion, usar una de estas opciones:

```bash
# Opcion 1: pdf-poppler (requiere Poppler instalado)
npm install pdf-poppler

# Opcion 2: pdf2pic (requiere GraphicsMagick/ImageMagick)
npm install pdf2pic

# Opcion 3: Servicio externo (AWS Lambda, Cloudinary)
```

### Costos de Vision

- Claude Vision: ~$3 por 1000 imagenes
- Optimizar resolución de imagenes (800px width suficiente)
- Cache resultados para reprocesamiento
