/**
 * Verification Question Generator Service
 * Generates open-ended oral questions for verifying student authorship
 * Uses @anthropic-ai/claude-agent-sdk
 *
 * NOTA: Lee el contenido del entregable desde el pipeline de PDFs (exam_pages)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  getVerificationSessionById,
  updateVerificationSession,
  addVerificationQuestion,
  getSubjectById,
  getExamPdf,
  getExamPages,
  getExamPdfsBySubject
} from '../database.js';

const TIMEOUT_MS = 120000; // 2 minutes for generation

/**
 * Gets sample exam questions from processed PDFs of a subject
 * Excludes the deliverable itself (if provided)
 * @param {string} subjectId - Subject ID
 * @param {string} excludeId - PDF ID to exclude (the deliverable)
 * @returns {Object|null} Sample exam content
 */
function getSampleExamsContent(subjectId, excludeId = null) {
  const exams = getExamPdfsBySubject(subjectId);
  if (!exams || exams.length === 0) return null;

  // Filter completed exams, excluding the deliverable
  const completedExams = exams.filter(e =>
    e.status === 'completed' && e.id !== excludeId
  );

  if (completedExams.length === 0) return null;

  // Get content from up to 2 exams (to limit token usage)
  const sampleExams = completedExams.slice(0, 2);
  const samples = [];

  for (const exam of sampleExams) {
    const pages = getExamPages(exam.id);
    if (pages && pages.length > 0) {
      // Get first 2 pages of each exam as sample
      const samplePages = pages
        .slice(0, 2)
        .filter(p => p.processed_markdown || p.raw_markdown)
        .map(p => p.processed_markdown || p.raw_markdown)
        .join('\n');

      if (samplePages.length > 0) {
        samples.push({
          filename: exam.filename,
          content: samplePages.substring(0, 3000) // Limit each sample
        });
      }
    }
  }

  if (samples.length === 0) return null;

  return {
    count: samples.length,
    samples: samples
  };
}

/**
 * Gets the deliverable content from processed PDF pages
 * @param {string} deliverableId - PDF exam ID
 * @returns {string} Combined markdown content from all pages
 */
function getDeliverableContent(deliverableId) {
  if (!deliverableId) return null;

  const pdf = getExamPdf(deliverableId);
  if (!pdf || pdf.status !== 'completed') return null;

  const pages = getExamPages(deliverableId);
  if (!pages || pages.length === 0) return null;

  // Combine all page content
  const content = pages
    .filter(p => p.processed_markdown || p.raw_markdown)
    .map(p => p.processed_markdown || p.raw_markdown)
    .join('\n\n---\n\n');

  // Return null if no content found
  if (!content || content.trim().length === 0) return null;

  return {
    filename: pdf.filename,
    pageCount: pdf.page_count,
    content: content,
    wordCount: content.split(/\s+/).filter(Boolean).length
  };
}

/**
 * Generates verification questions for a session
 * @param {string} sessionId - Session ID
 */
async function generateVerificationQuestions(sessionId) {
  const session = getVerificationSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const subject = getSubjectById(session.subject_id);
  if (!subject) {
    throw new Error('Subject not found');
  }

  // Get deliverable content if available
  const deliverableContent = getDeliverableContent(session.deliverable_id);

  // Get sample exams from the subject as guide for question style
  const sampleExams = getSampleExamsContent(session.subject_id, session.deliverable_id);

  // Update status to generating
  updateVerificationSession(sessionId, { status: 'generating' });

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), TIMEOUT_MS);

  try {
    console.log('[VerificationGenerator] Generating questions for session:', sessionId);
    if (deliverableContent) {
      console.log('[VerificationGenerator] Using deliverable:', deliverableContent.filename, '-', deliverableContent.wordCount, 'words');
    }
    if (sampleExams) {
      console.log('[VerificationGenerator] Using', sampleExams.count, 'sample exams as guide');
    }

    const prompt = buildVerificationPrompt(subject, session, deliverableContent, sampleExams);

    let fullResponse = '';

    const response = query({
      prompt: prompt,
      abortController: abortController,
      options: {
        maxTurns: 1
      }
    });

    for await (const message of response) {
      console.log('[VerificationGenerator] Message type:', message.type, message.subtype || '');

      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            fullResponse += block.text;
          }
        }
      }

      if (message.type === 'result') {
        console.log('[VerificationGenerator] Result received');
        if (message.result && !fullResponse) {
          fullResponse = message.result;
        }
      }
    }

    clearTimeout(timeout);
    console.log('[VerificationGenerator] Response length:', fullResponse.length);

    // Parse questions
    const questions = parseVerificationQuestions(fullResponse);

    if (questions.length === 0) {
      throw new Error('No questions generated');
    }

    // Save questions to database
    let questionNumber = 1;
    for (const q of questions) {
      addVerificationQuestion({
        sessionId,
        questionNumber: questionNumber++,
        content: q.content,
        expectedAnswer: q.expectedAnswer,
        evaluationCriteria: q.criteria,
        relatedSection: q.section,
        difficulty: q.difficulty
      });
    }

    // Update status to ready
    updateVerificationSession(sessionId, { status: 'ready' });

    console.log('[VerificationGenerator] Generated', questions.length, 'questions');
    return questions;

  } catch (error) {
    clearTimeout(timeout);

    if (error.name === 'AbortError' || abortController.signal.aborted) {
      updateVerificationSession(sessionId, { status: 'error' });
      throw new Error('Generation timeout after 2 minutes');
    }

    updateVerificationSession(sessionId, { status: 'error' });
    throw new Error(`Failed to generate questions: ${error.message}`);
  }
}

/**
 * Builds the prompt for generating verification questions
 * @param {Object} subject - Subject data
 * @param {Object} session - Session data
 * @param {Object} deliverableContent - Extracted content from PDF (optional)
 * @param {Object} sampleExams - Sample exam questions as guide (optional)
 */
function buildVerificationPrompt(subject, session, deliverableContent = null, sampleExams = null) {
  const claudeContext = subject.claudeContext || {};
  const questionCount = session.question_count || 5;
  const focusAreas = session.focusAreas || [];

  let focusAreasText = '';
  if (focusAreas.length > 0) {
    focusAreasText = `\n\nAREAS DE ENFOQUE: ${focusAreas.join(', ')}`;
  }

  let studentContext = '';
  if (session.student_name) {
    studentContext = `\nALUMNO: ${session.student_name}`;
  }

  // Build sample exams section if available (guide for question style)
  let sampleExamsSection = '';
  if (sampleExams && sampleExams.samples && sampleExams.samples.length > 0) {
    sampleExamsSection = `

=== EXAMENES DE REFERENCIA (estilo de preguntas) ===
Estos son ejemplos de examenes anteriores de la asignatura.
Usa estos ejemplos como GUIA para el ESTILO y FORMATO de las preguntas:

`;
    for (const sample of sampleExams.samples) {
      sampleExamsSection += `--- ${sample.filename} ---\n${sample.content}\n\n`;
    }
    sampleExamsSection += `=== FIN DE EXAMENES DE REFERENCIA ===
`;
  }

  // Build deliverable section if content available
  let deliverableSection = '';
  if (deliverableContent && deliverableContent.content) {
    // Limit content to avoid token overflow (max ~15000 chars)
    const maxContentLength = 15000;
    let content = deliverableContent.content;
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + '\n\n[... contenido truncado por longitud ...]';
    }

    deliverableSection = `

=== TRABAJO DEL ALUMNO A VERIFICAR ===
Archivo: ${deliverableContent.filename}
Paginas: ${deliverableContent.pageCount}
Palabras: ${deliverableContent.wordCount}

CONTENIDO EXTRAIDO:
${content}
=== FIN DEL TRABAJO ===

INSTRUCCIONES ESPECIFICAS:
- Las preguntas DEBEN hacer referencia a elementos CONCRETOS del trabajo mostrado arriba
- Pregunta sobre decisiones ESPECIFICAS que aparecen en el documento
- Menciona nombres, clases, metodos, o elementos que el alumno uso
- NO hagas preguntas genericas que cualquiera podria responder
`;
  } else {
    deliverableSection = `

NOTA: No se ha proporcionado el trabajo del alumno.
Las preguntas seran mas generales sobre la metodologia y conceptos de ${subject.name}.
`;
  }

  return `Eres un profesor experto en ${claudeContext.expertise || subject.name}.
${studentContext}
${sampleExamsSection}
${deliverableSection}
TAREA: Genera ${questionCount} preguntas de VERIFICACION ORAL para comprobar que el alumno ha hecho su propio trabajo.

TIPO DE PREGUNTAS:
- Preguntas ABIERTAS que requieren explicacion oral
- NO son tipo test (NO tienen opciones a/b/c/d)
- El alumno debe responder oralmente explicando su razonamiento
- Deben verificar comprension PROFUNDA, no solo memorizacion
- Preguntas que solo puede responder quien hizo el trabajo
${focusAreasText}

TIPOS DE PREGUNTAS A INCLUIR:
1. Preguntas de JUSTIFICACION: "Explica por que elegiste X en lugar de Y"
2. Preguntas de ALTERNATIVAS: "Que otras opciones consideraste y por que las descartaste"
3. Preguntas de CONSECUENCIAS: "Que pasaria si cambiaras X por Z"
4. Preguntas de PROCESO: "Describe paso a paso como llegaste a esta decision"
5. Preguntas de CONEXION: "Como se relaciona esta parte con el resto del trabajo"

FORMATO JSON (responde SOLO con este JSON, sin texto adicional):

[
  {
    "content": "Pregunta abierta completa que el profesor leera al alumno...",
    "expectedAnswer": "Puntos clave que el alumno deberia mencionar en su respuesta...",
    "criteria": ["criterio_1", "criterio_2", "criterio_3"],
    "section": "area_del_trabajo",
    "difficulty": "medium"
  }
]

CRITERIOS DE EVALUACION SUGERIDOS:
- "comprension_concepto": Entiende los conceptos fundamentales
- "justificacion_decisiones": Puede explicar por que tomo ciertas decisiones
- "alternativas_consideradas": Conoce otras opciones y sabe por que no las uso
- "impacto_cambios": Entiende las consecuencias de modificaciones
- "coherencia_general": Su respuesta es consistente con el trabajo
- "profundidad_tecnica": Demuestra conocimiento tecnico detallado

Dificultades: easy (preguntas basicas), medium (requiere reflexion), hard (analisis profundo)

IMPORTANTE:
- Las preguntas deben ser IMPOSIBLES de responder para alguien que no hizo el trabajo
- Si hay contenido del trabajo disponible, TODAS las preguntas deben referirse a elementos CONCRETOS del documento
- Responde SOLO con el JSON, sin texto adicional ni markdown`;
}

/**
 * Parses the verification questions from Claude response
 * @param {string} response - Raw response from Claude
 */
function parseVerificationQuestions(response) {
  let cleaned = response.trim();

  // Remove ```json ... ``` wrapper if present
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // Find JSON array
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('[VerificationGenerator] No JSON array found in response');
    return [];
  }

  try {
    const questions = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(questions)) {
      console.error('[VerificationGenerator] Response is not an array');
      return [];
    }

    // Validate and normalize questions
    return questions.filter(q => {
      if (!q.content || typeof q.content !== 'string') {
        console.warn('[VerificationGenerator] Skipping question without content');
        return false;
      }
      return true;
    }).map(q => ({
      content: q.content,
      expectedAnswer: q.expectedAnswer || '',
      criteria: Array.isArray(q.criteria) ? q.criteria : [],
      section: q.section || 'general',
      difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium'
    }));

  } catch (error) {
    console.error('[VerificationGenerator] Error parsing JSON:', error);
    return [];
  }
}

export {
  generateVerificationQuestions,
  buildVerificationPrompt,
  parseVerificationQuestions,
  getDeliverableContent,
  getSampleExamsContent,
  TIMEOUT_MS
};
