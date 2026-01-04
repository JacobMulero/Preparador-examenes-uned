# FASE 4: Modo Verificacion de Autoria

> **Objetivo:** Simular examen de verificacion de autoria con preguntas abiertas
> **Prerequisitos:** Fase 2 completada (trabajo subido)
> **Entregable:** Sesion de verificacion con comparacion vs trabajo entregado

---

## Resumen de Cambios

| Componente | Tipo | Descripcion |
|------------|------|-------------|
| `schema.sql` | Modificar | Tablas `extracted_data`, `verification_sessions`, `verification_answers` |
| `services/verificationExtractor.js` | Crear | Extrae datos de .puml y .md |
| `routes/verification.js` | Crear | Sesiones de verificacion |
| `VerificationSession.jsx` | Crear | UI de examen simulado |
| `OpenQuestionCard.jsx` | Crear | Pregunta abierta |
| `FreeTextAnswer.jsx` | Crear | Input de respuesta libre |
| `VerificationFeedback.jsx` | Crear | Comparacion vs trabajo |

---

## 1. Schema de Base de Datos

```sql
-- migration_005_verification.sql

-- Datos extraidos del entregable para comparar
CREATE TABLE IF NOT EXISTS extracted_data (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL,
  section_id TEXT NOT NULL,               -- casos_uso, modelo_dominio, etc.
  data_type TEXT NOT NULL,                -- use_cases, actors, objects, etc.
  extracted_value TEXT NOT NULL,          -- JSON con datos
  source_file TEXT,                       -- archivo origen
  extraction_method TEXT,                 -- plantuml_parse, markdown_parse
  confidence REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE
);

-- Sesiones de verificacion
CREATE TABLE IF NOT EXISTS verification_sessions (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL,
  student_id TEXT,
  status TEXT DEFAULT 'pending',          -- pending, in_progress, completed
  started_at DATETIME,
  completed_at DATETIME,
  total_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE
);

-- Preguntas de verificacion (generadas por sesion)
CREATE TABLE IF NOT EXISTS verification_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_number INTEGER NOT NULL,
  section_id TEXT NOT NULL,
  content TEXT NOT NULL,
  expected_elements TEXT NOT NULL,        -- JSON: elementos que deben aparecer
  grading_criteria TEXT,
  FOREIGN KEY (session_id) REFERENCES verification_sessions(id) ON DELETE CASCADE
);

-- Respuestas del alumno
CREATE TABLE IF NOT EXISTS verification_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  student_answer TEXT NOT NULL,           -- Respuesta libre del alumno
  matched_elements TEXT,                  -- JSON: elementos que coincidieron
  missing_elements TEXT,                  -- JSON: elementos que faltaron
  extra_elements TEXT,                    -- JSON: elementos extras (sospechoso)
  match_score REAL,                       -- 0.0-1.0
  is_valid BOOLEAN,
  feedback TEXT,
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES verification_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES verification_questions(id) ON DELETE CASCADE
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_extracted_data_deliverable ON extracted_data(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_extracted_data_section ON extracted_data(section_id);
CREATE INDEX IF NOT EXISTS idx_verification_sessions_deliverable ON verification_sessions(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_verification_answers_session ON verification_answers(session_id);
```

---

## 2. Database Helpers

```javascript
// server/database.js - AGREGAR

import { v4 as uuidv4 } from 'uuid';

// ============================================
// EXTRACTED DATA
// ============================================

export function saveExtractedData(data) {
  const id = data.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO extracted_data
    (id, deliverable_id, section_id, data_type, extracted_value, source_file, extraction_method, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.deliverableId,
    data.sectionId,
    data.dataType,
    JSON.stringify(data.extractedValue),
    data.sourceFile || null,
    data.extractionMethod || 'plantuml_parse',
    data.confidence || 1.0
  );
  return id;
}

export function getExtractedData(deliverableId) {
  const stmt = db.prepare(`
    SELECT * FROM extracted_data
    WHERE deliverable_id = ?
    ORDER BY section_id, data_type
  `);
  return stmt.all(deliverableId).map(row => ({
    ...row,
    extractedValue: JSON.parse(row.extracted_value)
  }));
}

export function getExtractedDataBySection(deliverableId, sectionId) {
  const stmt = db.prepare(`
    SELECT * FROM extracted_data
    WHERE deliverable_id = ? AND section_id = ?
  `);
  return stmt.all(deliverableId, sectionId).map(row => ({
    ...row,
    extractedValue: JSON.parse(row.extracted_value)
  }));
}

// ============================================
// VERIFICATION SESSIONS
// ============================================

export function createVerificationSession(data) {
  const id = data.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO verification_sessions (id, deliverable_id, student_id, status)
    VALUES (?, ?, ?, 'pending')
  `);
  stmt.run(id, data.deliverableId, data.studentId || null);
  return getVerificationSessionById(id);
}

export function getVerificationSessionById(id) {
  const stmt = db.prepare('SELECT * FROM verification_sessions WHERE id = ?');
  return stmt.get(id);
}

export function updateVerificationSessionStatus(id, status, score = null) {
  let query = `UPDATE verification_sessions SET status = ?`;
  const params = [status];

  if (status === 'in_progress') {
    query += ', started_at = datetime("now")';
  }
  if (status === 'completed') {
    query += ', completed_at = datetime("now"), total_score = ?';
    params.push(score);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);
  return getVerificationSessionById(id);
}

// ============================================
// VERIFICATION QUESTIONS
// ============================================

export function addVerificationQuestion(question) {
  const id = question.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO verification_questions
    (id, session_id, question_number, section_id, content, expected_elements, grading_criteria)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    question.sessionId,
    question.questionNumber,
    question.sectionId,
    question.content,
    JSON.stringify(question.expectedElements),
    question.gradingCriteria || null
  );
  return id;
}

export function getVerificationQuestions(sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM verification_questions
    WHERE session_id = ?
    ORDER BY question_number
  `);
  return stmt.all(sessionId).map(row => ({
    ...row,
    expectedElements: JSON.parse(row.expected_elements)
  }));
}

// ============================================
// VERIFICATION ANSWERS
// ============================================

export function saveVerificationAnswer(answer) {
  const id = answer.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO verification_answers
    (id, session_id, question_id, student_answer, matched_elements, missing_elements, extra_elements, match_score, is_valid, feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    answer.sessionId,
    answer.questionId,
    answer.studentAnswer,
    JSON.stringify(answer.matchedElements || []),
    JSON.stringify(answer.missingElements || []),
    JSON.stringify(answer.extraElements || []),
    answer.matchScore,
    answer.isValid ? 1 : 0,
    answer.feedback || null
  );
  return id;
}

export function getVerificationAnswers(sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM verification_answers
    WHERE session_id = ?
    ORDER BY answered_at
  `);
  return stmt.all(sessionId).map(row => ({
    ...row,
    matchedElements: JSON.parse(row.matched_elements),
    missingElements: JSON.parse(row.missing_elements),
    extraElements: JSON.parse(row.extra_elements)
  }));
}

export function getVerificationResults(sessionId) {
  const session = getVerificationSessionById(sessionId);
  const questions = getVerificationQuestions(sessionId);
  const answers = getVerificationAnswers(sessionId);

  // Combinar preguntas con respuestas
  const results = questions.map(q => {
    const answer = answers.find(a => a.question_id === q.id);
    return {
      question: q,
      answer: answer || null
    };
  });

  // Calcular score total
  const totalScore = answers.reduce((sum, a) => sum + (a.match_score || 0), 0) / questions.length;

  return {
    session,
    results,
    totalScore: (totalScore * 100).toFixed(1)
  };
}
```

---

## 3. Servicio de Extraccion

### server/services/verificationExtractor.js

```javascript
import fs from 'fs';
import path from 'path';
import {
  getDeliverableById,
  getDeliverableFiles,
  saveExtractedData
} from '../database.js';

/**
 * Extrae datos del entregable para comparar en verificacion
 */
export class VerificationExtractor {
  constructor(deliverableId) {
    this.deliverableId = deliverableId;
    this.deliverable = getDeliverableById(deliverableId);
    this.files = getDeliverableFiles(deliverableId);
    this.extracted = {};
  }

  /**
   * Encuentra archivo por seccion y extension
   */
  findFile(sectionId, extension) {
    return this.files.find(f =>
      f.section_id === sectionId && f.filename.endsWith(extension)
    );
  }

  /**
   * Lee contenido de archivo
   */
  readFile(file) {
    if (!file) return null;
    try {
      return fs.readFileSync(file.file_path, 'utf-8');
    } catch (e) {
      console.error(`Error reading ${file.file_path}:`, e.message);
      return null;
    }
  }

  /**
   * Extrae casos de uso del PlantUML
   */
  async extractUseCases() {
    const file = this.findFile('casos_uso', '.puml');
    const content = this.readFile(file);
    if (!content) return null;

    const useCases = [];
    const actors = [];
    const relations = [];

    // Regex para usecase "Nombre" as alias
    const ucRegex = /usecase\s+"([^"]+)"\s+as\s+(\w+)/gi;
    let match;
    while ((match = ucRegex.exec(content)) !== null) {
      useCases.push({ name: match[1], alias: match[2] });
    }

    // Regex para (Nombre) as alias
    const ucShortRegex = /\(([^)]+)\)\s+as\s+(\w+)/gi;
    while ((match = ucShortRegex.exec(content)) !== null) {
      if (!useCases.find(uc => uc.alias === match[2])) {
        useCases.push({ name: match[1], alias: match[2] });
      }
    }

    // Regex para actor
    const actorRegex = /actor\s+"?([^"\n]+)"?\s+as\s+(\w+)/gi;
    while ((match = actorRegex.exec(content)) !== null) {
      actors.push({ name: match[1].trim(), alias: match[2] });
    }

    // Regex para actor simple :nombre:
    const actorSimpleRegex = /:([^:]+):\s+as\s+(\w+)/gi;
    while ((match = actorSimpleRegex.exec(content)) !== null) {
      if (!actors.find(a => a.alias === match[2])) {
        actors.push({ name: match[1].trim(), alias: match[2] });
      }
    }

    // Regex para relaciones --> o --
    const relRegex = /(\w+)\s*(?:-->|--)\s*(\w+)/g;
    while ((match = relRegex.exec(content)) !== null) {
      relations.push({ from: match[1], to: match[2] });
    }

    const result = { useCases, actors, relations };

    // Guardar en BD
    saveExtractedData({
      deliverableId: this.deliverableId,
      sectionId: 'casos_uso',
      dataType: 'use_cases',
      extractedValue: useCases,
      sourceFile: file?.filename,
      extractionMethod: 'plantuml_parse'
    });

    saveExtractedData({
      deliverableId: this.deliverableId,
      sectionId: 'casos_uso',
      dataType: 'actors',
      extractedValue: actors,
      sourceFile: file?.filename,
      extractionMethod: 'plantuml_parse'
    });

    this.extracted.casos_uso = result;
    return result;
  }

  /**
   * Extrae objetos del modelo de dominio
   */
  async extractDomainObjects() {
    const file = this.findFile('modelo_dominio', '.puml');
    const content = this.readFile(file);
    if (!content) return null;

    const objects = [];

    // Regex para class "Nombre" o class Nombre
    const classRegex = /class\s+"?([^"{\n]+)"?\s*(?:\{|$)/gim;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1].trim();
      if (name && !objects.find(o => o.name === name)) {
        objects.push({ name, type: 'conceptual_object' });
      }
    }

    // Guardar
    saveExtractedData({
      deliverableId: this.deliverableId,
      sectionId: 'modelo_dominio',
      dataType: 'objects',
      extractedValue: objects,
      sourceFile: file?.filename,
      extractionMethod: 'plantuml_parse'
    });

    this.extracted.modelo_dominio = { objects };
    return this.extracted.modelo_dominio;
  }

  /**
   * Extrae instancias del diagrama de secuencia
   */
  async extractSequenceInstances() {
    const sequenceFiles = this.files.filter(f =>
      f.section_id === 'diagramas_interaccion' && f.filename.endsWith('.puml')
    );

    const instances = [];

    for (const file of sequenceFiles) {
      const content = this.readFile(file);
      if (!content) continue;

      // Regex para participant ":Clase" as inst o participant "inst:Clase"
      const participantRegex = /participant\s+"?:?([^"]+)"?\s+as\s+(\w+)/gi;
      let match;
      while ((match = participantRegex.exec(content)) !== null) {
        let className = match[1].replace(':', '').trim();
        let instanceName = match[2];

        // Si tiene formato instancia:Clase
        if (match[1].includes(':')) {
          const parts = match[1].split(':');
          instanceName = parts[0].trim() || match[2];
          className = parts[1].trim();
        }

        instances.push({
          instance: instanceName,
          class: className,
          format: `${instanceName}:${className}`,
          sourceFile: file.filename
        });
      }
    }

    // Guardar
    saveExtractedData({
      deliverableId: this.deliverableId,
      sectionId: 'diagramas_interaccion',
      dataType: 'instances',
      extractedValue: instances,
      sourceFile: sequenceFiles.map(f => f.filename).join(', '),
      extractionMethod: 'plantuml_parse'
    });

    this.extracted.diagramas_interaccion = { instances };
    return this.extracted.diagramas_interaccion;
  }

  /**
   * Extrae operacion del contrato
   */
  async extractContractOperation() {
    const file = this.findFile('contrato', '.md');
    const content = this.readFile(file);
    if (!content) return null;

    // Buscar patron: **Operacion:** nombre(args)
    const patterns = [
      /\*\*Operaci[oó]n:?\*\*:?\s*`?([^`\n(]+\([^)]*\))`?/i,
      /##\s*Contrato:?\s*`?([^`\n(]+\([^)]*\))`?/i,
      /Operaci[oó]n:\s*([^\n(]+\([^)]*\))/i
    ];

    let operation = null;
    for (const regex of patterns) {
      const match = content.match(regex);
      if (match) {
        operation = match[1].trim();
        break;
      }
    }

    if (operation) {
      saveExtractedData({
        deliverableId: this.deliverableId,
        sectionId: 'contrato',
        dataType: 'operation',
        extractedValue: { signature: operation },
        sourceFile: file?.filename,
        extractionMethod: 'markdown_parse'
      });
    }

    this.extracted.contrato = { operation };
    return this.extracted.contrato;
  }

  /**
   * Extrae clases software del DCD
   */
  async extractSoftwareClasses() {
    const file = this.findFile('dcd', '.puml');
    const content = this.readFile(file);
    if (!content) return null;

    const classes = [];

    // Regex para class con bloque
    const classBlockRegex = /class\s+"?([^"{\n]+)"?\s*\{([^}]*)\}/gim;
    let match;
    while ((match = classBlockRegex.exec(content)) !== null) {
      const className = match[1].trim();
      const body = match[2];

      // Extraer metodos
      const methods = [];
      const methodRegex = /[+\-#~]?\s*(\w+)\s*\([^)]*\)/g;
      let methodMatch;
      while ((methodMatch = methodRegex.exec(body)) !== null) {
        methods.push(methodMatch[1]);
      }

      classes.push({ name: className, methods });
    }

    // Guardar
    saveExtractedData({
      deliverableId: this.deliverableId,
      sectionId: 'dcd',
      dataType: 'software_classes',
      extractedValue: classes,
      sourceFile: file?.filename,
      extractionMethod: 'plantuml_parse'
    });

    this.extracted.dcd = { classes };
    return this.extracted.dcd;
  }

  /**
   * Extrae todos los datos
   */
  async extractAll() {
    await this.extractUseCases();
    await this.extractDomainObjects();
    await this.extractSequenceInstances();
    await this.extractContractOperation();
    await this.extractSoftwareClasses();

    return this.extracted;
  }
}

/**
 * Genera preguntas de verificacion basadas en datos extraidos
 */
export function generateVerificationQuestions(extractedData) {
  const questions = [];

  // Pregunta 1: Casos de uso y actores
  if (extractedData.casos_uso?.useCases?.length > 0) {
    const { useCases, actors, relations } = extractedData.casos_uso;
    questions.push({
      questionNumber: 1,
      sectionId: 'casos_uso',
      content: 'Enumere el nombre de los casos de uso de su respuesta a la pregunta 1 del trabajo y, para cada uno, indique los actores con los que interactua (actores principales y actores de apoyo).',
      expectedElements: useCases.map(uc => ({
        type: 'use_case',
        name: uc.name,
        actors: relations
          .filter(r => r.to === uc.alias)
          .map(r => actors.find(a => a.alias === r.from)?.name)
          .filter(Boolean)
      })),
      gradingCriteria: 'Debe listar TODOS los casos de uso con sus actores correctos'
    });
  }

  // Pregunta 3: Objetos del modelo de dominio
  if (extractedData.modelo_dominio?.objects?.length > 0) {
    questions.push({
      questionNumber: 3,
      sectionId: 'modelo_dominio',
      content: 'Enumere los objetos conceptuales que aparecen en su Modelo de Dominio e indique, para cada uno, cual es su rol funcional.',
      expectedElements: extractedData.modelo_dominio.objects.map(obj => ({
        type: 'conceptual_object',
        name: obj.name
      })),
      gradingCriteria: 'Debe listar TODOS los objetos conceptuales'
    });
  }

  // Pregunta 4: Instancias del diagrama de secuencia
  if (extractedData.diagramas_interaccion?.instances?.length > 0) {
    questions.push({
      questionNumber: 4,
      sectionId: 'diagramas_interaccion',
      content: 'Indique las instancias y clases que aparecen al inicio del diagrama de interaccion, usando el formato instancia:Clase.',
      expectedElements: extractedData.diagramas_interaccion.instances.map(inst => ({
        type: 'instance',
        format: inst.format,
        instance: inst.instance,
        class: inst.class
      })),
      gradingCriteria: 'Debe usar el formato instancia:Clase'
    });
  }

  // Pregunta 5: Operacion del contrato
  if (extractedData.contrato?.operation) {
    questions.push({
      questionNumber: 5,
      sectionId: 'contrato',
      content: 'Indique el nombre de la operacion cuyo contrato ha especificado, incluyendo sus argumentos.',
      expectedElements: [{
        type: 'operation',
        signature: extractedData.contrato.operation
      }],
      gradingCriteria: 'Debe coincidir con la firma del contrato'
    });
  }

  // Pregunta 6: Clases software del DCD
  if (extractedData.dcd?.classes?.length > 0) {
    questions.push({
      questionNumber: 6,
      sectionId: 'dcd',
      content: 'Enumere las clases puramente de software que aparecen en su DCD e indique las operaciones de cada una.',
      expectedElements: extractedData.dcd.classes.map(cls => ({
        type: 'software_class',
        name: cls.name,
        operations: cls.methods
      })),
      gradingCriteria: 'Debe listar clases con sus operaciones'
    });
  }

  return questions;
}

/**
 * Compara respuesta del alumno con elementos esperados
 */
export function compareAnswer(studentAnswer, expectedElements, sectionId) {
  const answer = studentAnswer.toLowerCase().trim();
  const matched = [];
  const missing = [];
  const extra = [];

  // Normalizar nombres esperados
  const expectedNames = expectedElements.map(e => {
    if (e.name) return e.name.toLowerCase();
    if (e.format) return e.format.toLowerCase();
    if (e.signature) return e.signature.toLowerCase();
    return '';
  }).filter(Boolean);

  // Buscar elementos esperados en la respuesta
  for (const element of expectedElements) {
    const name = element.name || element.format || element.signature || '';
    const nameLower = name.toLowerCase();

    // Buscar coincidencia flexible
    const found = answer.includes(nameLower) ||
                  answer.includes(name.split(/\s+/)[0].toLowerCase()); // Primera palabra

    if (found) {
      matched.push(name);
    } else {
      missing.push(name);
    }
  }

  // Buscar elementos extras (no esperados)
  // Esto es mas complejo, simplificamos detectando palabras largas no esperadas
  const words = answer.match(/\b[a-z]{4,}\b/gi) || [];
  for (const word of words) {
    const wordLower = word.toLowerCase();
    const isExpected = expectedNames.some(n => n.includes(wordLower) || wordLower.includes(n));
    const isCommon = ['para', 'cada', 'caso', 'actor', 'clase', 'objeto', 'nombre', 'operacion'].includes(wordLower);

    if (!isExpected && !isCommon && word.length > 5) {
      // Posible elemento extra (sospechoso)
      if (!extra.includes(word)) {
        extra.push(word);
      }
    }
  }

  // Calcular score
  const matchScore = expectedElements.length > 0
    ? matched.length / expectedElements.length
    : 0;

  const isValid = matchScore >= 0.7 && extra.length === 0;

  // Generar feedback
  let feedback = '';
  if (matchScore >= 0.9 && extra.length === 0) {
    feedback = 'Excelente! Has recordado correctamente los elementos de tu trabajo.';
  } else if (matchScore >= 0.7) {
    feedback = `Bien, pero te faltan algunos elementos: ${missing.join(', ')}`;
  } else if (matchScore >= 0.5) {
    feedback = `Necesitas repasar tu trabajo. Te faltan: ${missing.join(', ')}`;
  } else {
    feedback = 'Debes estudiar tu trabajo con mas atencion. No has recordado la mayoria de los elementos.';
  }

  if (extra.length > 0) {
    feedback += ` ATENCION: Mencionaste elementos que NO estan en tu trabajo: ${extra.join(', ')}. Esto seria sospechoso en el examen real.`;
  }

  return {
    matchedElements: matched,
    missingElements: missing,
    extraElements: extra,
    matchScore,
    isValid,
    feedback
  };
}

export default {
  VerificationExtractor,
  generateVerificationQuestions,
  compareAnswer
};
```

---

## 4. API Routes

### server/routes/verification.js

```javascript
import express from 'express';
import {
  getDeliverableById,
  getExtractedData,
  createVerificationSession,
  getVerificationSessionById,
  updateVerificationSessionStatus,
  addVerificationQuestion,
  getVerificationQuestions,
  saveVerificationAnswer,
  getVerificationResults
} from '../database.js';
import {
  VerificationExtractor,
  generateVerificationQuestions,
  compareAnswer
} from '../services/verificationExtractor.js';

const router = express.Router();

/**
 * POST /api/verification/extract/:deliverableId
 * Extraer datos del entregable para verificacion
 */
router.post('/extract/:deliverableId', async (req, res) => {
  try {
    const deliverable = getDeliverableById(req.params.deliverableId);
    if (!deliverable) {
      return res.status(404).json({
        success: false,
        error: 'Entregable no encontrado'
      });
    }

    const extractor = new VerificationExtractor(req.params.deliverableId);
    const extracted = await extractor.extractAll();

    res.json({
      success: true,
      extracted
    });
  } catch (error) {
    console.error('Error extracting:', error);
    res.status(500).json({
      success: false,
      error: 'Error al extraer datos'
    });
  }
});

/**
 * GET /api/verification/extracted/:deliverableId
 * Obtener datos ya extraidos
 */
router.get('/extracted/:deliverableId', (req, res) => {
  try {
    const data = getExtractedData(req.params.deliverableId);

    // Organizar por seccion
    const organized = {};
    for (const item of data) {
      if (!organized[item.section_id]) {
        organized[item.section_id] = {};
      }
      organized[item.section_id][item.data_type] = item.extractedValue;
    }

    res.json({
      success: true,
      extracted: organized
    });
  } catch (error) {
    console.error('Error fetching extracted:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener datos extraidos'
    });
  }
});

/**
 * POST /api/verification/session
 * Crear sesion de verificacion
 */
router.post('/session', async (req, res) => {
  try {
    const { deliverableId, studentId } = req.body;

    if (!deliverableId) {
      return res.status(400).json({
        success: false,
        error: 'deliverableId es requerido'
      });
    }

    const deliverable = getDeliverableById(deliverableId);
    if (!deliverable) {
      return res.status(404).json({
        success: false,
        error: 'Entregable no encontrado'
      });
    }

    // Verificar que hay datos extraidos
    let extracted = getExtractedData(deliverableId);
    if (extracted.length === 0) {
      // Extraer si no existe
      const extractor = new VerificationExtractor(deliverableId);
      await extractor.extractAll();
      extracted = getExtractedData(deliverableId);
    }

    // Organizar datos
    const organizedData = {};
    for (const item of extracted) {
      if (!organizedData[item.section_id]) {
        organizedData[item.section_id] = {};
      }
      organizedData[item.section_id][item.data_type] = item.extractedValue;
    }

    // Generar preguntas
    const questionsData = generateVerificationQuestions({
      casos_uso: {
        useCases: organizedData.casos_uso?.use_cases || [],
        actors: organizedData.casos_uso?.actors || [],
        relations: [] // TODO: extraer relaciones
      },
      modelo_dominio: {
        objects: organizedData.modelo_dominio?.objects || []
      },
      diagramas_interaccion: {
        instances: organizedData.diagramas_interaccion?.instances || []
      },
      contrato: organizedData.contrato?.operation ? { operation: organizedData.contrato.operation.signature } : null,
      dcd: {
        classes: organizedData.dcd?.software_classes || []
      }
    });

    // Crear sesion
    const session = createVerificationSession({ deliverableId, studentId });

    // Guardar preguntas
    for (const q of questionsData) {
      addVerificationQuestion({
        sessionId: session.id,
        ...q
      });
    }

    res.status(201).json({
      success: true,
      session,
      questionCount: questionsData.length
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
 * GET /api/verification/sessions/:id/questions
 * Obtener preguntas de verificacion
 */
router.get('/sessions/:id/questions', (req, res) => {
  try {
    const session = getVerificationSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    // Actualizar estado si es primera vez
    if (session.status === 'pending') {
      updateVerificationSessionStatus(req.params.id, 'in_progress');
    }

    const questions = getVerificationQuestions(req.params.id);

    // No enviar expectedElements al cliente (solo en backend)
    const safeQuestions = questions.map(q => ({
      id: q.id,
      questionNumber: q.question_number,
      sectionId: q.section_id,
      content: q.content
    }));

    res.json({
      success: true,
      questions: safeQuestions
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
 * POST /api/verification/sessions/:id/answer
 * Enviar respuesta y obtener comparacion
 */
router.post('/sessions/:id/answer', (req, res) => {
  try {
    const { questionId, answer } = req.body;

    if (!questionId || !answer) {
      return res.status(400).json({
        success: false,
        error: 'questionId y answer son requeridos'
      });
    }

    // Obtener pregunta con elementos esperados
    const questions = getVerificationQuestions(req.params.id);
    const question = questions.find(q => q.id === questionId);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Pregunta no encontrada'
      });
    }

    // Comparar respuesta
    const result = compareAnswer(answer, question.expectedElements, question.section_id);

    // Guardar respuesta
    saveVerificationAnswer({
      sessionId: req.params.id,
      questionId,
      studentAnswer: answer,
      ...result
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error processing answer:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar respuesta'
    });
  }
});

/**
 * GET /api/verification/sessions/:id/results
 * Obtener resultados finales
 */
router.get('/sessions/:id/results', (req, res) => {
  try {
    const results = getVerificationResults(req.params.id);

    // Actualizar estado si todas respondidas
    const allAnswered = results.results.every(r => r.answer !== null);
    if (allAnswered && results.session.status !== 'completed') {
      updateVerificationSessionStatus(req.params.id, 'completed', parseFloat(results.totalScore) / 100);
    }

    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener resultados'
    });
  }
});

export default router;
```

---

## 5. Componentes Frontend

### src/verification/VerificationSession.jsx

```jsx
import { useState, useEffect } from 'react';
import OpenQuestionCard from './OpenQuestionCard';
import FreeTextAnswer from './FreeTextAnswer';
import VerificationFeedback from './VerificationFeedback';
import VerificationResults from './VerificationResults';
import api from '../shared/api';
import './VerificationSession.css';

function VerificationSession({ sessionId }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [currentResult, setCurrentResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const data = await api.getVerificationQuestions(sessionId);
        setQuestions(data.questions);
      } catch (err) {
        console.error('Error loading questions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [sessionId]);

  const handleSubmitAnswer = async (answer) => {
    if (!answer.trim()) return;

    try {
      const result = await api.submitVerificationAnswer(sessionId, {
        questionId: questions[currentIndex].id,
        answer
      });

      setCurrentResult(result);
      setAnswers(prev => ({
        ...prev,
        [currentIndex]: { answer, result }
      }));

    } catch (err) {
      console.error('Error submitting answer:', err);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setCurrentResult(null);
    } else {
      setShowResults(true);
    }
  };

  if (loading) {
    return (
      <div className="verification-session loading">
        <p>Cargando preguntas...</p>
      </div>
    );
  }

  if (showResults) {
    return <VerificationResults sessionId={sessionId} />;
  }

  if (questions.length === 0) {
    return (
      <div className="verification-session empty">
        <p>No hay preguntas disponibles</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="verification-session">
      <header className="session-header">
        <h2>Verificacion de Autoria</h2>
        <div className="progress">
          Pregunta {currentIndex + 1} de {questions.length}
        </div>
      </header>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <OpenQuestionCard question={currentQuestion} />

      {!currentResult ? (
        <FreeTextAnswer
          onSubmit={handleSubmitAnswer}
          placeholder="Escribe tu respuesta aqui..."
        />
      ) : (
        <>
          <div className="submitted-answer">
            <h4>Tu respuesta:</h4>
            <p>{answers[currentIndex]?.answer}</p>
          </div>

          <VerificationFeedback result={currentResult} />

          <button className="next-button" onClick={handleNext}>
            {currentIndex < questions.length - 1 ? 'Siguiente pregunta' : 'Ver resultados'}
          </button>
        </>
      )}
    </div>
  );
}

export default VerificationSession;
```

### src/verification/OpenQuestionCard.jsx

```jsx
import './OpenQuestionCard.css';

const SECTION_LABELS = {
  casos_uso: 'Casos de Uso',
  modelo_dominio: 'Modelo de Dominio',
  diagramas_interaccion: 'Diagramas de Interaccion',
  contrato: 'Contrato',
  dcd: 'DCD'
};

function OpenQuestionCard({ question }) {
  return (
    <div className="open-question-card">
      <div className="question-header">
        <span className="question-number">Pregunta {question.questionNumber}</span>
        <span className="section-badge">
          {SECTION_LABELS[question.sectionId] || question.sectionId}
        </span>
      </div>

      <div className="question-content">
        {question.content}
      </div>

      <div className="question-hint">
        Esta pregunta se refiere a TU trabajo. La respuesta debe coincidir
        exactamente con lo que entregaste.
      </div>
    </div>
  );
}

export default OpenQuestionCard;
```

### src/verification/FreeTextAnswer.jsx

```jsx
import { useState } from 'react';
import './FreeTextAnswer.css';

function FreeTextAnswer({ onSubmit, placeholder }) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!answer.trim() || submitting) return;

    setSubmitting(true);
    await onSubmit(answer);
    setSubmitting(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit();
    }
  };

  return (
    <div className="free-text-answer">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={6}
        disabled={submitting}
      />

      <div className="answer-footer">
        <small>Ctrl + Enter para enviar</small>
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || submitting}
        >
          {submitting ? 'Comprobando...' : 'Comprobar respuesta'}
        </button>
      </div>
    </div>
  );
}

export default FreeTextAnswer;
```

### src/verification/VerificationFeedback.jsx

```jsx
import './VerificationFeedback.css';

function VerificationFeedback({ result }) {
  const scorePercent = Math.round(result.matchScore * 100);

  return (
    <div className={`verification-feedback ${result.isValid ? 'valid' : 'invalid'}`}>
      <div className="score-circle">
        <span className="score-value">{scorePercent}%</span>
        <span className="score-label">Coincidencia</span>
      </div>

      <div className="feedback-content">
        {result.matchedElements.length > 0 && (
          <div className="matched-elements">
            <h4>Elementos correctos</h4>
            <ul>
              {result.matchedElements.map((el, i) => (
                <li key={i} className="matched">{el}</li>
              ))}
            </ul>
          </div>
        )}

        {result.missingElements.length > 0 && (
          <div className="missing-elements">
            <h4>Te faltaron</h4>
            <ul>
              {result.missingElements.map((el, i) => (
                <li key={i} className="missing">{el}</li>
              ))}
            </ul>
          </div>
        )}

        {result.extraElements.length > 0 && (
          <div className="extra-elements warning">
            <h4>Elementos sospechosos</h4>
            <p>Mencionaste elementos que NO estan en tu trabajo:</p>
            <ul>
              {result.extraElements.map((el, i) => (
                <li key={i} className="extra">{el}</li>
              ))}
            </ul>
            <small>Esto seria una alerta en el examen real</small>
          </div>
        )}

        <div className="feedback-message">
          {result.feedback}
        </div>
      </div>
    </div>
  );
}

export default VerificationFeedback;
```

### src/verification/VerificationResults.jsx

```jsx
import { useState, useEffect } from 'react';
import api from '../shared/api';
import './VerificationResults.css';

function VerificationResults({ sessionId }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const data = await api.getVerificationResults(sessionId);
        setResults(data);
      } catch (err) {
        console.error('Error fetching results:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [sessionId]);

  if (loading) {
    return <div className="verification-results loading">Cargando resultados...</div>;
  }

  if (!results) {
    return <div className="verification-results error">Error al cargar resultados</div>;
  }

  const isPassing = parseFloat(results.totalScore) >= 70;

  return (
    <div className="verification-results">
      <h2>Resultados de Verificacion</h2>

      <div className={`total-score ${isPassing ? 'passing' : 'failing'}`}>
        <div className="score-value">{results.totalScore}%</div>
        <div className="score-label">
          {isPassing ? 'Aprobado' : 'Necesita mas estudio'}
        </div>
      </div>

      <div className="score-interpretation">
        {isPassing ? (
          <p>
            Conoces bien tu trabajo. En el examen real, obtendrias la
            <strong> nota integra</strong> de tu practica.
          </p>
        ) : (
          <p>
            Necesitas repasar tu trabajo. En el examen real, tu nota seria
            <strong> multiplicada por 0.3</strong> (penalizacion).
          </p>
        )}
      </div>

      <div className="results-breakdown">
        <h3>Desglose por pregunta</h3>
        {results.results.map((r, i) => (
          <div key={i} className="question-result">
            <div className="question-header">
              <span>Pregunta {r.question.question_number}</span>
              <span className={`score ${r.answer?.match_score >= 0.7 ? 'good' : 'bad'}`}>
                {r.answer ? `${Math.round(r.answer.match_score * 100)}%` : 'Sin respuesta'}
              </span>
            </div>
            {r.answer?.missing_elements?.length > 0 && (
              <div className="missing">
                Faltaron: {r.answer.missing_elements.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="actions">
        <button onClick={() => window.location.reload()}>
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}

export default VerificationResults;
```

---

## 6. API Client

```javascript
// src/shared/api.js - AGREGAR

// ============================================
// VERIFICATION
// ============================================

async extractVerificationData(deliverableId) {
  const response = await axios.post(`${this.baseUrl}/verification/extract/${deliverableId}`);
  return response.data;
},

async getExtractedData(deliverableId) {
  const response = await axios.get(`${this.baseUrl}/verification/extracted/${deliverableId}`);
  return response.data;
},

async createVerificationSession(deliverableId, studentId = null) {
  const response = await axios.post(`${this.baseUrl}/verification/session`, {
    deliverableId,
    studentId
  });
  return response.data;
},

async getVerificationQuestions(sessionId) {
  const response = await axios.get(`${this.baseUrl}/verification/sessions/${sessionId}/questions`);
  return response.data;
},

async submitVerificationAnswer(sessionId, { questionId, answer }) {
  const response = await axios.post(`${this.baseUrl}/verification/sessions/${sessionId}/answer`, {
    questionId,
    answer
  });
  return response.data;
},

async getVerificationResults(sessionId) {
  const response = await axios.get(`${this.baseUrl}/verification/sessions/${sessionId}/results`);
  return response.data;
},
```

---

## 7. Criterios de Aceptacion

### Tests que deben pasar

```bash
npm test -- --testPathPattern=verification.test.js
```

### Validacion Manual

- [ ] Extraer datos de archivos .puml y .md
- [ ] Crear sesion de verificacion
- [ ] Ver 5-6 preguntas abiertas
- [ ] Responder con texto libre
- [ ] Ver comparacion vs trabajo
- [ ] Ver score y feedback
- [ ] Ver resultados finales

### Flujo E2E

1. Ir a trabajo subido (DS)
2. Click "Preparar examen de verificacion"
3. Ver preguntas tipo examen real
4. Responder de memoria
5. Ver que faltaba/sobraba
6. Ver score total

---

## 8. Siguiente Fase

Una vez completada esta fase, se puede simular el examen de verificacion.
La siguiente es **FASE_5_PDF_PIPELINE.md** que permite procesar PDFs de examenes anteriores.
