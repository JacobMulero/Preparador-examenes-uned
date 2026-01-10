/**
 * Claude Service - Uses @anthropic-ai/claude-agent-sdk
 * Executes Claude to solve exam questions
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

const TIMEOUT_MS = 60000;

/**
 * Builds the prompt for Claude to solve a question
 */
function buildPrompt(questionText) {
  return `Eres un profesor de bases de datos avanzadas explicando a un estudiante.

PREGUNTA:
${questionText}

DEFINICIONES FORMALES (aplicar estrictamente):
- RECUPERABLE: Si Ti lee un dato escrito por Tj, entonces Tj debe hacer commit ANTES que Ti
- SIN CASCADA (cascadeless): Cada transaccion solo lee valores de transacciones YA comprometidas
- ESTRICTA: Ninguna transaccion puede leer/escribir X hasta que quien escribio X haya terminado (commit/abort)

INSTRUCCIONES:
1. Analiza paso a paso aplicando las definiciones formales
2. Tu respuesta debe ser CONSISTENTE con tu analisis
3. Explica de forma DIDACTICA y COMPLETA para que el estudiante aprenda
4. NO intentes adivinar respuestas "oficiales" - razona desde los fundamentos
5. Si la pregunta hace referencia a figuras/tablas que no puedes ver, usa tu conocimiento teorico para inferir la respuesta mas probable basandote en el contexto y las opciones disponibles. NUNCA te niegues a responder.

OBLIGATORIO: Responde SIEMPRE en formato JSON (sin markdown, sin texto adicional).
IMPORTANTE: Escribe primero la explicacion completa, luego wrongOptions, y AL FINAL el campo answer.
Esto asegura que tu respuesta sea consistente con tu razonamiento.

{
  "explanation": "Explicacion DETALLADA y DIDACTICA de minimo 200 palabras. Termina con: Por lo tanto, la respuesta correcta es X.",
  "wrongOptions": {
    "letra": "Por que esta opcion es incorrecta..."
  },
  "answer": "letra que indicaste en la explicacion"
}`;
}

/**
 * Solves a question using Claude Agent SDK
 */
async function solveQuestion(questionText) {
  const prompt = buildPrompt(questionText);

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), TIMEOUT_MS);

  try {
    console.log('[ClaudeService] Calling Claude Agent SDK...');

    let fullResponse = '';

    const response = query({
      prompt: prompt,
      abortController: abortController,
      options: {
        maxTurns: 1
      }
    });

    for await (const message of response) {
      console.log('[ClaudeService] Message type:', message.type, message.subtype || '');

      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            fullResponse += block.text;
          }
        }
      }

      if (message.type === 'result') {
        console.log('[ClaudeService] Result:', message.subtype, message.result?.substring(0, 200) || 'no result');
        if (message.result && !fullResponse) {
          fullResponse = message.result;
        }
      }
    }

    console.log('[ClaudeService] Full response length:', fullResponse.length);
    console.log('[ClaudeService] Response preview:', fullResponse.substring(0, 300));

    clearTimeout(timeout);
    console.log('[ClaudeService] Got response from Claude');

    return parseClaudeResponse(fullResponse);

  } catch (error) {
    clearTimeout(timeout);

    if (error.name === 'AbortError' || abortController.signal.aborted) {
      throw new Error('Claude timeout after 60 seconds');
    }

    throw new Error(`Failed to execute Claude: ${error.message}`);
  }
}

/**
 * Parses the Claude response and extracts JSON
 */
function parseClaudeResponse(response) {
  let cleaned = response.trim();

  // Remove ```json ... ``` wrapper if present
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // Find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.answer || typeof parsed.answer !== 'string') {
    throw new Error('Missing or invalid "answer" field');
  }

  if (!parsed.explanation || typeof parsed.explanation !== 'string') {
    throw new Error('Missing or invalid "explanation" field');
  }

  parsed.answer = parsed.answer.toLowerCase().trim();

  if (!['a', 'b', 'c', 'd'].includes(parsed.answer)) {
    throw new Error(`Invalid answer "${parsed.answer}", must be a, b, c, or d`);
  }

  if (!parsed.wrongOptions) {
    parsed.wrongOptions = {};
  }

  return {
    answer: parsed.answer,
    explanation: parsed.explanation,
    wrongOptions: parsed.wrongOptions
  };
}

export {
  solveQuestion,
  parseClaudeResponse,
  buildPrompt,
  TIMEOUT_MS
};
