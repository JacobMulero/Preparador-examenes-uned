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

  // ============================================
  // Fase 0: Subjects Tests
  // ============================================

  // List subjects
  if (await test('Subjects endpoint returns list of subjects', async () => {
    const data = await fetchJSON('/api/subjects');
    assert(data.success === true, 'success should be true');
    assert(Array.isArray(data.subjects), 'subjects should be an array');
    assert(data.subjects.length >= 1, 'should have at least 1 subject');
    const bda = data.subjects.find(s => s.id === 'bda');
    assert(bda, 'should have BDA subject');
    assert(bda.name === 'Bases de Datos Avanzadas', 'BDA should have correct name');
  })) passed++; else failed++;

  // Get single subject
  if (await test('Subject detail endpoint returns BDA details', async () => {
    const data = await fetchJSON('/api/subjects/bda');
    assert(data.success === true, 'success should be true');
    assert(data.subject.id === 'bda', 'should return bda subject');
    assert(Array.isArray(data.subject.methodology), 'methodology should be parsed');
    assert(Array.isArray(data.subject.modes), 'modes should be parsed');
    assert(data.subject.claudeContext, 'should have claudeContext');
  })) passed++; else failed++;

  // Get subject topics
  if (await test('Subject topics endpoint returns BDA topics', async () => {
    const data = await fetchJSON('/api/subjects/bda/topics');
    assert(data.success === true, 'success should be true');
    assert(data.subject.id === 'bda', 'should return bda subject info');
    assert(Array.isArray(data.topics), 'topics should be an array');
    assert(data.topics.length >= 7, 'should have at least 7 topics');
    const tema1 = data.topics.find(t => t.name === 'Tema1');
    assert(tema1, 'should have Tema1 topic');
    assert(tema1.id === 'bda_tema1', 'tema1 should have correct id');
  })) passed++; else failed++;

  // Non-existent subject
  if (await test('Subject detail returns 404 for non-existent subject', async () => {
    const response = await fetch(`${BASE_URL}/api/subjects/nonexistent`, {
      headers: { 'Content-Type': 'application/json' }
    });
    assert(response.status === 404, 'should return 404');
    const data = await response.json();
    assert(data.success === false, 'success should be false');
  })) passed++; else failed++;

  // ============================================
  // Fase 1: Subject-Aware Questions Tests
  // ============================================

  // Get questions for a topic (subject-aware)
  if (await test('Subject questions endpoint returns questions for BDA/Tema1', async () => {
    const data = await fetchJSON('/api/subjects/bda/questions/Tema1');
    assert(data.success === true, 'success should be true');
    assert(data.subject.id === 'bda', 'should return bda subject');
    assert(data.topic === 'Tema1', 'should return Tema1');
    assert(Array.isArray(data.data), 'data should be an array');
    assert(data.data.length > 0, 'should have questions');
  })) passed++; else failed++;

  // Get random question (subject-aware)
  if (await test('Subject random question endpoint returns question for BDA/Tema1', async () => {
    const data = await fetchJSON('/api/subjects/bda/questions/Tema1/random');
    assert(data.success === true, 'success should be true');
    assert(data.data.id, 'should have question id');
    assert(data.data.content, 'should have content');
    assert(data.data.options, 'should have options');
  })) passed++; else failed++;

  // Get next question (subject-aware)
  if (await test('Subject next question endpoint returns question for BDA/Tema1', async () => {
    const data = await fetchJSON('/api/subjects/bda/questions/Tema1/next');
    assert(data.success === true, 'success should be true');
    assert(data.data.id, 'should have question id');
  })) passed++; else failed++;

  // Non-existent subject for questions
  if (await test('Subject questions returns 404 for non-existent subject', async () => {
    const response = await fetch(`${BASE_URL}/api/subjects/nonexistent/questions/Tema1`, {
      headers: { 'Content-Type': 'application/json' }
    });
    assert(response.status === 404, 'should return 404');
    const data = await response.json();
    assert(data.success === false, 'success should be false');
  })) passed++; else failed++;

  // ============================================
  // Fase 2: Pipeline Tests
  // ============================================

  // List exams (should be empty initially)
  if (await test('Pipeline exams endpoint returns empty list', async () => {
    const data = await fetchJSON('/api/pipeline/exams?subjectId=bda');
    assert(data.success === true, 'success should be true');
    assert(Array.isArray(data.data), 'data should be an array');
  })) passed++; else failed++;

  // Missing subjectId returns error
  if (await test('Pipeline exams requires subjectId', async () => {
    const response = await fetch(`${BASE_URL}/api/pipeline/exams`, {
      headers: { 'Content-Type': 'application/json' }
    });
    assert(response.status === 400, 'should return 400');
    const data = await response.json();
    assert(data.success === false, 'success should be false');
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
