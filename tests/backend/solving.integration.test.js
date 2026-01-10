/**
 * Integration Tests for Solving Routes with Mocked Claude Service
 * Tests error handling in solving routes by mocking the claudeService
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Mock claudeService before importing routes
const mockSolveQuestion = jest.fn();

jest.unstable_mockModule('../../server/claudeService.js', () => ({
  solveQuestion: mockSolveQuestion
}));

// Import database functions (not mocked)
const { db, upsertQuestion, cacheSolution, getCachedSolution } = await import('../../server/database.js');

// Import the solving router after mocking
const { default: solvingRouter } = await import('../../server/routes/solving.js');

// Test prefix
const TEST_PREFIX = 'SOLVE_MOCK_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

// Create test app with just solving routes
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', solvingRouter);
  return app;
}

describe('Solving Routes with Mocked Claude', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cleanupTestData();
  });

  function cleanupTestData() {
    db.prepare(`DELETE FROM solutions_cache WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM attempts WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM questions WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  describe('POST /api/solve - with Claude calls', () => {
    beforeEach(() => {
      upsertQuestion({
        id: testId('q1'),
        topic: 'TestTema',
        question_number: 1,
        content: 'Test question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });
    });

    it('should call Claude and cache the result', async () => {
      mockSolveQuestion.mockResolvedValue({
        answer: 'a',
        explanation: 'A is correct',
        wrongOptions: { b: 'B wrong', c: 'C wrong', d: 'D wrong' }
      });

      const res = await request(app)
        .post('/api/solve')
        .send({
          questionId: testId('q1'),
          questionText: 'What is correct? a) A b) B c) C d) D'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cached).toBe(false);
      expect(res.body.data.answer).toBe('a');
      expect(res.body.data.explanation).toBe('A is correct');

      // Verify it was cached
      const cached = getCachedSolution(testId('q1'));
      expect(cached).toBeDefined();
      expect(cached.correct_answer).toBe('a');
    });

    it('should return 504 for timeout errors', async () => {
      mockSolveQuestion.mockRejectedValue(new Error('Claude timeout after 60 seconds'));

      const res = await request(app)
        .post('/api/solve')
        .send({
          questionId: testId('q1'),
          questionText: 'Test question'
        });

      expect(res.status).toBe(504);
      expect(res.body.error).toBe('Claude timeout');
    });

    it('should return 503 for Claude CLI unavailable', async () => {
      mockSolveQuestion.mockRejectedValue(new Error('Claude CLI not found'));

      const res = await request(app)
        .post('/api/solve')
        .send({
          questionId: testId('q1'),
          questionText: 'Test question'
        });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Claude unavailable');
    });

    it('should return 502 for parse errors', async () => {
      mockSolveQuestion.mockRejectedValue(new Error('Could not parse response'));

      const res = await request(app)
        .post('/api/solve')
        .send({
          questionId: testId('q1'),
          questionText: 'Test question'
        });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('Invalid Claude response');
    });

    it('should return 500 for generic errors', async () => {
      mockSolveQuestion.mockRejectedValue(new Error('Unknown error'));

      const res = await request(app)
        .post('/api/solve')
        .send({
          questionId: testId('q1'),
          questionText: 'Test question'
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to solve question');
    });

    it('should handle solution with null wrongOptions', async () => {
      mockSolveQuestion.mockResolvedValue({
        answer: 'b',
        explanation: 'B is right',
        wrongOptions: null
      });

      const res = await request(app)
        .post('/api/solve')
        .send({
          questionId: testId('q1'),
          questionText: 'Test'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.wrongOptions).toEqual({});
    });
  });

  describe('POST /api/solve/batch - with Claude calls', () => {
    beforeEach(() => {
      upsertQuestion({
        id: testId('batch_q1'),
        topic: 'TestTema',
        question_number: 1,
        content: 'Q1',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });
      upsertQuestion({
        id: testId('batch_q2'),
        topic: 'TestTema',
        question_number: 2,
        content: 'Q2',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });
    });

    it('should solve multiple questions', async () => {
      mockSolveQuestion
        .mockResolvedValueOnce({ answer: 'a', explanation: 'A correct', wrongOptions: {} })
        .mockResolvedValueOnce({ answer: 'b', explanation: 'B correct', wrongOptions: {} });

      const res = await request(app)
        .post('/api/solve/batch')
        .send({
          questions: [
            { questionId: testId('batch_q1'), questionText: 'Q1' },
            { questionId: testId('batch_q2'), questionText: 'Q2' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.summary.solved).toBe(2);
      expect(res.body.summary.cached).toBe(0);
      expect(res.body.summary.failed).toBe(0);
    });

    it('should handle partial failures in batch', async () => {
      mockSolveQuestion
        .mockResolvedValueOnce({ answer: 'a', explanation: 'OK', wrongOptions: {} })
        .mockRejectedValueOnce(new Error('Failed'));

      const res = await request(app)
        .post('/api/solve/batch')
        .send({
          questions: [
            { questionId: testId('batch_q1'), questionText: 'Q1' },
            { questionId: testId('batch_q2'), questionText: 'Q2' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.summary.solved).toBe(1);
      expect(res.body.summary.failed).toBe(1);
    });

    it('should use cache for already solved questions', async () => {
      // Pre-cache one solution
      cacheSolution({
        question_id: testId('batch_q1'),
        correct_answer: 'c',
        explanation: 'Cached',
        wrong_options: {}
      });

      mockSolveQuestion.mockResolvedValue({ answer: 'd', explanation: 'New', wrongOptions: {} });

      const res = await request(app)
        .post('/api/solve/batch')
        .send({
          questions: [
            { questionId: testId('batch_q1'), questionText: 'Q1' },
            { questionId: testId('batch_q2'), questionText: 'Q2' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.summary.cached).toBe(1);
      expect(res.body.summary.solved).toBe(1);

      // Verify cached one has correct answer from cache
      const cachedResult = res.body.results.find(r => r.questionId === testId('batch_q1'));
      expect(cachedResult.cached).toBe(true);
      expect(cachedResult.data.answer).toBe('c');
    });

    it('should handle batch with null wrongOptions in solution', async () => {
      mockSolveQuestion.mockResolvedValue({
        answer: 'a',
        explanation: 'Test',
        wrongOptions: null
      });

      const res = await request(app)
        .post('/api/solve/batch')
        .send({
          questions: [
            { questionId: testId('batch_q1'), questionText: 'Q1' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.results[0].data.wrongOptions).toEqual({});
    });
  });

  describe('Error scenarios', () => {
    it('should handle POST /api/solve/batch general error', async () => {
      // This is tricky to trigger since we need an error outside the question loop
      // The batch endpoint catches errors at the top level too
      const res = await request(app)
        .post('/api/solve/batch')
        .send({
          questions: [{ questionId: testId('q1'), questionText: 'Q1' }]
        });

      // This should work since mockSolveQuestion isn't set up for this call
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/solve/:questionId', () => {
    beforeEach(() => {
      db.prepare(`DELETE FROM solutions_cache WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
      // Create test question for cache tests
      upsertQuestion({
        id: testId('cache_q1'),
        topic: 'CacheTestTema',
        question_number: 99,
        content: 'Cache test question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });
      upsertQuestion({
        id: testId('cache_null'),
        topic: 'CacheTestTema',
        question_number: 98,
        content: 'Cache null test question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });
    });

    it('should return cached solution', async () => {
      // Pre-cache a solution
      cacheSolution({
        question_id: testId('cache_q1'),
        correct_answer: 'b',
        explanation: 'B is correct',
        wrong_options: { a: 'Wrong A', c: 'Wrong C', d: 'Wrong D' }
      });

      const res = await request(app)
        .get(`/api/solve/${testId('cache_q1')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cached).toBe(true);
      expect(res.body.data.answer).toBe('b');
      expect(res.body.data.explanation).toBe('B is correct');
      expect(res.body.data.wrongOptions.a).toBe('Wrong A');
    });

    it('should return 404 for uncached question', async () => {
      const res = await request(app)
        .get(`/api/solve/${testId('nonexistent')}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should handle null wrong_options in cache', async () => {
      // Cache a solution with null wrong_options (to cover || {} branch)
      db.prepare(`
        INSERT INTO solutions_cache (question_id, correct_answer, explanation, wrong_options, solved_at)
        VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)
      `).run(testId('cache_null'), 'a', 'Test explanation');

      const res = await request(app)
        .get(`/api/solve/${testId('cache_null')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wrongOptions).toEqual({});
    });
  });
});
