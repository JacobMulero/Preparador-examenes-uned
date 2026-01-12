#!/usr/bin/env node
/**
 * Analyze Dependencies Script
 *
 * Uses Claude to analyze all questions per topic and detect
 * which questions need context from other questions.
 *
 * Usage:
 *   npm run server &                           # Start backend first
 *   node scripts/analyze-dependencies.js       # Run analysis
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'server', 'db', 'exam.db');
const TIMEOUT_MS = 120000; // 2 min for batch analysis

/**
 * Build prompt for Claude to analyze dependencies in a topic
 */
function buildAnalysisPrompt(topic, questions) {
  const questionsText = questions.map(q => {
    let text = `### Pregunta ${q.question_number} (ID: ${q.id})\n`;
    if (q.shared_statement) {
      text += `**Enunciado:** ${q.shared_statement}\n`;
    }
    text += q.content;
    return text;
  }).join('\n\n---\n\n');

  return `Eres un experto analizando preguntas de examen de bases de datos.

TEMA: ${topic}
TOTAL PREGUNTAS: ${questions.length}

${questionsText}

---

TAREA: Analiza TODAS las preguntas e identifica cuáles NECESITAN contexto de otra pregunta para ser entendidas.

BUSCA:
1. Frases como "Continuando con el ejercicio anterior" o "Continuando con la pregunta anterior"
2. Referencias a "Tabla X", "Figura X" o "Enunciado X" que NO están definidas en la misma pregunta
3. Frases como "la planificación mostrada", "el diagrama anterior", "según el ejercicio previo"
4. Cualquier pregunta que asume información no presente en su propio texto

IMPORTANTE:
- Solo reporta dependencias REALES donde falta información
- Si una pregunta tiene su propio "Enunciado:" NO necesita contexto externo
- Las dependencias suelen ser de la pregunta inmediatamente anterior (N-1) pero verifica

RESPONDE SOLO CON JSON VÁLIDO (sin texto adicional, sin markdown):
{
  "dependencies": [
    {
      "question_id": "tema4_pregunta24",
      "needs_context_from": "tema4_pregunta23",
      "reason": "Necesita ver el árbol de granularidad múltiple"
    }
  ]
}

Si no hay dependencias, responde: {"dependencies": []}`;
}

/**
 * Call Claude to analyze a topic
 */
async function analyzeTopicWithClaude(topic, questions) {
  const prompt = buildAnalysisPrompt(topic, questions);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), TIMEOUT_MS);

  try {
    let fullResponse = '';

    const response = query({
      prompt: prompt,
      abortController: abortController,
      options: { maxTurns: 1 }
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

    // Parse JSON from response
    let cleaned = fullResponse.trim();
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    return JSON.parse(jsonMatch[0]);

  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Timeout analyzing ${topic}`);
    }
    throw error;
  }
}

/**
 * Get all questions grouped by topic from database
 */
function getQuestionsByTopic(db) {
  const rows = db.prepare(`
    SELECT id, topic, question_number, shared_statement, content
    FROM questions
    WHERE subject_id = 'bda'
    ORDER BY topic, question_number
  `).all();

  const byTopic = {};
  for (const row of rows) {
    if (!byTopic[row.topic]) {
      byTopic[row.topic] = [];
    }
    byTopic[row.topic].push(row);
  }
  return byTopic;
}

/**
 * Update parent_question_id in database
 */
function updateDependencies(db, dependencies) {
  const stmt = db.prepare(`
    UPDATE questions
    SET parent_question_id = ?
    WHERE id = ?
  `);

  let updated = 0;
  for (const dep of dependencies) {
    const result = stmt.run(dep.needs_context_from, dep.question_id);
    if (result.changes > 0) {
      updated++;
    }
  }
  return updated;
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Dependency Analysis Script');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Open database
  const db = new Database(DB_PATH);

  // Ensure parent_question_id column exists
  try {
    db.exec('ALTER TABLE questions ADD COLUMN parent_question_id TEXT');
    console.log('Added parent_question_id column to database');
  } catch (e) {
    // Column already exists
    console.log('parent_question_id column already exists');
  }

  // Get questions by topic
  const questionsByTopic = getQuestionsByTopic(db);
  const topics = Object.keys(questionsByTopic).sort();

  console.log(`Found ${topics.length} topics\n`);

  let totalDependencies = 0;
  const allDependencies = [];

  for (const topic of topics) {
    const questions = questionsByTopic[topic];
    console.log(`\n--- ${topic} (${questions.length} questions) ---`);

    try {
      const result = await analyzeTopicWithClaude(topic, questions);
      const deps = result.dependencies || [];

      console.log(`  Found ${deps.length} dependencies`);

      for (const dep of deps) {
        console.log(`    ${dep.question_id} <- ${dep.needs_context_from}`);
        console.log(`      Reason: ${dep.reason}`);
        allDependencies.push(dep);
      }

      totalDependencies += deps.length;

    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }

    // Small delay between topics
    await new Promise(r => setTimeout(r, 1000));
  }

  // Update database
  console.log('\n' + '='.repeat(60));
  console.log('Updating database...');

  const updated = updateDependencies(db, allDependencies);
  console.log(`Updated ${updated} questions with parent_question_id`);

  // Verify
  const count = db.prepare(`
    SELECT COUNT(*) as count FROM questions WHERE parent_question_id IS NOT NULL
  `).get();

  console.log(`Total questions with dependencies: ${count.count}`);

  db.close();

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total dependencies found: ${totalDependencies}`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
