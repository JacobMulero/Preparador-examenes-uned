/**
 * Vision Service (Fase 2)
 * Uses Claude Agent SDK to analyze exam page images
 * Works with Claude Code headless mode (no API key needed)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getImageBase64, getImageMediaType } from './pdfService.js';

const TIMEOUT_MS = 120000; // 2 minutes for vision processing

/**
 * Build the prompt for exam page analysis (TEST mode - multiple choice)
 * @param {Object} subjectContext - Subject context (expertise, terminology)
 */
function buildExtractionPrompt(subjectContext) {
  const subjectInfo = subjectContext
    ? `Esta es una página de examen de ${subjectContext.name || 'una asignatura universitaria'}.`
    : 'Esta es una página de examen universitario.';

  return `${subjectInfo}

Analiza la imagen y extrae TODAS las preguntas de tipo test que encuentres.

Para cada pregunta, usa el siguiente formato Markdown:

## Pregunta N

[Texto completo de la pregunta, incluyendo cualquier contexto o enunciado compartido]

a) [Opción A]
b) [Opción B]
c) [Opción C]
d) [Opción D]

---

INSTRUCCIONES IMPORTANTES:
1. Preserva el texto exactamente como aparece, incluyendo fórmulas, símbolos y notación matemática
2. Si hay tablas o diagramas, descríbelos en texto entre corchetes: [Tabla: descripción] o [Diagrama: descripción]
3. Si una pregunta está incompleta (cortada por el borde de la página), márcala con [INCOMPLETO] al final
4. Numera las preguntas secuencialmente empezando desde 1
5. Si hay un enunciado compartido para varias preguntas, inclúyelo en cada pregunta que lo use
6. Separa cada pregunta con una línea horizontal (---)
7. Si no hay preguntas de tipo test en la página, responde: [NO HAY PREGUNTAS DE TEST EN ESTA PÁGINA]

FORMATO DE SALIDA: Solo devuelve el Markdown con las preguntas, sin explicaciones adicionales.`;
}

/**
 * Build the prompt for FULL CONTENT extraction (VERIFICATION mode)
 * Used for subjects like DS where we need all content, not just test questions
 * @param {Object} subjectContext - Subject context (expertise, terminology)
 */
function buildContentExtractionPrompt(subjectContext) {
  const subjectInfo = subjectContext
    ? `Esta es una página de un documento de ${subjectContext.name || 'una asignatura universitaria'}.`
    : 'Esta es una página de un documento universitario.';

  return `${subjectInfo}

Analiza la imagen y extrae TODO el contenido de texto que encuentres.

INSTRUCCIONES:
1. Extrae TODO el texto visible en la imagen, manteniendo la estructura
2. Si hay instrucciones o enunciados, inclúyelos completos
3. Si hay preguntas (de cualquier tipo: abiertas, de desarrollo, de verificación), extráelas con su numeración
4. Preserva el texto exactamente como aparece
5. Si hay referencias a trabajos, proyectos o nombres específicos (como "Trabajo_obligatorio_PUF25", "AgendarCosecha", etc.), inclúyelos exactamente
6. Si hay tablas, listas o diagramas, descríbelos lo mejor posible
7. Usa formato Markdown para estructurar el contenido

FORMATO DE SALIDA:
- Devuelve el contenido en Markdown
- Usa ## para títulos/secciones
- Usa listas numeradas para preguntas
- Preserva nombres técnicos exactamente como aparecen

IMPORTANTE: Extrae TODO el contenido, no solo preguntas tipo test.`;
}

/**
 * Create an async generator that yields a single message with image
 */
async function* createImageMessage(imagePath, prompt) {
  const base64Image = getImageBase64(imagePath);
  const mediaType = getImageMediaType(imagePath);

  yield {
    type: 'user',
    message: {
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
    }
  };
}

/**
 * Process a single exam page image with Claude Vision via Agent SDK
 * @param {string} imagePath - Path to the page image
 * @param {Object} subjectContext - Subject context
 * @param {Object} options - Additional options
 * @param {string} options.extractionMode - 'test' for multiple choice, 'content' for full content
 */
export async function processExamPage(imagePath, subjectContext = null, options = {}) {
  const extractionMode = options.extractionMode || 'test';
  const prompt = extractionMode === 'content'
    ? buildContentExtractionPrompt(subjectContext)
    : buildExtractionPrompt(subjectContext);

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), TIMEOUT_MS);

  try {
    console.log('[visionService] Processing image with Claude Agent SDK...');

    let fullResponse = '';

    const response = query({
      prompt: createImageMessage(imagePath, prompt),
      abortController: abortController,
      options: {
        maxTurns: 1
      }
    });

    for await (const message of response) {
      console.log('[visionService] Message type:', message.type, message.subtype || '');

      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            fullResponse += block.text;
          }
        }
      }

      if (message.type === 'result') {
        console.log('[visionService] Result received, length:', message.result?.length || 0);
        if (message.result && !fullResponse) {
          fullResponse = message.result;
        }
      }
    }

    clearTimeout(timeout);
    console.log('[visionService] Response length:', fullResponse.length);

    return {
      success: true,
      rawMarkdown: fullResponse,
      tokens: {
        input: 0,  // Agent SDK doesn't expose token counts
        output: 0,
        total: 0
      }
    };
  } catch (error) {
    clearTimeout(timeout);

    if (error.name === 'AbortError' || abortController.signal.aborted) {
      console.error('[visionService] Timeout after', TIMEOUT_MS / 1000, 'seconds');
      return {
        success: false,
        error: 'Vision processing timeout',
        rawMarkdown: null,
        tokens: { input: 0, output: 0, total: 0 }
      };
    }

    console.error('[visionService] Error processing page:', error.message);
    return {
      success: false,
      error: error.message,
      rawMarkdown: null,
      tokens: { input: 0, output: 0, total: 0 }
    };
  }
}

/**
 * Parse raw markdown into structured questions
 * @param {string} rawMarkdown - Raw markdown from Vision API
 * @param {string} examId - Exam ID for generating question IDs
 * @param {string} pageId - Page ID (optional)
 */
export function parseExtractedQuestions(rawMarkdown, examId, pageId = null) {
  const questions = [];

  // Check for "no questions" response
  if (rawMarkdown.includes('[NO HAY PREGUNTAS DE TEST EN ESTA PÁGINA]')) {
    return questions;
  }

  // Split by question headers
  const questionBlocks = rawMarkdown.split(/(?=## Pregunta \d+)/);

  for (const block of questionBlocks) {
    const trimmed = block.trim();
    if (!trimmed || !trimmed.startsWith('## Pregunta')) continue;

    // Extract question number
    const numberMatch = trimmed.match(/## Pregunta (\d+)/);
    if (!numberMatch) continue;

    const questionNumber = parseInt(numberMatch[1], 10);

    // Remove the header and separator
    let content = trimmed
      .replace(/## Pregunta \d+\n*/, '')
      .replace(/---\s*$/, '')
      .trim();

    // Try to extract options
    const options = {};
    const optionPattern = /^([a-d])\)\s*(.+)$/gm;
    let match;
    const optionMatches = [];

    while ((match = optionPattern.exec(content)) !== null) {
      options[match[1]] = match[2].trim();
      optionMatches.push({ index: match.index, length: match[0].length });
    }

    // Extract question text (everything before first option)
    let questionText = content;
    if (optionMatches.length > 0) {
      questionText = content.substring(0, optionMatches[0].index).trim();
    }

    // Check if incomplete
    const isIncomplete = content.includes('[INCOMPLETO]');
    if (isIncomplete) {
      questionText = questionText.replace('[INCOMPLETO]', '').trim();
    }

    // Generate unique ID including page info
    const pageNum = pageId ? pageId.split('_').pop() : 'x';
    questions.push({
      id: `${examId}_p${pageNum}_q${questionNumber}`,
      examId,
      pageId,
      questionNumber,
      rawContent: trimmed,
      normalizedContent: questionText,
      options: Object.keys(options).length > 0 ? options : null,
      isIncomplete,
      status: 'pending'
    });
  }

  return questions;
}

/**
 * Process all pages of an exam
 * @param {Array} pages - Array of page objects with imagePath
 * @param {Object} subjectContext - Subject context
 * @param {Function} onProgress - Progress callback (pageNumber, totalPages, result)
 */
export async function processExamPages(pages, subjectContext = null, onProgress = null) {
  const results = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNumber = i + 1;

    console.log(`[visionService] Processing page ${pageNumber}/${pages.length}`);

    const result = await processExamPage(page.imagePath, subjectContext);

    results.push({
      pageId: page.id,
      pageNumber,
      ...result
    });

    if (onProgress) {
      onProgress(pageNumber, pages.length, result);
    }

    // Small delay between API calls to avoid rate limiting
    if (i < pages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Parse raw markdown into open/verification questions (numbered lists)
 * Used for verification mode where questions are open-ended (1, 2, 3...)
 * @param {string} rawMarkdown - Raw markdown from Vision API
 * @param {string} examId - Exam ID for generating question IDs
 * @param {string} pageId - Page ID (optional)
 */
export function parseOpenQuestions(rawMarkdown, examId, pageId = null) {
  const questions = [];

  // Pattern for numbered questions: "1.", "2.", etc. at start of line
  // Also matches "1)" or "1.-" formats
  const questionPattern = /^(\d+)[.)\-]+\s+(.+?)(?=^\d+[.)\-]+\s+|^#{1,3}\s|^---|\*{3}|^Página\s+\d+|$)/gms;

  let match;
  while ((match = questionPattern.exec(rawMarkdown)) !== null) {
    const questionNumber = parseInt(match[1], 10);
    let content = match[2].trim();

    // Clean up the content
    content = content
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+/gm, '')
      .replace(/\s+$/gm, '')
      .trim();

    // Skip if content is too short (likely not a real question)
    if (content.length < 20) continue;

    const pageNum = pageId ? pageId.split('_').pop() : 'x';
    questions.push({
      id: `${examId}_p${pageNum}_q${questionNumber}`,
      examId,
      pageId,
      questionNumber,
      rawContent: match[0].trim(),
      normalizedContent: content,
      options: null, // Open questions don't have options
      isIncomplete: content.includes('[INCOMPLETO]'),
      status: 'pending',
      questionType: 'open' // Mark as open question
    });
  }

  return questions;
}

/**
 * Normalize/clean extracted questions
 * @param {Array} questions - Array of parsed questions
 */
export function normalizeQuestions(questions) {
  return questions.map(q => {
    let content = q.normalizedContent || q.rawContent;

    // Clean up common issues
    content = content
      .replace(/\n{3,}/g, '\n\n')  // Multiple newlines to double
      .replace(/^\s+/gm, '')        // Leading whitespace
      .replace(/\s+$/gm, '')        // Trailing whitespace
      .trim();

    return {
      ...q,
      normalizedContent: content
    };
  });
}

export default {
  processExamPage,
  parseExtractedQuestions,
  parseOpenQuestions,
  processExamPages,
  normalizeQuestions
};
