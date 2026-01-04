#!/usr/bin/env node
/**
 * Pre-cache Solutions Script
 *
 * Runs through all questions and generates Claude responses,
 * caching them in the database for instant access later.
 *
 * Usage:
 *   node scripts/precache-solutions.js          # Run in foreground
 *   node scripts/precache-solutions.js &        # Run in background
 *   nohup node scripts/precache-solutions.js > precache.log 2>&1 &  # Background with log
 */

const API_BASE = 'http://localhost:3001/api';

// Delay between requests to avoid overwhelming Claude
const DELAY_MS = 2000; // 2 seconds between requests

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return response.json();
}

async function getTopics() {
  const res = await fetchJSON(`${API_BASE}/topics`);
  return res.data || [];
}

async function getQuestions(topicId) {
  const res = await fetchJSON(`${API_BASE}/questions/${topicId}`);
  return res.data || [];
}

async function checkCached(questionId) {
  try {
    const res = await fetchJSON(`${API_BASE}/solve/${questionId}`);
    return res.success && res.data;
  } catch {
    return false;
  }
}

async function solveQuestion(questionId, questionText) {
  const res = await fetchJSON(`${API_BASE}/solve`, {
    method: 'POST',
    body: JSON.stringify({ questionId, questionText })
  });
  return res;
}

function buildFullContent(q) {
  let content = '';
  if (q.shared_statement) {
    content += `**Enunciado:** ${q.shared_statement}\n\n`;
  }
  content += q.content + '\n\n';
  if (q.options) {
    content += `a) ${q.options.a}\n`;
    content += `b) ${q.options.b}\n`;
    content += `c) ${q.options.c}\n`;
    content += `d) ${q.options.d}`;
  }
  return content;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Pre-cache Solutions Script');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Delay between requests: ${DELAY_MS}ms`);
  console.log('');

  // Get all topics
  const topics = await getTopics();
  console.log(`Found ${topics.length} topics`);

  let totalQuestions = 0;
  let cached = 0;
  let solved = 0;
  let errors = 0;

  for (const topic of topics) {
    console.log(`\n--- ${topic.topic} (${topic.question_count} questions) ---`);

    const questions = await getQuestions(topic.topic);
    totalQuestions += questions.length;

    for (const q of questions) {
      process.stdout.write(`  [${q.question_number}] ${q.id}... `);

      // Check if already cached
      const isCached = await checkCached(q.id);
      if (isCached) {
        console.log('✓ cached');
        cached++;
        continue;
      }

      // Solve with Claude
      try {
        const fullContent = buildFullContent(q);
        const result = await solveQuestion(q.id, fullContent);

        if (result.success) {
          console.log(`✓ solved (${result.data.answer})`);
          solved++;
        } else {
          console.log(`✗ error: ${result.error || 'unknown'}`);
          errors++;
        }
      } catch (err) {
        console.log(`✗ error: ${err.message}`);
        errors++;
      }

      // Delay between requests
      await sleep(DELAY_MS);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total questions: ${totalQuestions}`);
  console.log(`Already cached:  ${cached}`);
  console.log(`Newly solved:    ${solved}`);
  console.log(`Errors:          ${errors}`);
  console.log(`Finished at:     ${new Date().toISOString()}`);
  console.log('');

  // Exit with error code if there were errors
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
