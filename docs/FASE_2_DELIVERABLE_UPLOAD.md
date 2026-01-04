# FASE 2: Subida y Analisis de Entregables

> **Objetivo:** Permitir subir trabajos de DS y analizarlos con Claude
> **Prerequisitos:** Fase 0 y 1 completadas
> **Entregable:** Subir carpeta de trabajo, ver analisis de fortalezas/debilidades

---

## Resumen de Cambios

| Componente | Tipo | Descripcion |
|------------|------|-------------|
| `schema.sql` | Modificar | Tablas `deliverables`, `deliverable_files`, `deliverable_analysis` |
| `routes/deliverables.js` | Crear | Upload y analisis de entregables |
| `services/deliverableAnalyzer.js` | Crear | Analisis con Claude |
| `DeliverableUploader.jsx` | Crear | UI de subida |
| `AnalysisResults.jsx` | Crear | Visualizacion de analisis |
| `multer` | Instalar | Middleware para uploads |

---

## 1. Dependencias

```bash
npm install multer
```

---

## 2. Schema de Base de Datos

```sql
-- migration_003_deliverables.sql

-- Entregables de alumnos
CREATE TABLE IF NOT EXISTS deliverables (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  student_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  folder_path TEXT NOT NULL,              -- Ruta a la carpeta subida
  file_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'uploaded',         -- uploaded, analyzing, completed, error
  error_message TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  analyzed_at DATETIME,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Archivos dentro de un entregable
CREATE TABLE IF NOT EXISTS deliverable_files (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  relative_path TEXT NOT NULL,            -- Ruta relativa dentro del entregable
  file_path TEXT NOT NULL,                -- Ruta absoluta
  file_type TEXT,                         -- code, document, image, diagram
  language TEXT,                          -- python, java, plantuml, markdown
  section_id TEXT,                        -- casos_uso, modelo_dominio, etc.
  file_size INTEGER,
  content_preview TEXT,                   -- Primeras 500 chars
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE
);

-- Analisis de Claude sobre entregables
CREATE TABLE IF NOT EXISTS deliverable_analysis (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL,            -- overview, strengths, weaknesses, recommendations
  content TEXT NOT NULL,                  -- JSON con el analisis
  section_id TEXT,                        -- Si aplica a una seccion especifica
  confidence REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_deliverables_subject ON deliverables(subject_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_files_deliverable ON deliverable_files(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_analysis_deliverable ON deliverable_analysis(deliverable_id);
```

---

## 3. Database Helpers

```javascript
// server/database.js - AGREGAR

import { v4 as uuidv4 } from 'uuid';

// ============================================
// DELIVERABLES
// ============================================

export function createDeliverable(deliverable) {
  const id = deliverable.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO deliverables (id, subject_id, student_id, title, description, folder_path, file_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded')
  `);
  stmt.run(
    id,
    deliverable.subjectId,
    deliverable.studentId || null,
    deliverable.title,
    deliverable.description || null,
    deliverable.folderPath,
    deliverable.fileCount || 0
  );
  return getDeliverableById(id);
}

export function getDeliverableById(id) {
  const stmt = db.prepare(`
    SELECT * FROM deliverables WHERE id = ?
  `);
  return stmt.get(id);
}

export function getDeliverablesBySubject(subjectId) {
  const stmt = db.prepare(`
    SELECT * FROM deliverables
    WHERE subject_id = ?
    ORDER BY uploaded_at DESC
  `);
  return stmt.all(subjectId);
}

export function updateDeliverableStatus(id, status, errorMessage = null) {
  const stmt = db.prepare(`
    UPDATE deliverables
    SET status = ?, error_message = ?, analyzed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE analyzed_at END
    WHERE id = ?
  `);
  stmt.run(status, errorMessage, status, id);
  return getDeliverableById(id);
}

// ============================================
// DELIVERABLE FILES
// ============================================

export function addDeliverableFile(file) {
  const id = file.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO deliverable_files (id, deliverable_id, filename, relative_path, file_path, file_type, language, section_id, file_size, content_preview)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    file.deliverableId,
    file.filename,
    file.relativePath,
    file.filePath,
    file.fileType || null,
    file.language || null,
    file.sectionId || null,
    file.fileSize || 0,
    file.contentPreview || null
  );
  return id;
}

export function getDeliverableFiles(deliverableId) {
  const stmt = db.prepare(`
    SELECT * FROM deliverable_files
    WHERE deliverable_id = ?
    ORDER BY relative_path
  `);
  return stmt.all(deliverableId);
}

export function getDeliverableFilesBySection(deliverableId, sectionId) {
  const stmt = db.prepare(`
    SELECT * FROM deliverable_files
    WHERE deliverable_id = ? AND section_id = ?
  `);
  return stmt.all(deliverableId, sectionId);
}

// ============================================
// DELIVERABLE ANALYSIS
// ============================================

export function saveDeliverableAnalysis(analysis) {
  const id = analysis.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO deliverable_analysis (id, deliverable_id, analysis_type, content, section_id, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    analysis.deliverableId,
    analysis.analysisType,
    JSON.stringify(analysis.content),
    analysis.sectionId || null,
    analysis.confidence || 1.0
  );
  return id;
}

export function getDeliverableAnalysis(deliverableId) {
  const stmt = db.prepare(`
    SELECT * FROM deliverable_analysis
    WHERE deliverable_id = ?
    ORDER BY created_at
  `);
  return stmt.all(deliverableId).map(row => ({
    ...row,
    content: JSON.parse(row.content)
  }));
}

export function getDeliverableAnalysisByType(deliverableId, analysisType) {
  const stmt = db.prepare(`
    SELECT * FROM deliverable_analysis
    WHERE deliverable_id = ? AND analysis_type = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = stmt.get(deliverableId, analysisType);
  if (!row) return null;
  return { ...row, content: JSON.parse(row.content) };
}
```

---

## 4. Servicio de Analisis

### server/services/deliverableAnalyzer.js

```javascript
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  getDeliverableById,
  getDeliverableFiles,
  updateDeliverableStatus,
  saveDeliverableAnalysis,
  getSubjectById
} from '../database.js';

const client = new Anthropic();

// Mapeo de extensiones a tipos
const FILE_TYPE_MAP = {
  '.md': { type: 'document', language: 'markdown' },
  '.puml': { type: 'diagram', language: 'plantuml' },
  '.java': { type: 'code', language: 'java' },
  '.py': { type: 'code', language: 'python' },
  '.png': { type: 'image', language: null },
  '.jpg': { type: 'image', language: null },
  '.jpeg': { type: 'image', language: null },
  '.pdf': { type: 'document', language: null }
};

// Mapeo de carpetas a secciones
const SECTION_MAP = {
  'Pregunta1': 'casos_uso',
  'Pregunta2': 'descripcion_cu',
  'Pregunta3': 'modelo_dominio',
  'Pregunta4': 'diagramas_interaccion',
  'Pregunta5': 'contrato',
  'Pregunta6': 'dcd',
  'Pregunta7': 'codigo',
  'Pregunta8': 'grasp',
  'Pregunta9': 'gof'
};

/**
 * Detecta el tipo de archivo y seccion
 */
export function classifyFile(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const typeInfo = FILE_TYPE_MAP[ext] || { type: 'unknown', language: null };

  // Detectar seccion desde la ruta
  let sectionId = null;
  for (const [folder, section] of Object.entries(SECTION_MAP)) {
    if (relativePath.includes(folder)) {
      sectionId = section;
      break;
    }
  }

  return { ...typeInfo, sectionId };
}

/**
 * Lee el contenido de un archivo (para preview)
 */
export function readFilePreview(filePath, maxLength = 500) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // Solo leer archivos de texto
    if (['.md', '.puml', '.java', '.py', '.txt', '.json'].includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.substring(0, maxLength);
    }

    return null;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Analiza un entregable completo con Claude
 */
export async function analyzeDeliverable(deliverableId) {
  const deliverable = getDeliverableById(deliverableId);
  if (!deliverable) {
    throw new Error('Deliverable not found');
  }

  const subject = getSubjectById(deliverable.subject_id);
  const files = getDeliverableFiles(deliverableId);

  // Actualizar estado
  updateDeliverableStatus(deliverableId, 'analyzing');

  try {
    // Recopilar contenido de archivos .md y .puml
    const fileContents = [];
    for (const file of files) {
      if (file.language === 'markdown' || file.language === 'plantuml') {
        try {
          const content = fs.readFileSync(file.file_path, 'utf-8');
          fileContents.push({
            path: file.relative_path,
            section: file.section_id,
            content: content.substring(0, 5000) // Limitar tamano
          });
        } catch (e) {
          console.error(`Error reading ${file.file_path}:`, e.message);
        }
      }
    }

    // Prompt para analisis
    const prompt = buildAnalysisPrompt(subject, fileContents);

    // Llamar a Claude
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Parsear respuesta
    const analysisText = response.content[0].text;
    const analysis = parseAnalysisResponse(analysisText);

    // Guardar analisis
    saveDeliverableAnalysis({
      deliverableId,
      analysisType: 'overview',
      content: analysis.overview
    });

    saveDeliverableAnalysis({
      deliverableId,
      analysisType: 'strengths',
      content: analysis.strengths
    });

    saveDeliverableAnalysis({
      deliverableId,
      analysisType: 'weaknesses',
      content: analysis.weaknesses
    });

    saveDeliverableAnalysis({
      deliverableId,
      analysisType: 'recommendations',
      content: analysis.recommendations
    });

    // Guardar analisis por seccion
    for (const [sectionId, sectionAnalysis] of Object.entries(analysis.sections || {})) {
      saveDeliverableAnalysis({
        deliverableId,
        analysisType: 'section',
        sectionId,
        content: sectionAnalysis
      });
    }

    // Actualizar estado
    updateDeliverableStatus(deliverableId, 'completed');

    return analysis;

  } catch (error) {
    console.error('Error analyzing deliverable:', error);
    updateDeliverableStatus(deliverableId, 'error', error.message);
    throw error;
  }
}

/**
 * Construye el prompt de analisis
 */
function buildAnalysisPrompt(subject, fileContents) {
  const claudeContext = subject.claude_context ? JSON.parse(subject.claude_context) : {};

  return `Eres un profesor experto en ${claudeContext.expertise || 'software design'}.
Libro de referencia: ${claudeContext.referenceBook || 'UML y Patrones - Craig Larman'}

## TAREA
Analiza el siguiente trabajo de un alumno de "${subject.name}".
Evalua segun los criterios del libro de Larman.

## ARCHIVOS DEL TRABAJO

${fileContents.map(f => `
### ${f.path} (Seccion: ${f.section || 'general'})
\`\`\`
${f.content}
\`\`\`
`).join('\n')}

## CRITERIOS DE EVALUACION

Para cada seccion, evalua:
- Casos de Uso: Frontera clara, actores correctos, EBP, relaciones include/extend
- Modelo de Dominio: Objetos conceptuales (NO software), cardinalidades, atributos sin tipos
- Diagramas de Secuencia: Correspondencia con CU, mensajes correctos, patrones GRASP
- DCD: Navegabilidad, metodos con tipos, visibilidad
- Codigo: Traduccion del DCD, patrones aplicados
- GRASP: Experto, Creador, Controlador, Bajo Acoplamiento, Alta Cohesion
- GoF: Patron apropiado, problema que resuelve

## FORMATO DE RESPUESTA (JSON)

{
  "overview": {
    "summary": "Resumen general del trabajo",
    "completeness": 0.85,
    "quality": 0.75
  },
  "strengths": [
    { "area": "modelo_dominio", "description": "..." },
    { "area": "grasp", "description": "..." }
  ],
  "weaknesses": [
    { "area": "dcd", "description": "...", "severity": "medium", "larmanRef": "Cap. 19" },
    { "area": "codigo", "description": "...", "severity": "low" }
  ],
  "recommendations": [
    { "priority": "high", "action": "...", "reason": "..." }
  ],
  "sections": {
    "casos_uso": { "score": 0.8, "notes": "..." },
    "modelo_dominio": { "score": 0.7, "notes": "..." }
  }
}`;
}

/**
 * Parsea la respuesta de Claude
 */
function parseAnalysisResponse(text) {
  // Buscar JSON en la respuesta
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Error parsing JSON:', e);
    }
  }

  // Fallback: estructura basica
  return {
    overview: { summary: text.substring(0, 500), completeness: 0.5, quality: 0.5 },
    strengths: [],
    weaknesses: [],
    recommendations: [],
    sections: {}
  };
}

export default {
  classifyFile,
  readFilePreview,
  analyzeDeliverable
};
```

---

## 5. API Routes

### server/routes/deliverables.js

```javascript
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  createDeliverable,
  getDeliverableById,
  getDeliverablesBySubject,
  getDeliverableFiles,
  addDeliverableFile,
  getDeliverableAnalysis,
  getSubjectById
} from '../database.js';
import { classifyFile, readFilePreview, analyzeDeliverable } from '../services/deliverableAnalyzer.js';

const router = express.Router();

// Configurar multer para uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'deliverables');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Preservar estructura de carpetas en el nombre
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExt = ['.md', '.puml', '.java', '.py', '.png', '.jpg', '.jpeg', '.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${ext}`));
    }
  }
});

/**
 * GET /api/deliverables
 * Lista entregables (opcionalmente filtrados por subject)
 */
router.get('/', (req, res) => {
  try {
    const { subjectId } = req.query;

    let deliverables;
    if (subjectId) {
      deliverables = getDeliverablesBySubject(subjectId);
    } else {
      // Todos los entregables (para admin)
      const stmt = db.prepare('SELECT * FROM deliverables ORDER BY uploaded_at DESC');
      deliverables = stmt.all();
    }

    res.json({
      success: true,
      deliverables
    });
  } catch (error) {
    console.error('Error fetching deliverables:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener entregables'
    });
  }
});

/**
 * GET /api/deliverables/:id
 * Detalle de un entregable
 */
router.get('/:id', (req, res) => {
  try {
    const deliverable = getDeliverableById(req.params.id);

    if (!deliverable) {
      return res.status(404).json({
        success: false,
        error: 'Entregable no encontrado'
      });
    }

    const files = getDeliverableFiles(req.params.id);

    res.json({
      success: true,
      deliverable,
      files
    });
  } catch (error) {
    console.error('Error fetching deliverable:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener entregable'
    });
  }
});

/**
 * POST /api/deliverables
 * Subir nuevo entregable (multiples archivos)
 */
router.post('/', upload.array('files', 50), async (req, res) => {
  try {
    const { subjectId, title, description, studentId } = req.body;

    if (!subjectId || !title) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: subjectId, title'
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

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se subieron archivos'
      });
    }

    // Crear carpeta para este entregable
    const deliverableId = uuidv4();
    const deliverableDir = path.join(process.cwd(), 'uploads', 'deliverables', deliverableId);
    fs.mkdirSync(deliverableDir, { recursive: true });

    // Mover archivos a la carpeta
    const fileRecords = [];
    for (const file of req.files) {
      // Extraer ruta relativa del nombre original (si se envio con webkitdirectory)
      const relativePath = req.body[`path_${file.originalname}`] || file.originalname;
      const targetPath = path.join(deliverableDir, relativePath);

      // Crear subdirectorios si es necesario
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Mover archivo
      fs.renameSync(file.path, targetPath);

      // Clasificar archivo
      const { type, language, sectionId } = classifyFile(relativePath);
      const preview = readFilePreview(targetPath);

      fileRecords.push({
        deliverableId,
        filename: path.basename(relativePath),
        relativePath,
        filePath: targetPath,
        fileType: type,
        language,
        sectionId,
        fileSize: file.size,
        contentPreview: preview
      });
    }

    // Crear registro del entregable
    const deliverable = createDeliverable({
      id: deliverableId,
      subjectId,
      studentId,
      title,
      description,
      folderPath: deliverableDir,
      fileCount: fileRecords.length
    });

    // Guardar archivos en DB
    for (const record of fileRecords) {
      addDeliverableFile(record);
    }

    res.status(201).json({
      success: true,
      deliverable,
      fileCount: fileRecords.length
    });

  } catch (error) {
    console.error('Error uploading deliverable:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al subir entregable'
    });
  }
});

/**
 * POST /api/deliverables/:id/analyze
 * Analizar entregable con Claude
 */
router.post('/:id/analyze', async (req, res) => {
  try {
    const deliverable = getDeliverableById(req.params.id);

    if (!deliverable) {
      return res.status(404).json({
        success: false,
        error: 'Entregable no encontrado'
      });
    }

    // Iniciar analisis (asincrono)
    res.json({
      success: true,
      message: 'Analisis iniciado',
      deliverableId: req.params.id
    });

    // Ejecutar analisis en background
    analyzeDeliverable(req.params.id).catch(err => {
      console.error('Background analysis error:', err);
    });

  } catch (error) {
    console.error('Error starting analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar analisis'
    });
  }
});

/**
 * GET /api/deliverables/:id/analysis
 * Obtener resultados del analisis
 */
router.get('/:id/analysis', (req, res) => {
  try {
    const deliverable = getDeliverableById(req.params.id);

    if (!deliverable) {
      return res.status(404).json({
        success: false,
        error: 'Entregable no encontrado'
      });
    }

    const analysis = getDeliverableAnalysis(req.params.id);

    res.json({
      success: true,
      status: deliverable.status,
      analysis
    });
  } catch (error) {
    console.error('Error fetching analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener analisis'
    });
  }
});

/**
 * GET /api/deliverables/:id/files
 * Lista archivos de un entregable
 */
router.get('/:id/files', (req, res) => {
  try {
    const files = getDeliverableFiles(req.params.id);

    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener archivos'
    });
  }
});

export default router;
```

---

## 6. Componentes Frontend

### src/practice/DeliverableUploader.jsx

```jsx
import { useState, useRef } from 'react';
import api from '../shared/api';
import './DeliverableUploader.css';

function DeliverableUploader({ subjectId, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFolderSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setError(null);

    // Auto-generar titulo desde nombre de carpeta
    if (selectedFiles.length > 0 && !title) {
      const firstPath = selectedFiles[0].webkitRelativePath;
      const folderName = firstPath.split('/')[0];
      setTitle(folderName);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Selecciona una carpeta');
      return;
    }

    if (!title.trim()) {
      setError('Ingresa un titulo');
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('subjectId', subjectId);
      formData.append('title', title);
      formData.append('description', description);

      // Agregar archivos con sus rutas relativas
      for (const file of files) {
        formData.append('files', file);
        formData.append(`path_${file.name}`, file.webkitRelativePath);
      }

      const result = await api.uploadDeliverable(formData, (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(percent);
      });

      if (onUploadComplete) {
        onUploadComplete(result.deliverable);
      }

    } catch (err) {
      setError(err.message || 'Error al subir archivos');
    } finally {
      setUploading(false);
    }
  };

  const getFileStats = () => {
    const stats = {
      total: files.length,
      byType: {}
    };

    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      stats.byType[ext] = (stats.byType[ext] || 0) + 1;
    }

    return stats;
  };

  const stats = getFileStats();

  return (
    <div className="deliverable-uploader">
      <h2>Subir Trabajo</h2>

      <div className="upload-form">
        <div className="form-group">
          <label htmlFor="title">Titulo del trabajo</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: PUF Diseno - GesRAE"
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Descripcion (opcional)</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notas adicionales..."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Carpeta del trabajo</label>
          <div
            className="folder-dropzone"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleFolderSelect}
              style={{ display: 'none' }}
            />

            {files.length === 0 ? (
              <div className="dropzone-empty">
                <span className="icon">📁</span>
                <p>Click para seleccionar carpeta</p>
                <small>Sube la carpeta completa con Pregunta1-9/</small>
              </div>
            ) : (
              <div className="dropzone-selected">
                <span className="icon">✅</span>
                <p><strong>{stats.total}</strong> archivos seleccionados</p>
                <div className="file-types">
                  {Object.entries(stats.byType).map(([ext, count]) => (
                    <span key={ext} className="type-badge">
                      .{ext}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {uploading && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
            <span>{progress}%</span>
          </div>
        )}

        <button
          className="upload-button"
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
        >
          {uploading ? 'Subiendo...' : 'Subir Trabajo'}
        </button>
      </div>
    </div>
  );
}

export default DeliverableUploader;
```

### src/practice/AnalysisResults.jsx

```jsx
import { useState, useEffect } from 'react';
import api from '../shared/api';
import './AnalysisResults.css';

function AnalysisResults({ deliverableId }) {
  const [status, setStatus] = useState('loading');
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const data = await api.getDeliverableAnalysis(deliverableId);
        setStatus(data.status);
        setAnalysis(data.analysis);

        // Si aun esta analizando, polling
        if (data.status === 'analyzing') {
          setTimeout(fetchAnalysis, 3000);
        }
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    };

    fetchAnalysis();
  }, [deliverableId]);

  if (status === 'loading' || status === 'analyzing') {
    return (
      <div className="analysis-results loading">
        <div className="spinner" />
        <p>Analizando trabajo con Claude...</p>
        <small>Esto puede tardar unos segundos</small>
      </div>
    );
  }

  if (status === 'error' || error) {
    return (
      <div className="analysis-results error">
        <h3>Error en el analisis</h3>
        <p>{error || 'Error desconocido'}</p>
      </div>
    );
  }

  // Organizar analisis por tipo
  const overview = analysis?.find(a => a.analysis_type === 'overview')?.content;
  const strengths = analysis?.find(a => a.analysis_type === 'strengths')?.content || [];
  const weaknesses = analysis?.find(a => a.analysis_type === 'weaknesses')?.content || [];
  const recommendations = analysis?.find(a => a.analysis_type === 'recommendations')?.content || [];

  return (
    <div className="analysis-results">
      <h2>Resultados del Analisis</h2>

      {/* Overview */}
      {overview && (
        <section className="overview-section">
          <h3>Resumen General</h3>
          <p>{overview.summary}</p>
          <div className="scores">
            <div className="score">
              <span className="label">Completitud</span>
              <span className="value">{Math.round(overview.completeness * 100)}%</span>
            </div>
            <div className="score">
              <span className="label">Calidad</span>
              <span className="value">{Math.round(overview.quality * 100)}%</span>
            </div>
          </div>
        </section>
      )}

      {/* Fortalezas */}
      {strengths.length > 0 && (
        <section className="strengths-section">
          <h3>✅ Fortalezas</h3>
          <ul>
            {strengths.map((s, i) => (
              <li key={i}>
                <span className="area">{s.area}</span>
                <span className="description">{s.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Debilidades */}
      {weaknesses.length > 0 && (
        <section className="weaknesses-section">
          <h3>⚠️ Areas de Mejora</h3>
          <ul>
            {weaknesses.map((w, i) => (
              <li key={i} className={`severity-${w.severity || 'medium'}`}>
                <span className="area">{w.area}</span>
                <span className="description">{w.description}</span>
                {w.larmanRef && (
                  <span className="reference">Ver {w.larmanRef}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recomendaciones */}
      {recommendations.length > 0 && (
        <section className="recommendations-section">
          <h3>💡 Recomendaciones</h3>
          <ol>
            {recommendations.map((r, i) => (
              <li key={i} className={`priority-${r.priority || 'medium'}`}>
                <strong>{r.action}</strong>
                <p>{r.reason}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export default AnalysisResults;
```

---

## 7. API Client

```javascript
// src/shared/api.js - AGREGAR

// ============================================
// DELIVERABLES
// ============================================

async uploadDeliverable(formData, onProgress) {
  const response = await axios.post(`${this.baseUrl}/deliverables`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
  });
  return response.data;
},

async getDeliverables(subjectId = null) {
  const params = subjectId ? { subjectId } : {};
  const response = await axios.get(`${this.baseUrl}/deliverables`, { params });
  return response.data;
},

async getDeliverable(deliverableId) {
  const response = await axios.get(`${this.baseUrl}/deliverables/${deliverableId}`);
  return response.data;
},

async analyzeDeliverable(deliverableId) {
  const response = await axios.post(`${this.baseUrl}/deliverables/${deliverableId}/analyze`);
  return response.data;
},

async getDeliverableAnalysis(deliverableId) {
  const response = await axios.get(`${this.baseUrl}/deliverables/${deliverableId}/analysis`);
  return response.data;
},

async getDeliverableFiles(deliverableId) {
  const response = await axios.get(`${this.baseUrl}/deliverables/${deliverableId}/files`);
  return response.data;
},
```

---

## 8. Tests

### tests/backend/deliverables.test.js

```javascript
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import path from 'path';
import fs from 'fs';

describe('Deliverables API', () => {
  // Tests de unidad para el servicio
  describe('deliverableAnalyzer', () => {
    it('should classify markdown files correctly', () => {
      const { classifyFile } = require('../../server/services/deliverableAnalyzer.js');

      expect(classifyFile('Pregunta1_CasosDeUso/README.md')).toEqual({
        type: 'document',
        language: 'markdown',
        sectionId: 'casos_uso'
      });
    });

    it('should classify plantuml files correctly', () => {
      const { classifyFile } = require('../../server/services/deliverableAnalyzer.js');

      expect(classifyFile('Pregunta3_ModeloDominio/modelo.puml')).toEqual({
        type: 'diagram',
        language: 'plantuml',
        sectionId: 'modelo_dominio'
      });
    });

    it('should handle unknown sections', () => {
      const { classifyFile } = require('../../server/services/deliverableAnalyzer.js');

      expect(classifyFile('random/file.md').sectionId).toBeNull();
    });
  });

  // Tests de API con mocks
  describe('API endpoints', () => {
    let app;

    beforeAll(async () => {
      // Setup express app con mocks
      app = express();
      app.use(express.json());

      // Mock de rutas
      const router = (await import('../../server/routes/deliverables.js')).default;
      app.use('/api/deliverables', router);
    });

    it('GET /api/deliverables should return list', async () => {
      const res = await request(app).get('/api/deliverables');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/deliverables/:id should return 404 for invalid id', async () => {
      const res = await request(app).get('/api/deliverables/nonexistent');
      expect(res.status).toBe(404);
    });

    it('POST /api/deliverables should require subjectId and title', async () => {
      const res = await request(app)
        .post('/api/deliverables')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('requeridos');
    });
  });
});
```

---

## 9. Criterios de Aceptacion

### Tests que deben pasar

```bash
npm test -- --testPathPattern=deliverables.test.js
```

### Validacion Manual

- [ ] Subir carpeta con estructura Pregunta1-9/
- [ ] Ver lista de archivos subidos
- [ ] Iniciar analisis con Claude
- [ ] Ver resultados: overview, fortalezas, debilidades
- [ ] Polling funciona mientras analiza

### Flujo E2E

1. Navegar a `/subjects/ds`
2. Click "Subir trabajo"
3. Seleccionar carpeta del trabajo
4. Click "Subir"
5. Ver progreso de upload
6. Click "Analizar"
7. Esperar resultado
8. Ver fortalezas y debilidades

---

## 10. Siguiente Fase

Una vez completada esta fase, se puede subir y analizar trabajos.
La siguiente es **FASE_3_TEST_QUESTION_GENERATION.md** que genera preguntas tipo test basadas en el analisis.
