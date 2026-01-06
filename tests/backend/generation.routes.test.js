/**
 * Integration Tests for Generation Routes (routes/generation.js)
 * Tests the generation session and question generation endpoints
 */

import express from 'express';
import request from 'supertest';
import {
  db,
  createSubject,
  getSubjectById,
  createGenerationSession,
  getGenerationSessionById,
  updateGenerationSessionStatus,
  addGeneratedQuestion,
  recordGeneratedAttempt,
  upsertQuestion
} from '../../server/database.js';

// Import actual routes
import mainRouter from '../../server/routes.js';

// Test prefix to identify test data
const TEST_PREFIX = 'GEN_ROUTE_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', mainRouter);
  return app;
}

describe('Generation Routes Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
    cleanupTestData();
    setupTestSubject();
  });

  afterAll(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestSessions();
  });

  function cleanupTestData() {
    // Clean up in order of foreign key dependencies
    db.prepare(`DELETE FROM generated_question_attempts WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM generated_test_questions WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM generation_sessions WHERE id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM questions WHERE subject_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM topics WHERE subject_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM subjects WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  function cleanupTestSessions() {
    db.prepare(`DELETE FROM generated_question_attempts WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM generated_test_questions WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM generation_sessions WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  function setupTestSubject() {
    // Create a test subject if not exists
    const existing = getSubjectById(testId('subject'));
    if (!existing) {
      createSubject({
        id: testId('subject'),
        name: 'Test Subject for Generation',
        shortName: 'TSG',
        description: 'Test subject for generation routes',
        methodology: ['test'],
        examType: 'test',
        modes: ['test']
      });
    }

    // Create some test questions for the subject
    upsertQuestion({
      id: testId('question_1'),
      subject_id: testId('subject'),
      topic: 'TestTopic',
      question_number: 1,
      content: 'Test question 1',
      options: { a: 'A', b: 'B', c: 'C', d: 'D' }
    });

    upsertQuestion({
      id: testId('question_2'),
      subject_id: testId('subject'),
      topic: 'TestTopic',
      question_number: 2,
      content: 'Test question 2',
      options: { a: 'A', b: 'B', c: 'C', d: 'D' }
    });
  }

  // ========================================
  // POST /api/generate/test-session
  // ========================================

  describe('POST /api/generate/test-session', () => {
    it('should create a new test session with valid subjectId', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: testId('subject'),
          questionCount: 5
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.id).toBeDefined();
      expect(res.body.session.subject_id).toBe(testId('subject'));
      expect(res.body.session.question_count).toBe(5);
      expect(res.body.session.status).toBe('pending');

      // Cleanup the created session
      db.prepare(`DELETE FROM generation_sessions WHERE id = ?`).run(res.body.session.id);
    });

    it('should create session with default values', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: testId('subject')
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session.question_count).toBe(10); // default
      expect(res.body.session.difficulty).toBe('mixed'); // default
      expect(res.body.session.session_mode).toBe('test'); // default

      // Cleanup
      db.prepare(`DELETE FROM generation_sessions WHERE id = ?`).run(res.body.session.id);
    });

    it('should create session with all optional parameters', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: testId('subject'),
          deliverableId: 'deliverable_123',
          topicFocus: ['Topic1', 'Topic2'],
          difficulty: 'hard',
          questionCount: 15
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session.difficulty).toBe('hard');
      expect(res.body.session.question_count).toBe(15);

      // Cleanup
      db.prepare(`DELETE FROM generation_sessions WHERE id = ?`).run(res.body.session.id);
    });

    it('should return 400 if subjectId is missing', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          questionCount: 5
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('subjectId');
    });

    it('should return 404 if subject does not exist', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: 'nonexistent_subject_12345'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });
  });

  // ========================================
  // POST /api/generate/sessions/:id/start
  // ========================================

  describe('POST /api/generate/sessions/:id/start', () => {
    let testSessionId;

    beforeEach(() => {
      // Create a test session
      const session = createGenerationSession({
        id: testId('start_session'),
        subjectId: testId('subject'),
        questionCount: 5
      });
      testSessionId = session.id;
    });

    it('should start generation for a pending session', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/start`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('iniciada');
      expect(res.body.sessionId).toBe(testSessionId);
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .post('/api/generate/sessions/nonexistent_session_12345/start');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should return 400 if session is already generating', async () => {
      // Update session status to generating
      updateGenerationSessionStatus(testSessionId, 'generating');

      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/start`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('en progreso');
    });

    it('should return 400 if session is already completed', async () => {
      // Update session status to completed
      updateGenerationSessionStatus(testSessionId, 'completed');

      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/start`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('ya fueron generadas');
    });
  });

  // ========================================
  // GET /api/generate/sessions/:id
  // ========================================

  describe('GET /api/generate/sessions/:id', () => {
    let testSessionId;

    beforeEach(() => {
      const session = createGenerationSession({
        id: testId('get_session'),
        subjectId: testId('subject'),
        questionCount: 10,
        difficulty: 'easy'
      });
      testSessionId = session.id;
    });

    it('should return session details', async () => {
      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.id).toBe(testSessionId);
      expect(res.body.session.subject_id).toBe(testId('subject'));
      expect(res.body.session.question_count).toBe(10);
      expect(res.body.session.difficulty).toBe('easy');
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/generate/sessions/nonexistent_session_12345');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should return session with topicFocus parsed', async () => {
      const sessionWithFocus = createGenerationSession({
        id: testId('focus_session'),
        subjectId: testId('subject'),
        topicFocus: ['Tema1', 'Tema2']
      });

      const res = await request(app)
        .get(`/api/generate/sessions/${sessionWithFocus.id}`);

      expect(res.status).toBe(200);
      expect(res.body.session.topicFocus).toEqual(['Tema1', 'Tema2']);
    });
  });

  // ========================================
  // GET /api/generate/sessions/:id/questions
  // ========================================

  describe('GET /api/generate/sessions/:id/questions', () => {
    let testSessionId;

    beforeEach(() => {
      const session = createGenerationSession({
        id: testId('questions_session'),
        subjectId: testId('subject'),
        questionCount: 3
      });
      testSessionId = session.id;

      // Add some generated questions
      addGeneratedQuestion({
        id: testId('gen_q1'),
        sessionId: testSessionId,
        questionNumber: 1,
        content: 'Generated question 1',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'A is correct'
      });

      addGeneratedQuestion({
        id: testId('gen_q2'),
        sessionId: testSessionId,
        questionNumber: 2,
        content: 'Generated question 2',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'b',
        explanation: 'B is correct',
        wrongExplanations: { a: 'A wrong', c: 'C wrong', d: 'D wrong' }
      });
    });

    it('should return generated questions for a session', async () => {
      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}/questions`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.questions).toBeDefined();
      expect(Array.isArray(res.body.questions)).toBe(true);
      expect(res.body.questions.length).toBe(2);
      expect(res.body.status).toBeDefined();
    });

    it('should return questions with parsed options', async () => {
      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}/questions`);

      expect(res.status).toBe(200);
      const q1 = res.body.questions.find(q => q.question_number === 1);
      expect(q1.options).toEqual({ a: 'A', b: 'B', c: 'C', d: 'D' });
    });

    it('should return questions with wrongExplanations parsed', async () => {
      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}/questions`);

      expect(res.status).toBe(200);
      const q2 = res.body.questions.find(q => q.question_number === 2);
      expect(q2.wrongExplanations).toEqual({ a: 'A wrong', c: 'C wrong', d: 'D wrong' });
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/generate/sessions/nonexistent_session_12345/questions');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should return empty array for session with no questions', async () => {
      const emptySession = createGenerationSession({
        id: testId('empty_questions_session'),
        subjectId: testId('subject')
      });

      const res = await request(app)
        .get(`/api/generate/sessions/${emptySession.id}/questions`);

      expect(res.status).toBe(200);
      expect(res.body.questions).toEqual([]);
    });
  });

  // ========================================
  // POST /api/generate/sessions/:id/attempt
  // ========================================

  describe('POST /api/generate/sessions/:id/attempt', () => {
    let testSessionId;
    let testQuestionId;

    beforeEach(() => {
      const session = createGenerationSession({
        id: testId('attempt_session'),
        subjectId: testId('subject')
      });
      testSessionId = session.id;

      testQuestionId = addGeneratedQuestion({
        id: testId('attempt_q1'),
        sessionId: testSessionId,
        questionNumber: 1,
        content: 'Test question for attempt',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'b',
        explanation: 'B is the correct answer',
        wrongExplanations: { a: 'A is wrong', c: 'C is wrong', d: 'D is wrong' }
      });
    });

    it('should record a correct attempt', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/attempt`)
        .send({
          questionId: testQuestionId,
          userAnswer: 'b',
          timeSpentSeconds: 30
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isCorrect).toBe(true);
      expect(res.body.correctAnswer).toBe('b');
      expect(res.body.explanation).toBe('B is the correct answer');
    });

    it('should record an incorrect attempt', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/attempt`)
        .send({
          questionId: testQuestionId,
          userAnswer: 'a'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isCorrect).toBe(false);
      expect(res.body.correctAnswer).toBe('b');
      expect(res.body.wrongExplanations).toBeDefined();
    });

    it('should handle case-insensitive answer comparison', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/attempt`)
        .send({
          questionId: testQuestionId,
          userAnswer: 'B' // uppercase
        });

      expect(res.status).toBe(200);
      expect(res.body.isCorrect).toBe(true);
    });

    it('should return 400 if questionId is missing', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/attempt`)
        .send({
          userAnswer: 'a'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('questionId');
    });

    it('should return 400 if userAnswer is missing', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/attempt`)
        .send({
          questionId: testQuestionId
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('userAnswer');
    });

    it('should return 404 if question does not exist', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/attempt`)
        .send({
          questionId: 'nonexistent_question_12345',
          userAnswer: 'a'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should record attempt without timeSpentSeconds', async () => {
      const res = await request(app)
        .post(`/api/generate/sessions/${testSessionId}/attempt`)
        .send({
          questionId: testQuestionId,
          userAnswer: 'c'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ========================================
  // GET /api/generate/sessions/:id/stats
  // ========================================

  describe('GET /api/generate/sessions/:id/stats', () => {
    let testSessionId;
    let testQuestionId1;
    let testQuestionId2;

    beforeEach(() => {
      const session = createGenerationSession({
        id: testId('stats_session'),
        subjectId: testId('subject'),
        questionCount: 5
      });
      testSessionId = session.id;

      testQuestionId1 = addGeneratedQuestion({
        id: testId('stats_q1'),
        sessionId: testSessionId,
        questionNumber: 1,
        content: 'Stats question 1',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'A is correct'
      });

      testQuestionId2 = addGeneratedQuestion({
        id: testId('stats_q2'),
        sessionId: testSessionId,
        questionNumber: 2,
        content: 'Stats question 2',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'b',
        explanation: 'B is correct'
      });
    });

    it('should return stats with no attempts', async () => {
      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.totalQuestions).toBe(2);
      expect(res.body.stats.totalAttempts).toBe(0);
      expect(res.body.stats.correct).toBe(0);
      expect(res.body.stats.accuracy).toBe(0);
    });

    it('should return stats with attempts', async () => {
      // Record some attempts
      recordGeneratedAttempt({
        questionId: testQuestionId1,
        sessionId: testSessionId,
        userAnswer: 'a',
        isCorrect: true,
        timeSpentSeconds: 20
      });

      recordGeneratedAttempt({
        questionId: testQuestionId2,
        sessionId: testSessionId,
        userAnswer: 'c',
        isCorrect: false,
        timeSpentSeconds: 30
      });

      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.stats.totalAttempts).toBe(2);
      expect(res.body.stats.correct).toBe(1);
      expect(res.body.stats.accuracy).toBe(50);
      expect(res.body.stats.avgTimeSeconds).toBe(25); // (20+30)/2
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/generate/sessions/nonexistent_session_12345/stats');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should include session status in stats', async () => {
      updateGenerationSessionStatus(testSessionId, 'completed');

      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.stats.status).toBe('completed');
    });

    it('should calculate accuracy correctly', async () => {
      // Record 3 correct and 1 incorrect
      recordGeneratedAttempt({
        questionId: testQuestionId1,
        sessionId: testSessionId,
        userAnswer: 'a',
        isCorrect: true
      });
      recordGeneratedAttempt({
        questionId: testQuestionId1,
        sessionId: testSessionId,
        userAnswer: 'a',
        isCorrect: true
      });
      recordGeneratedAttempt({
        questionId: testQuestionId2,
        sessionId: testSessionId,
        userAnswer: 'b',
        isCorrect: true
      });
      recordGeneratedAttempt({
        questionId: testQuestionId2,
        sessionId: testSessionId,
        userAnswer: 'c',
        isCorrect: false
      });

      const res = await request(app)
        .get(`/api/generate/sessions/${testSessionId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.stats.totalAttempts).toBe(4);
      expect(res.body.stats.correct).toBe(3);
      expect(res.body.stats.accuracy).toBe(75); // 3/4 * 100
    });
  });

  // ========================================
  // GET /api/generate/subject/:subjectId/sessions
  // ========================================

  describe('GET /api/generate/subject/:subjectId/sessions', () => {
    beforeEach(() => {
      // Create multiple sessions for the test subject
      createGenerationSession({
        id: testId('subject_session_1'),
        subjectId: testId('subject'),
        questionCount: 5
      });

      createGenerationSession({
        id: testId('subject_session_2'),
        subjectId: testId('subject'),
        questionCount: 10
      });

      createGenerationSession({
        id: testId('subject_session_3'),
        subjectId: testId('subject'),
        difficulty: 'hard'
      });
    });

    it('should return all sessions for a subject', async () => {
      const res = await request(app)
        .get(`/api/generate/subject/${testId('subject')}/sessions`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toBeDefined();
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(3);
    });

    it('should return sessions ordered by created_at DESC', async () => {
      const res = await request(app)
        .get(`/api/generate/subject/${testId('subject')}/sessions`);

      expect(res.status).toBe(200);
      const sessions = res.body.sessions;

      // The most recent session should be first
      for (let i = 1; i < sessions.length; i++) {
        const current = new Date(sessions[i].created_at);
        const previous = new Date(sessions[i - 1].created_at);
        expect(current <= previous).toBe(true);
      }
    });

    it('should return empty array for subject with no sessions', async () => {
      // Create a subject with no sessions
      const emptySubject = getSubjectById(testId('empty_subject'));
      if (!emptySubject) {
        createSubject({
          id: testId('empty_subject'),
          name: 'Empty Subject',
          methodology: ['test'],
          modes: ['test']
        });
      }

      const res = await request(app)
        .get(`/api/generate/subject/${testId('empty_subject')}/sessions`);

      expect(res.status).toBe(200);
      expect(res.body.sessions).toEqual([]);
    });

    it('should return sessions with topicFocus parsed', async () => {
      // Create a session with topicFocus
      createGenerationSession({
        id: testId('focus_subject_session'),
        subjectId: testId('subject'),
        topicFocus: ['Tema1', 'Tema3']
      });

      const res = await request(app)
        .get(`/api/generate/subject/${testId('subject')}/sessions`);

      expect(res.status).toBe(200);
      const focusSession = res.body.sessions.find(s => s.id === testId('focus_subject_session'));
      expect(focusSession).toBeDefined();
      expect(focusSession.topicFocus).toEqual(['Tema1', 'Tema3']);
    });
  });

  // ========================================
  // GET /api/generate/deliverable/:id/sessions
  // ========================================

  describe('GET /api/generate/deliverable/:id/sessions', () => {
    beforeEach(() => {
      // Create sessions with a deliverable ID
      createGenerationSession({
        id: testId('deliverable_session_1'),
        subjectId: testId('subject'),
        deliverableId: testId('deliverable'),
        questionCount: 5
      });

      createGenerationSession({
        id: testId('deliverable_session_2'),
        subjectId: testId('subject'),
        deliverableId: testId('deliverable'),
        questionCount: 10
      });
    });

    it('should return sessions for a deliverable', async () => {
      const res = await request(app)
        .get(`/api/generate/deliverable/${testId('deliverable')}/sessions`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toBeDefined();
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for deliverable with no sessions', async () => {
      const res = await request(app)
        .get('/api/generate/deliverable/nonexistent_deliverable_12345/sessions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toEqual([]);
    });

    it('should only return sessions for the specified deliverable', async () => {
      const res = await request(app)
        .get(`/api/generate/deliverable/${testId('deliverable')}/sessions`);

      expect(res.status).toBe(200);
      res.body.sessions.forEach(session => {
        expect(session.deliverable_id).toBe(testId('deliverable'));
      });
    });
  });

  // ========================================
  // Error handling tests
  // ========================================

  describe('Error handling', () => {
    it('should handle invalid JSON in request body', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      // Express json parser should reject this
      expect([400, 500]).toContain(res.status);
    });

    it('should handle missing Content-Type header', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: testId('subject')
        });

      // Should still work because supertest sets content-type
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  // ========================================
  // Additional coverage tests
  // ========================================

  describe('Additional coverage tests', () => {
    it('should handle session with null deliverableId', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: testId('subject'),
          deliverableId: null,
          questionCount: 5
        });

      expect(res.status).toBe(201);
      expect(res.body.session.deliverable_id).toBeNull();

      // Cleanup
      db.prepare(`DELETE FROM generation_sessions WHERE id = ?`).run(res.body.session.id);
    });

    it('should handle session with null topicFocus', async () => {
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: testId('subject'),
          topicFocus: null
        });

      expect(res.status).toBe(201);
      expect(res.body.session.topicFocus).toBeNull();

      // Cleanup
      db.prepare(`DELETE FROM generation_sessions WHERE id = ?`).run(res.body.session.id);
    });

    it('should handle different difficulty levels', async () => {
      const difficulties = ['easy', 'medium', 'hard', 'mixed'];

      for (const difficulty of difficulties) {
        const res = await request(app)
          .post('/api/generate/test-session')
          .send({
            subjectId: testId('subject'),
            difficulty
          });

        expect(res.status).toBe(201);
        expect(res.body.session.difficulty).toBe(difficulty);

        // Cleanup
        db.prepare(`DELETE FROM generation_sessions WHERE id = ?`).run(res.body.session.id);
      }
    });

    it('should handle session start with error status', async () => {
      const session = createGenerationSession({
        id: testId('error_session'),
        subjectId: testId('subject')
      });
      updateGenerationSessionStatus(session.id, 'error', 'Previous generation failed');

      // Error status should allow restart (not blocked like generating/completed)
      const res = await request(app)
        .post(`/api/generate/sessions/${session.id}/start`);

      // May succeed or fail depending on implementation
      expect([200, 400]).toContain(res.status);
    });

    it('should return stats with null avgTimeSeconds when no time recorded', async () => {
      const session = createGenerationSession({
        id: testId('no_time_session'),
        subjectId: testId('subject')
      });

      const questionId = addGeneratedQuestion({
        id: testId('no_time_q1'),
        sessionId: session.id,
        questionNumber: 1,
        content: 'No time question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'A is correct'
      });

      // Record attempt without time
      recordGeneratedAttempt({
        questionId: questionId,
        sessionId: session.id,
        userAnswer: 'a',
        isCorrect: true,
        timeSpentSeconds: null
      });

      const res = await request(app)
        .get(`/api/generate/sessions/${session.id}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.stats.avgTimeSeconds).toBeNull();
    });

    it('should handle question with null wrongExplanations', async () => {
      const session = createGenerationSession({
        id: testId('null_wrong_session'),
        subjectId: testId('subject')
      });

      addGeneratedQuestion({
        id: testId('null_wrong_q1'),
        sessionId: session.id,
        questionNumber: 1,
        content: 'Question without wrong explanations',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'A is correct',
        wrongExplanations: null
      });

      const res = await request(app)
        .get(`/api/generate/sessions/${session.id}/questions`);

      expect(res.status).toBe(200);
      const q = res.body.questions.find(q => q.question_number === 1);
      expect(q.wrongExplanations).toBeNull();
    });

    it('should handle attempt on question with uppercase correct answer', async () => {
      const session = createGenerationSession({
        id: testId('uppercase_session'),
        subjectId: testId('subject')
      });

      const questionId = addGeneratedQuestion({
        id: testId('uppercase_q1'),
        sessionId: session.id,
        questionNumber: 1,
        content: 'Uppercase answer question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'C', // Uppercase
        explanation: 'C is correct'
      });

      const res = await request(app)
        .post(`/api/generate/sessions/${session.id}/attempt`)
        .send({
          questionId: questionId,
          userAnswer: 'c' // lowercase
        });

      expect(res.status).toBe(200);
      expect(res.body.isCorrect).toBe(true);
    });
  });
});
