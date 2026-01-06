/**
 * Question Generator Service (Fase 3)
 * Generates test questions BASED ON REAL EXAM QUESTIONS
 * Uses Claude Agent SDK to create variations of real questions
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  getGenerationSessionById,
  getSubjectById,
  updateGenerationSessionStatus,
  addGeneratedQuestion,
  getQuestionsByTopic,
  getAllTopics
} from '../database.js';

const TIMEOUT_MS = 120000; // 2 minutes for generation

/**
 * Get sample real questions for each topic
 * @param {string} subjectId - Subject ID
 * @param {Array} topicFocus - Topics to focus on (optional)
 * @param {number} samplesPerTopic - Number of samples per topic
 * @returns {Array} Sample questions
 */
function getSampleRealQuestions(subjectId, topicFocus = null, samplesPerTopic = 3) {
  const topics = getAllTopics(subjectId);
  const samples = [];

  for (const topic of topics) {
    // If topicFocus is specified, only get questions from those topics
    if (topicFocus && topicFocus.length > 0) {
      const topicMatches = topicFocus.some(focus =>
        topic.topic.toLowerCase().includes(focus.toLowerCase()) ||
        focus.toLowerCase().includes(topic.topic.toLowerCase())
      );
      if (!topicMatches) continue;
    }

    const questions = getQuestionsByTopic(topic.topic, subjectId);

    // Get random samples from this topic
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    const topicSamples = shuffled.slice(0, samplesPerTopic);

    samples.push(...topicSamples.map(q => ({
      ...q,
      sourceTopic: topic.topic
    })));
  }

  return samples;
}

/**
 * Format a question for the prompt
 * @param {Object} q - Question object
 * @returns {string} Formatted question text
 */
function formatQuestionForPrompt(q) {
  const options = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
  let text = `PREGUNTA (${q.sourceTopic || q.topic}):\n${q.content}\n`;
  text += `a) ${options.a}\n`;
  text += `b) ${options.b}\n`;
  text += `c) ${options.c}\n`;
  text += `d) ${options.d}\n`;
  return text;
}

/**
 * Generate test questions for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} Generated questions
 */
export async function generateTestQuestions(sessionId) {
  const session = getGenerationSessionById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const subject = getSubjectById(session.subject_id);
  if (!subject) {
    throw new Error('Subject not found');
  }

  // Update status to generating
  updateGenerationSessionStatus(sessionId, 'generating');

  try {
    // Get real questions as examples
    const topicFocus = session.topic_focus ? JSON.parse(session.topic_focus) : null;
    const realQuestions = getSampleRealQuestions(session.subject_id, topicFocus, 4);

    console.log(`[QuestionGenerator] Found ${realQuestions.length} real questions as examples`);

    if (realQuestions.length === 0) {
      throw new Error('No real questions found to base generation on');
    }

    // Build prompt with real questions
    const prompt = buildGenerationPrompt(subject, session, realQuestions);

    console.log(`[QuestionGenerator] Generating ${session.question_count} questions for subject: ${subject.name}`);

    // Call Claude Agent SDK
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), TIMEOUT_MS);

    let fullResponse = '';

    try {
      const response = query({
        prompt: prompt,
        abortController: abortController,
        options: {
          maxTurns: 1
        }
      });

      for await (const message of response) {
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              fullResponse += block.text;
            }
          }
        }
        if (message.type === 'result' && message.result && !fullResponse) {
          fullResponse = message.result;
        }
      }

      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        throw new Error('Claude timeout after 2 minutes');
      }
      throw err;
    }

    // Extract text response
    const responseText = fullResponse;
    console.log(`[QuestionGenerator] Response length: ${responseText.length}`);

    // Parse questions from response
    const questions = parseGeneratedQuestions(responseText);
    console.log(`[QuestionGenerator] Parsed ${questions.length} questions`);

    if (questions.length === 0) {
      throw new Error('No valid questions were generated');
    }

    // Save questions to database
    let questionNumber = 1;
    for (const q of questions) {
      addGeneratedQuestion({
        sessionId,
        questionNumber: questionNumber++,
        content: q.content,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        wrongExplanations: q.wrongExplanations || null,
        rationale: q.rationale || null,
        targetedWeakness: q.targetedWeakness || null,
        basedOnSection: q.section || q.basedOn || null,
        difficulty: q.difficulty || 'medium'
      });
    }

    // Update status to completed
    updateGenerationSessionStatus(sessionId, 'completed');

    return questions;

  } catch (error) {
    console.error('[QuestionGenerator] Error:', error.message);
    updateGenerationSessionStatus(sessionId, 'error', error.message);
    throw error;
  }
}

/**
 * Build the prompt for question generation BASED ON REAL QUESTIONS
 * @param {Object} subject - Subject data
 * @param {Object} session - Session data
 * @param {Array} realQuestions - Real questions to use as examples
 * @returns {string} Prompt text
 */
function buildGenerationPrompt(subject, session, realQuestions) {
  const count = session.question_count || 10;
  const difficulty = session.difficulty || 'mixed';

  // Format real questions as examples
  const examplesText = realQuestions.map((q, i) =>
    `--- Ejemplo ${i + 1} ---\n${formatQuestionForPrompt(q)}`
  ).join('\n\n');

  // Difficulty instructions
  let difficultyInstructions = '';
  if (difficulty === 'mixed') {
    difficultyInstructions = 'Varia la dificultad: algunas mas faciles, otras mas dificiles que los ejemplos.';
  } else if (difficulty === 'easy') {
    difficultyInstructions = 'Haz las preguntas MAS FACILES que los ejemplos (conceptos basicos).';
  } else if (difficulty === 'hard') {
    difficultyInstructions = 'Haz las preguntas MAS DIFICILES que los ejemplos (casos complejos).';
  }

  return `Eres un profesor experto en Bases de Datos Avanzadas creando preguntas de examen.

## PREGUNTAS REALES DE EXAMEN (EJEMPLOS)

Aqui tienes ${realQuestions.length} preguntas REALES de examenes anteriores.
DEBES generar preguntas SIMILARES en estilo, formato y dificultad.

${examplesText}

## TAREA

Genera exactamente ${count} preguntas NUEVAS tipo TEST (a/b/c/d) basandote en los ejemplos anteriores.

## REGLAS CRITICAS

1. **BASAR EN EJEMPLOS REALES**: Cada pregunta debe seguir el MISMO estilo que los ejemplos
2. **VARIAR DATOS**: Cambia los numeros, nombres de relaciones, valores especificos
3. **MISMO NIVEL TECNICO**: Usa la misma terminologia y nivel de detalle
4. **NO INVENTAR CONCEPTOS**: Solo usa conceptos que aparecen en los ejemplos
5. **PREGUNTAS ORIGINALES**: No copies textualmente, crea variaciones

${difficultyInstructions}

## TIPOS DE VARIACIONES PERMITIDAS

- Cambiar valores numericos (tamanio de bloques, numero de tuplas, etc.)
- Cambiar nombres de relaciones (r1, r2 -> s1, s2 o Employee, Department)
- Invertir la pregunta (si el ejemplo pregunta "cual es correcto", preguntar "cual es incorrecto")
- Combinar conceptos de diferentes ejemplos
- Cambiar el algoritmo o metodo especifico manteniendo el tema

## FORMATO DE RESPUESTA (JSON)

Responde UNICAMENTE con un array JSON valido:

[
  {
    "content": "Texto completo de la pregunta (incluyendo enunciados si aplica)...",
    "options": {
      "a": "Primera opcion",
      "b": "Segunda opcion",
      "c": "Tercera opcion",
      "d": "Cuarta opcion"
    },
    "correctAnswer": "b",
    "explanation": "Explicacion detallada de por que B es correcta...",
    "wrongExplanations": {
      "a": "A es incorrecta porque...",
      "c": "C es incorrecta porque...",
      "d": "D es incorrecta porque..."
    },
    "basedOn": "Descripcion de en que ejemplo real se basa",
    "difficulty": "easy|medium|hard"
  }
]

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.`;
}

/**
 * Parse generated questions from Claude response
 * @param {string} text - Response text
 * @returns {Array} Parsed questions
 */
function parseGeneratedQuestions(text) {
  // Clean response
  let cleaned = text.trim();

  // Remove markdown code blocks if present
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // Find JSON array
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('[QuestionGenerator] No JSON array found in response');
    console.error('[QuestionGenerator] Response preview:', cleaned.substring(0, 500));
    return [];
  }

  try {
    const questions = JSON.parse(jsonMatch[0]);

    // Validate each question
    return questions.filter(q => {
      if (!q.content || typeof q.content !== 'string') {
        console.warn('[QuestionGenerator] Question missing content');
        return false;
      }
      if (!q.options || typeof q.options !== 'object') {
        console.warn('[QuestionGenerator] Question missing options');
        return false;
      }
      if (!q.options.a || !q.options.b || !q.options.c || !q.options.d) {
        console.warn('[QuestionGenerator] Question missing some options');
        return false;
      }
      if (!q.correctAnswer || !['a', 'b', 'c', 'd'].includes(q.correctAnswer.toLowerCase())) {
        console.warn('[QuestionGenerator] Question has invalid correctAnswer');
        return false;
      }
      if (!q.explanation || typeof q.explanation !== 'string') {
        console.warn('[QuestionGenerator] Question missing explanation');
        return false;
      }

      // Normalize correctAnswer to lowercase
      q.correctAnswer = q.correctAnswer.toLowerCase();

      return true;
    });

  } catch (error) {
    console.error('[QuestionGenerator] JSON parse error:', error.message);
    console.error('[QuestionGenerator] JSON text:', jsonMatch[0].substring(0, 500));
    return [];
  }
}

export default {
  generateTestQuestions
};
