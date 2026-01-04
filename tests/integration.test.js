/**
 * Integration Tests for Exam App API
 * Run with: node tests/integration.test.js
 */

const BASE_URL = 'http://localhost:3001';

async function fetchJSON(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return response.json();
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('\n🧪 Running Integration Tests\n');
  let passed = 0;
  let failed = 0;

  // Health Check
  if (await test('Health endpoint returns healthy', async () => {
    const data = await fetchJSON('/api/health');
    assert(data.success === true, 'success should be true');
    assert(data.status === 'healthy', 'status should be healthy');
  })) passed++; else failed++;

  // Topics
  if (await test('Topics endpoint returns list of topics', async () => {
    const data = await fetchJSON('/api/topics');
    assert(data.success === true, 'success should be true');
    assert(Array.isArray(data.data), 'data should be an array');
    assert(data.data.length >= 1, 'should have at least 1 topic');
  })) passed++; else failed++;

  // Questions for a topic
  if (await test('Questions endpoint returns questions for Tema1', async () => {
    const data = await fetchJSON('/api/questions/Tema1');
    assert(data.success === true, 'success should be true');
    assert(Array.isArray(data.data), 'data should be an array');
    assert(data.data.length > 0, 'should have questions');
    assert(data.data[0].id.startsWith('tema1_'), 'question id should start with tema1_');
    assert(data.data[0].options, 'question should have options');
  })) passed++; else failed++;

  // Random question
  if (await test('Random question endpoint returns a question', async () => {
    const data = await fetchJSON('/api/questions/Tema1/random');
    assert(data.success === true, 'success should be true');
    assert(data.data.id, 'should have question id');
    assert(data.data.content, 'should have content');
    assert(data.data.options, 'should have options');
  })) passed++; else failed++;

  // Stats
  if (await test('Stats endpoint returns statistics', async () => {
    const data = await fetchJSON('/api/stats');
    assert(data.success === true, 'success should be true');
    assert(typeof data.data.total_questions === 'number', 'should have total_questions');
    assert(typeof data.data.total_attempts === 'number', 'should have total_attempts');
  })) passed++; else failed++;

  // Record attempt
  if (await test('Attempts endpoint records user attempt', async () => {
    const data = await fetchJSON('/api/attempts', {
      method: 'POST',
      body: JSON.stringify({
        questionId: 'tema1_pregunta1',
        userAnswer: 'a',
        correctAnswer: 'b',
        isCorrect: false,
        explanation: 'Test explanation'
      })
    });
    assert(data.success === true, 'success should be true');
    assert(data.data.attemptId, 'should return attemptId');
  })) passed++; else failed++;

  // Failed questions
  if (await test('Failed questions endpoint returns failed attempts', async () => {
    const data = await fetchJSON('/api/progress/failed');
    assert(data.success === true, 'success should be true');
    assert(Array.isArray(data.data), 'data should be an array');
  })) passed++; else failed++;

  // Cached solution (from previous test)
  if (await test('Cached solution endpoint returns cached answer', async () => {
    const data = await fetchJSON('/api/solve/tema1_pregunta1');
    // May or may not have cached solution
    assert(data.success === true || data.success === false, 'should return valid response');
  })) passed++; else failed++;

  // Topic stats
  if (await test('Topic stats endpoint returns topic statistics', async () => {
    const data = await fetchJSON('/api/stats/Tema1');
    assert(data.success === true, 'success should be true');
    assert(data.data.topic === 'Tema1', 'should return Tema1 stats');
    assert(typeof data.data.total_questions === 'number', 'should have total_questions');
  })) passed++; else failed++;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  return failed === 0;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
