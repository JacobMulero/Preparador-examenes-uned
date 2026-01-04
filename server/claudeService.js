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
  return `Eres un experto en bases de datos avanzadas (query processing, optimizacion, transacciones, concurrencia, recuperacion).

PREGUNTA DE EXAMEN:

${questionText}

INSTRUCCIONES:
1. Analiza la pregunta aplicando las DEFINICIONES FORMALES de los conceptos
2. Razona paso a paso antes de decidir la respuesta
3. Tu respuesta DEBE ser consistente con tu razonamiento - NO cambies de opinion
4. NO intentes adivinar cual es la "respuesta oficial" - razona desde los fundamentos
5. Si tu analisis indica una respuesta, esa ES tu respuesta final

DEFINICIONES CLAVE (usar cuando aplique):
- Planificacion RECUPERABLE: Si Ti lee un dato escrito por Tj, entonces Tj debe hacer commit ANTES que Ti
- Planificacion SIN CASCADA (cascadeless): Cada transaccion solo lee valores escritos por transacciones YA comprometidas
- Planificacion ESTRICTA: Ninguna transaccion puede leer NI escribir un dato X hasta que la transaccion que escribio X haya terminado

Responde UNICAMENTE con un objeto JSON valido:

{
  "answer": "x",
  "explanation": "Razonamiento paso a paso que lleva a la respuesta...",
  "wrongOptions": {
    "y": "Por que esta opcion es incorrecta...",
    "z": "Por que esta opcion es incorrecta...",
    "w": "Por que esta opcion es incorrecta..."
  }
}

REQUISITOS:
- "answer": letra minuscula (a, b, c, o d) que sea CONSISTENTE con tu explanation
- "explanation": razonamiento completo y coherente
- "wrongOptions": explicacion de cada opcion incorrecta (no incluir la correcta)
- Sin texto adicional fuera del JSON`;
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
        // Extract text from content blocks
        for (const block of message.message.content) {
          if (block.type === 'text') {
            fullResponse += block.text;
          }
        }
      }

      // Also check for result message
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
