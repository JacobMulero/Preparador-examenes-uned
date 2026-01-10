/**
 * Integration Tests for Verification Routes (routes/verification.js)
 * Tests the verification session and oral question endpoints
 */

import express from 'express';
import request from 'supertest';
import {
  db,
  initializeDatabase,
  createSubject,
  getSubjectById,
  createVerificationSession,
  getVerificationSessionById,
  updateVerificationSession,
  addVerificationQuestion,
  scoreVerificationQuestion,
  createExamPdf,
  updateExamPdfStatus
} from '../../server/database.js';

// Import actual routes
import mainRouter from '../../server/routes.js';

// Test prefix to identify test data
const TEST_PREFIX = 'VER_ROUTE_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', mainRouter);
  return app;
}

describe('Verification Routes Integration Tests', () => {
  let app;

  beforeAll(() => {
    // Initialize database (creates tables if not exist)
    initializeDatabase();
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
    db.prepare(`DELETE FROM verification_questions WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM verification_sessions WHERE id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM exam_pdfs WHERE id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM subjects WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  function cleanupTestSessions() {
    db.prepare(`DELETE FROM verification_questions WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM verification_sessions WHERE id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM exam_pdfs WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  function setupTestSubject() {
    // Create a test subject if not exists
    const existing = getSubjectById(testId('subject'));
    if (!existing) {
      createSubject({
        id: testId('subject'),
        name: 'Test Subject for Verification',
        shortName: 'TSV',
        description: 'Test subject for verification routes',
        methodology: ['practice'],
        examType: 'verification',
        modes: ['verification']
      });
    }
  }

  // ========================================
  // POST /api/verification/sessions
  // ========================================

  describe('POST /api/verification/sessions', () => {
    it('should create a new verification session with valid subjectId', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject'),
          studentName: 'Test Student',
          questionCount: 5
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.id).toBeDefined();
      expect(res.body.session.subject_id).toBe(testId('subject'));
      expect(res.body.session.student_name).toBe('Test Student');
      expect(res.body.session.question_count).toBe(5);
      expect(res.body.session.status).toBe('pending');
    });

    it('should create session with default values', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject')
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session.question_count).toBe(5); // default
      expect(res.body.session.status).toBe('pending');
    });

    it('should create session with focus areas', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject'),
          studentName: 'Focus Student',
          focusAreas: ['grasp', 'dcd', 'modelo_dominio'],
          questionCount: 7
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session.focusAreas).toEqual(['grasp', 'dcd', 'modelo_dominio']);
    });

    it('should return 400 if subjectId is missing', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          studentName: 'Test Student'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('subjectId');
    });

    it('should return 404 if subject does not exist', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: 'nonexistent_subject_12345'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should return 404 if deliverableId does not exist', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject'),
          deliverableId: 'nonexistent_pdf_12345'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('PDF');
    });

    it('should return 400 if deliverable is not completed', async () => {
      // Create PDF but don't complete it
      createExamPdf({
        id: testId('incomplete_pdf'),
        subjectId: testId('subject'),
        filename: 'incomplete.pdf',
        originalPath: '/tmp/incomplete.pdf'
      });

      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject'),
          deliverableId: testId('incomplete_pdf')
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('procesado');
    });

    it('should create session with valid deliverableId', async () => {
      // Create and complete PDF
      createExamPdf({
        id: testId('complete_pdf'),
        subjectId: testId('subject'),
        filename: 'complete.pdf',
        originalPath: '/tmp/complete.pdf'
      });
      updateExamPdfStatus(testId('complete_pdf'), 'completed');

      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject'),
          deliverableId: testId('complete_pdf'),
          studentName: 'Student with Deliverable'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session.deliverable_id).toBe(testId('complete_pdf'));
    });
  });

  // ========================================
  // POST /api/verification/sessions/:id/generate
  // ========================================

  describe('POST /api/verification/sessions/:id/generate', () => {
    let testSessionId;

    beforeEach(() => {
      const session = createVerificationSession({
        id: testId('gen_session'),
        subjectId: testId('subject'),
        studentName: 'Generate Test Student',
        questionCount: 5
      });
      testSessionId = session.id;
    });

    it('should start generation for a pending session', async () => {
      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/generate`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('iniciada');
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .post('/api/verification/sessions/nonexistent_session_12345/generate');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should return 400 if session is already generating', async () => {
      updateVerificationSession(testSessionId, { status: 'generating' });

      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/generate`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('en progreso');
    });

    it('should return 400 if session is already ready', async () => {
      updateVerificationSession(testSessionId, { status: 'ready' });

      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/generate`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('ya fueron generadas');
    });
  });

  // ========================================
  // GET /api/verification/sessions/:id
  // ========================================

  describe('GET /api/verification/sessions/:id', () => {
    let testSessionId;

    beforeEach(() => {
      const session = createVerificationSession({
        id: testId('get_session'),
        subjectId: testId('subject'),
        studentName: 'Get Test Student',
        questionCount: 5
      });
      testSessionId = session.id;

      // Add some questions
      addVerificationQuestion({
        id: testId('get_q1'),
        sessionId: testSessionId,
        questionNumber: 1,
        content: 'Explain your design decisions',
        expectedAnswer: 'Student should mention GRASP patterns',
        evaluationCriteria: ['comprension_concepto', 'justificacion_decisiones']
      });

      addVerificationQuestion({
        id: testId('get_q2'),
        sessionId: testSessionId,
        questionNumber: 2,
        content: 'What alternatives did you consider?',
        expectedAnswer: 'Student should list alternatives',
        evaluationCriteria: ['alternativas_consideradas']
      });
    });

    it('should return session with questions', async () => {
      const res = await request(app)
        .get(`/api/verification/sessions/${testSessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.id).toBe(testSessionId);
      expect(res.body.session.student_name).toBe('Get Test Student');
      expect(res.body.questions).toBeDefined();
      expect(Array.isArray(res.body.questions)).toBe(true);
      expect(res.body.questions.length).toBe(2);
    });

    it('should return questions with evaluationCriteria parsed', async () => {
      const res = await request(app)
        .get(`/api/verification/sessions/${testSessionId}`);

      expect(res.status).toBe(200);
      const q1 = res.body.questions.find(q => q.question_number === 1);
      expect(q1.evaluationCriteria).toEqual(['comprension_concepto', 'justificacion_decisiones']);
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/verification/sessions/nonexistent_session_12345');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });
  });

  // ========================================
  // GET /api/verification/sessions?subjectId=
  // ========================================

  describe('GET /api/verification/sessions', () => {
    beforeEach(() => {
      createVerificationSession({
        id: testId('list_session_1'),
        subjectId: testId('subject'),
        studentName: 'Student 1'
      });

      createVerificationSession({
        id: testId('list_session_2'),
        subjectId: testId('subject'),
        studentName: 'Student 2'
      });
    });

    it('should return all sessions for a subject', async () => {
      const res = await request(app)
        .get(`/api/verification/sessions?subjectId=${testId('subject')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toBeDefined();
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should return 400 if subjectId is missing', async () => {
      const res = await request(app)
        .get('/api/verification/sessions');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('subjectId');
    });
  });

  // ========================================
  // POST /api/verification/sessions/:id/start
  // ========================================

  describe('POST /api/verification/sessions/:id/start', () => {
    let testSessionId;

    beforeEach(() => {
      const session = createVerificationSession({
        id: testId('start_session'),
        subjectId: testId('subject'),
        studentName: 'Start Test Student'
      });
      testSessionId = session.id;
      updateVerificationSession(testSessionId, { status: 'ready' });
    });

    it('should start a ready session', async () => {
      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/start`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.status).toBe('in_progress');
    });

    it('should return 400 if session is not ready', async () => {
      updateVerificationSession(testSessionId, { status: 'pending' });

      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/start`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('ready');
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .post('/api/verification/sessions/nonexistent_session_12345/start');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should be idempotent - return success if session is already in_progress', async () => {
      // Cambiar a in_progress (simula que ya se llamó a start)
      updateVerificationSession(testSessionId, { status: 'in_progress' });

      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/start`);

      // Debe devolver success, NO error (idempotente)
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.status).toBe('in_progress');
    });
  });

  // ========================================
  // POST /api/verification/questions/:id/score
  // ========================================

  describe('POST /api/verification/questions/:id/score', () => {
    let testSessionId;
    let testQuestionId;

    beforeEach(() => {
      const session = createVerificationSession({
        id: testId('score_session'),
        subjectId: testId('subject'),
        studentName: 'Score Test Student'
      });
      testSessionId = session.id;

      testQuestionId = addVerificationQuestion({
        id: testId('score_q1'),
        sessionId: testSessionId,
        questionNumber: 1,
        content: 'Test question for scoring',
        expectedAnswer: 'Expected answer'
      });
    });

    it('should score a question successfully', async () => {
      const res = await request(app)
        .post(`/api/verification/questions/${testQuestionId}/score`)
        .send({
          score: 8.5,
          feedback: 'Good explanation',
          actualAnswer: 'Student explained well'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.question).toBeDefined();
      expect(res.body.question.score).toBe(8.5);
      expect(res.body.question.feedback).toBe('Good explanation');
      expect(res.body.question.actual_answer).toBe('Student explained well');
    });

    it('should score a question with just score', async () => {
      const res = await request(app)
        .post(`/api/verification/questions/${testQuestionId}/score`)
        .send({
          score: 7
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.question.score).toBe(7);
    });

    it('should return 400 if score is missing', async () => {
      const res = await request(app)
        .post(`/api/verification/questions/${testQuestionId}/score`)
        .send({
          feedback: 'Some feedback'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('score');
    });

    it('should return 400 if score is out of range', async () => {
      const res = await request(app)
        .post(`/api/verification/questions/${testQuestionId}/score`)
        .send({
          score: 15
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('0 y 10');
    });

    it('should return 400 if score is negative', async () => {
      const res = await request(app)
        .post(`/api/verification/questions/${testQuestionId}/score`)
        .send({
          score: -1
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent question', async () => {
      const res = await request(app)
        .post('/api/verification/questions/nonexistent_question_12345/score')
        .send({
          score: 5
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should accept decimal scores', async () => {
      const res = await request(app)
        .post(`/api/verification/questions/${testQuestionId}/score`)
        .send({
          score: 7.5
        });

      expect(res.status).toBe(200);
      expect(res.body.question.score).toBe(7.5);
    });

    it('should accept score of 0', async () => {
      const res = await request(app)
        .post(`/api/verification/questions/${testQuestionId}/score`)
        .send({
          score: 0
        });

      expect(res.status).toBe(200);
      expect(res.body.question.score).toBe(0);
    });
  });

  // ========================================
  // POST /api/verification/sessions/:id/complete
  // ========================================

  describe('POST /api/verification/sessions/:id/complete', () => {
    let testSessionId;

    beforeEach(() => {
      const session = createVerificationSession({
        id: testId('complete_session'),
        subjectId: testId('subject'),
        studentName: 'Complete Test Student'
      });
      testSessionId = session.id;

      // Add questions with scores
      const q1 = addVerificationQuestion({
        id: testId('complete_q1'),
        sessionId: testSessionId,
        questionNumber: 1,
        content: 'Question 1'
      });

      const q2 = addVerificationQuestion({
        id: testId('complete_q2'),
        sessionId: testSessionId,
        questionNumber: 2,
        content: 'Question 2'
      });

      scoreVerificationQuestion(testId('complete_q1'), 8, 'Good', 'Answer 1');
      scoreVerificationQuestion(testId('complete_q2'), 6, 'Okay', 'Answer 2');
    });

    it('should complete a session with notes', async () => {
      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/complete`)
        .send({
          notes: 'Overall good performance'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.status).toBe('completed');
      expect(res.body.session.notes).toBe('Overall good performance');
      expect(res.body.session.score).toBeDefined();
    });

    it('should complete a session with explicit final score', async () => {
      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/complete`)
        .send({
          notes: 'Good work',
          finalScore: 9
        });

      expect(res.status).toBe(200);
      expect(res.body.session.score).toBe(9);
    });

    it('should calculate average score if not provided', async () => {
      const res = await request(app)
        .post(`/api/verification/sessions/${testSessionId}/complete`)
        .send({});

      expect(res.status).toBe(200);
      // Average of 8 and 6 = 7
      expect(res.body.session.score).toBe(7);
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .post('/api/verification/sessions/nonexistent_session_12345/complete')
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ========================================
  // GET /api/verification/questions/:id
  // ========================================

  describe('GET /api/verification/questions/:id', () => {
    let testQuestionId;

    beforeEach(() => {
      const session = createVerificationSession({
        id: testId('question_session'),
        subjectId: testId('subject'),
        studentName: 'Question Test Student'
      });

      testQuestionId = addVerificationQuestion({
        id: testId('single_q1'),
        sessionId: session.id,
        questionNumber: 1,
        content: 'Single question test',
        expectedAnswer: 'Expected answer',
        evaluationCriteria: ['criteria1', 'criteria2'],
        difficulty: 'hard'
      });
    });

    it('should return a single question', async () => {
      const res = await request(app)
        .get(`/api/verification/questions/${testQuestionId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.question).toBeDefined();
      expect(res.body.question.id).toBe(testQuestionId);
      expect(res.body.question.content).toBe('Single question test');
      expect(res.body.question.difficulty).toBe('hard');
      expect(res.body.question.evaluationCriteria).toEqual(['criteria1', 'criteria2']);
    });

    it('should return 404 for non-existent question', async () => {
      const res = await request(app)
        .get('/api/verification/questions/nonexistent_question_12345');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ========================================
  // Additional coverage tests
  // ========================================

  describe('Additional coverage tests', () => {
    it('should handle session with null studentName', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject'),
          studentName: null
        });

      expect(res.status).toBe(201);
      expect(res.body.session.student_name).toBeNull();
    });

    it('should handle session with empty focusAreas', async () => {
      const res = await request(app)
        .post('/api/verification/sessions')
        .send({
          subjectId: testId('subject'),
          focusAreas: []
        });

      expect(res.status).toBe(201);
      // Empty array may be stored as empty array or null depending on implementation
      expect([null, []]).toContainEqual(res.body.session.focusAreas);
    });

    it('should handle question with null evaluationCriteria', async () => {
      const session = createVerificationSession({
        id: testId('null_criteria_session'),
        subjectId: testId('subject')
      });

      addVerificationQuestion({
        id: testId('null_criteria_q1'),
        sessionId: session.id,
        questionNumber: 1,
        content: 'Question without criteria',
        evaluationCriteria: null
      });

      const res = await request(app)
        .get(`/api/verification/sessions/${session.id}`);

      expect(res.status).toBe(200);
      const q = res.body.questions.find(q => q.question_number === 1);
      expect(q.evaluationCriteria).toBeNull();
    });
  });
});
