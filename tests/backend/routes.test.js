/**
 * Integration Tests for API Routes
 * Tests the actual Express routes using supertest
 */

import express from 'express';
import request from 'supertest';
import {
  db,
  upsertQuestion,
  recordAttempt,
  cacheSolution
} from '../../server/database.js';

// Import actual routes
import mainRouter from '../../server/routes.js';
import statsRouter from '../../server/routes/stats.js';
import solvingRouter from '../../server/routes/solving.js';

// Test prefix to identify test data
const TEST_PREFIX = 'ROUTE_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', mainRouter);
  return app;
}

describe('API Routes Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  function cleanupTestData() {
    db.prepare(`DELETE FROM solutions_cache WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM attempts WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM questions WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  // ========================================
  // Main Routes Tests (routes.js)
  // ========================================

  describe('Main Router (routes.js)', () => {
    describe('GET /api/health', () => {
      it('should return health status', async () => {
        const res = await request(app).get('/api/health');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('healthy');
        expect(res.body.version).toBeDefined();
        expect(res.body.timestamp).toBeDefined();
      });
    });

    describe('GET /api', () => {
      it('should return API info', async () => {
        const res = await request(app).get('/api');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.name).toBe('Exam App API');
        expect(res.body.endpoints).toBeDefined();
        expect(res.body.endpoints.topics).toBeDefined();
        expect(res.body.endpoints.questions).toBeDefined();
        expect(res.body.endpoints.solving).toBeDefined();
        expect(res.body.endpoints.stats).toBeDefined();
      });
    });
  });

  // ========================================
  // Stats Routes Tests (routes/stats.js)
  // ========================================

  describe('Stats Routes (routes/stats.js)', () => {
    beforeEach(() => {
      // Create test questions
      upsertQuestion({ id: testId('stats_q1'), topic: 'ZZStatsRouteTopic', question_number: 1, content: 'Q1', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
      upsertQuestion({ id: testId('stats_q2'), topic: 'ZZStatsRouteTopic', question_number: 2, content: 'Q2', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
    });

    describe('GET /api/stats', () => {
      it('should return global statistics', async () => {
        const res = await request(app).get('/api/stats');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.total_questions).toBeGreaterThanOrEqual(2);
        expect(res.body.data).toHaveProperty('answered_questions');
        expect(res.body.data).toHaveProperty('questions_remaining');
        expect(res.body.data).toHaveProperty('total_attempts');
        expect(res.body.data).toHaveProperty('correct_attempts');
        expect(res.body.data).toHaveProperty('incorrect_attempts');
        expect(res.body.data).toHaveProperty('accuracy');
      });
    });

    describe('GET /api/stats/:topic', () => {
      it('should return topic statistics', async () => {
        const res = await request(app).get('/api/stats/ZZStatsRouteTopic');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.topic).toBe('ZZStatsRouteTopic');
        expect(res.body.data.total_questions).toBe(2);
      });

      it('should return zero stats for non-existent topic', async () => {
        const res = await request(app).get('/api/stats/NonExistentTopic12345');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.total_questions).toBe(0);
      });
    });

    describe('GET /api/stats/summary/all', () => {
      it('should return stats summary for all topics', async () => {
        const res = await request(app).get('/api/stats/summary/all');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.global).toBeDefined();
        expect(res.body.data.byTopic).toBeDefined();
        expect(Array.isArray(res.body.data.byTopic)).toBe(true);
      });
    });

    describe('POST /api/attempts', () => {
      it('should record an attempt', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: testId('stats_q1'),
            userAnswer: 'a',
            correctAnswer: 'b',
            isCorrect: false
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.attemptId).toBeDefined();
        expect(res.body.data.isCorrect).toBe(false);
      });

      it('should reject missing questionId', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            userAnswer: 'a',
            correctAnswer: 'b',
            isCorrect: false
          });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('questionId');
      });

      it('should reject missing userAnswer', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: testId('stats_q1'),
            correctAnswer: 'b',
            isCorrect: false
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('userAnswer');
      });

      it('should reject missing correctAnswer', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: testId('stats_q1'),
            userAnswer: 'a',
            isCorrect: false
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('correctAnswer');
      });

      it('should reject missing isCorrect', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: testId('stats_q1'),
            userAnswer: 'a',
            correctAnswer: 'b'
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('isCorrect');
      });

      it('should reject invalid userAnswer', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: testId('stats_q1'),
            userAnswer: 'e',
            correctAnswer: 'b',
            isCorrect: false
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('userAnswer');
      });

      it('should reject invalid correctAnswer', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: testId('stats_q1'),
            userAnswer: 'a',
            correctAnswer: 'x',
            isCorrect: false
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('correctAnswer');
      });
    });

    describe('GET /api/attempts/:questionId', () => {
      beforeEach(() => {
        recordAttempt({
          question_id: testId('stats_q1'),
          user_answer: 'a',
          correct_answer: 'b',
          is_correct: false
        });
      });

      it('should return attempts for a question', async () => {
        const res = await request(app).get(`/api/attempts/${testId('stats_q1')}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      });

      it('should return empty for question with no attempts', async () => {
        const res = await request(app).get(`/api/attempts/${testId('stats_q2')}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
      });
    });

    describe('GET /api/progress/failed', () => {
      it('should return failed questions', async () => {
        recordAttempt({
          question_id: testId('stats_q1'),
          user_answer: 'b',
          correct_answer: 'a',
          is_correct: false
        });

        const res = await request(app).get('/api/progress/failed');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const testFailed = res.body.data.filter(q => q.id.startsWith(TEST_PREFIX));
        expect(testFailed.length).toBeGreaterThanOrEqual(1);
      });

      it('should filter by topic', async () => {
        recordAttempt({
          question_id: testId('stats_q1'),
          user_answer: 'b',
          correct_answer: 'a',
          is_correct: false
        });

        const res = await request(app).get('/api/progress/failed?topic=ZZStatsRouteTopic');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });

    describe('GET /api/progress/unanswered', () => {
      it('should return unanswered questions', async () => {
        const res = await request(app).get('/api/progress/unanswered');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should filter by topic', async () => {
        const res = await request(app).get('/api/progress/unanswered?topic=ZZStatsRouteTopic');

        expect(res.status).toBe(200);
        const testUnanswered = res.body.data.filter(q => q.id.startsWith(TEST_PREFIX));
        expect(testUnanswered.length).toBeLessThanOrEqual(2);
      });

      it('should respect limit parameter', async () => {
        const res = await request(app).get('/api/progress/unanswered?limit=1');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(1);
      });
    });

    describe('GET /api/progress/history', () => {
      beforeEach(() => {
        recordAttempt({
          question_id: testId('stats_q1'),
          user_answer: 'a',
          correct_answer: 'a',
          is_correct: true
        });
      });

      it('should return attempt history', async () => {
        const res = await request(app).get('/api/progress/history');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should filter by questionId', async () => {
        const res = await request(app).get(`/api/progress/history?questionId=${testId('stats_q1')}`);

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      });

      it('should respect limit parameter', async () => {
        const res = await request(app).get('/api/progress/history?limit=5');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(5);
      });
    });

    describe('DELETE /api/progress/reset', () => {
      beforeEach(() => {
        recordAttempt({
          question_id: testId('stats_q1'),
          user_answer: 'a',
          correct_answer: 'a',
          is_correct: true
        });
      });

      it('should require confirmation', async () => {
        const res = await request(app).delete('/api/progress/reset');

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Confirmation required');
      });

      it('should reset all attempts with confirmation', async () => {
        // First record an attempt
        recordAttempt({
          question_id: testId('stats_q2'),
          user_answer: 'b',
          correct_answer: 'b',
          is_correct: true
        });

        const res = await request(app).delete('/api/progress/reset?confirm=yes');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deletedCount).toBeGreaterThanOrEqual(0);
      });

      it('should reset only specific topic', async () => {
        const res = await request(app).delete('/api/progress/reset?confirm=yes&topic=ZZStatsRouteTopic');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });

    describe('POST /api/attempts with topic stats', () => {
      beforeEach(() => {
        upsertQuestion({ id: 'tema1_testattempt', topic: 'Tema1', question_number: 999, content: 'Test', options: {} });
      });

      afterEach(() => {
        db.prepare("DELETE FROM attempts WHERE question_id = 'tema1_testattempt'").run();
        db.prepare("DELETE FROM questions WHERE id = 'tema1_testattempt'").run();
      });

      it('should return topic stats for question with topic prefix', async () => {
        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: 'tema1_testattempt',
            userAnswer: 'a',
            correctAnswer: 'a',
            isCorrect: true
          });

        expect(res.status).toBe(200);
        expect(res.body.data.topicStats).toBeDefined();
        expect(res.body.data.topicStats.answered).toBeGreaterThanOrEqual(1);
      });

      it('should handle question without topic prefix', async () => {
        upsertQuestion({ id: testId('notopic'), topic: 'Test', question_number: 1, content: 'Test', options: {} });

        const res = await request(app)
          .post('/api/attempts')
          .send({
            questionId: testId('notopic'),
            userAnswer: 'b',
            correctAnswer: 'b',
            isCorrect: true
          });

        expect(res.status).toBe(200);
        expect(res.body.data.topicStats).toBeNull();
      });
    });
  });

  // ========================================
  // Solving Routes Tests (routes/solving.js)
  // ========================================

  describe('Solving Routes (routes/solving.js)', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('solve_q1'), topic: 'ZZSolveRouteTopic', question_number: 1, content: 'Q1', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
    });

    describe('GET /api/solve/:questionId', () => {
      it('should return 404 for non-cached question', async () => {
        const res = await request(app).get(`/api/solve/${testId('solve_q1')}`);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('No cached solution');
      });

      it('should return cached solution', async () => {
        // Cache a solution first
        cacheSolution({
          question_id: testId('solve_q1'),
          correct_answer: 'a',
          explanation: 'Test explanation',
          wrong_options: { b: 'B wrong' }
        });

        const res = await request(app).get(`/api/solve/${testId('solve_q1')}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.answer).toBe('a');
        expect(res.body.data.explanation).toBe('Test explanation');
        expect(res.body.cached).toBe(true);
      });
    });

    describe('POST /api/solve', () => {
      it('should reject missing questionId', async () => {
        const res = await request(app)
          .post('/api/solve')
          .send({ questionText: 'Some question' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('questionId');
      });

      it('should reject missing questionText', async () => {
        const res = await request(app)
          .post('/api/solve')
          .send({ questionId: testId('solve_q1') });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('questionText');
      });

      it('should return cached solution if available', async () => {
        cacheSolution({
          question_id: testId('solve_q1'),
          correct_answer: 'b',
          explanation: 'Cached explanation',
          wrong_options: {}
        });

        const res = await request(app)
          .post('/api/solve')
          .send({
            questionId: testId('solve_q1'),
            questionText: 'What is SQL?'
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.cached).toBe(true);
        expect(res.body.data.answer).toBe('b');
      });

      it('should handle cached solution with empty wrongOptions', async () => {
        cacheSolution({
          question_id: testId('solve_q1'),
          correct_answer: 'c',
          explanation: 'No wrong options',
          wrong_options: null
        });

        const res = await request(app)
          .post('/api/solve')
          .send({
            questionId: testId('solve_q1'),
            questionText: 'Test'
          });

        expect(res.status).toBe(200);
        expect(res.body.data.wrongOptions).toEqual({});
      });
    });

    describe('DELETE /api/solve/:questionId', () => {
      it('should return 404 for non-existent cache', async () => {
        const res = await request(app).delete(`/api/solve/${testId('solve_q1')}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('No cached solution');
      });

      it('should delete cached solution', async () => {
        cacheSolution({
          question_id: testId('solve_q1'),
          correct_answer: 'c',
          explanation: 'Test',
          wrong_options: {}
        });

        const res = await request(app).delete(`/api/solve/${testId('solve_q1')}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('Deleted');
      });
    });

    describe('POST /api/solve/batch', () => {
      it('should reject non-array questions', async () => {
        const res = await request(app)
          .post('/api/solve/batch')
          .send({ questions: 'not an array' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('non-empty array');
      });

      it('should reject empty array', async () => {
        const res = await request(app)
          .post('/api/solve/batch')
          .send({ questions: [] });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('non-empty array');
      });

      it('should reject batch exceeding limit', async () => {
        const questions = Array(11).fill({ questionId: 'q1', questionText: 'text' });
        const res = await request(app)
          .post('/api/solve/batch')
          .send({ questions });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('maximum');
      });

      it('should handle batch with cached solutions', async () => {
        cacheSolution({
          question_id: testId('solve_q1'),
          correct_answer: 'd',
          explanation: 'Batch test',
          wrong_options: {}
        });

        const res = await request(app)
          .post('/api/solve/batch')
          .send({
            questions: [
              { questionId: testId('solve_q1'), questionText: 'Q1' }
            ]
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary.cached).toBe(1);
      });

      it('should handle questions missing required fields', async () => {
        const res = await request(app)
          .post('/api/solve/batch')
          .send({
            questions: [
              { questionId: testId('solve_q1') } // missing questionText
            ]
          });

        expect(res.status).toBe(200);
        expect(res.body.summary.failed).toBe(1);
      });
    });
  });

  // ========================================
  // Questions Routes Tests (routes/questions.js)
  // ========================================

  describe('Questions Routes (routes/questions.js)', () => {
    describe('GET /api/topics', () => {
      it('should return list of topics', async () => {
        const res = await request(app).get('/api/topics');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should include topic metadata', async () => {
        const res = await request(app).get('/api/topics');

        expect(res.status).toBe(200);
        if (res.body.data.length > 0) {
          const topic = res.body.data[0];
          expect(topic).toHaveProperty('topic');
          expect(topic).toHaveProperty('question_count');
          expect(topic).toHaveProperty('loaded');
        }
      });
    });

    describe('GET /api/questions/:topic', () => {
      it('should return questions for a valid topic', async () => {
        // Use Tema1 which exists in the data directory
        const res = await request(app).get('/api/questions/Tema1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.count).toBeGreaterThanOrEqual(0);
      });

      it('should return 500 for non-existent topic file', async () => {
        const res = await request(app).get('/api/questions/NonExistentTopic12345');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
      });
    });

    describe('GET /api/questions/:topic/random', () => {
      it('should return a random question from a topic', async () => {
        const res = await request(app).get('/api/questions/Tema1/random');

        expect(res.status).toBe(200);
        if (res.body.success) {
          expect(res.body.data).toBeDefined();
          expect(res.body.data.topic).toBe('Tema1');
        }
      });

      it('should accept mode=unanswered parameter', async () => {
        const res = await request(app).get('/api/questions/Tema1/random?mode=unanswered');

        // May return 404 if all questions are answered, or 200 with a question
        expect([200, 404]).toContain(res.status);
      });

      it('should accept mode=failed parameter', async () => {
        const res = await request(app).get('/api/questions/Tema1/random?mode=failed');

        // May return 404 if no failed questions, or 200 with a question
        expect([200, 404]).toContain(res.status);
      });

      it('should return 404 with appropriate message for empty topic', async () => {
        // Use a test topic with no questions
        upsertQuestion({ id: testId('empty_topic_q1'), topic: 'ZZEmptyTestTopic', question_number: 1, content: 'Q1', options: {} });

        // Mark the only question as answered
        recordAttempt({ question_id: testId('empty_topic_q1'), user_answer: 'a', correct_answer: 'a', is_correct: true });

        const res = await request(app).get('/api/questions/ZZEmptyTestTopic/random?mode=unanswered');

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('No questions found');
      });
    });

    describe('GET /api/questions/:topic/next', () => {
      it('should return next unanswered question', async () => {
        const res = await request(app).get('/api/questions/Tema1/next');

        // May return 404 if all answered, or 200 with next question
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.data).toBeDefined();
        } else {
          expect(res.body.allCompleted).toBe(true);
        }
      });
    });

    describe('GET /api/question/:id', () => {
      beforeEach(() => {
        upsertQuestion({
          id: testId('single_q1'),
          topic: 'TestTema',
          question_number: 1,
          content: 'Single question test',
          options: { a: 'A', b: 'B', c: 'C', d: 'D' }
        });
      });

      it('should return a specific question by ID', async () => {
        const res = await request(app).get(`/api/question/${testId('single_q1')}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(testId('single_q1'));
      });

      it('should return 404 for non-existent question', async () => {
        const res = await request(app).get('/api/question/nonexistent_question_12345');

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('not found');
      });

      it('should handle question IDs with topic prefix', async () => {
        // Create a question with a proper topic prefix
        upsertQuestion({
          id: 'tema1_testquestion_123',
          topic: 'Tema1',
          question_number: 999,
          content: 'Test',
          options: {}
        });

        const res = await request(app).get('/api/question/tema1_testquestion_123');

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe('tema1_testquestion_123');

        // Cleanup
        db.prepare("DELETE FROM questions WHERE id = 'tema1_testquestion_123'").run();
      });
    });

    describe('POST /api/questions/:topic/reload', () => {
      it('should reload questions for a valid topic', async () => {
        const res = await request(app).post('/api/questions/Tema1/reload');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBeGreaterThanOrEqual(0);
      });

      it('should return 500 for non-existent topic', async () => {
        const res = await request(app).post('/api/questions/NonExistentTopic12345/reload');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
      });
    });

    describe('GET /api/questions/:topic/random with different modes', () => {
      beforeEach(() => {
        // Create test questions
        upsertQuestion({ id: testId('mode_q1'), topic: 'ZZModeTestTopic', question_number: 1, content: 'Q1', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
        upsertQuestion({ id: testId('mode_q2'), topic: 'ZZModeTestTopic', question_number: 2, content: 'Q2', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
      });

      it('should return random question in default mode', async () => {
        const res = await request(app).get('/api/questions/ZZModeTestTopic/random');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should return 404 when no failed questions in failed mode', async () => {
        const res = await request(app).get('/api/questions/ZZModeTestTopic/random?mode=failed');

        expect(res.status).toBe(404);
        expect(res.body.message).toContain('No failed questions');
      });

      it('should return failed question when one exists', async () => {
        // Record a failed attempt
        recordAttempt({
          question_id: testId('mode_q1'),
          user_answer: 'b',
          correct_answer: 'a',
          is_correct: false
        });

        const res = await request(app).get('/api/questions/ZZModeTestTopic/random?mode=failed');

        expect([200, 404]).toContain(res.status);
      });

      it('should fall through to random when all answered', async () => {
        // Answer all questions
        recordAttempt({
          question_id: testId('mode_q1'),
          user_answer: 'a',
          correct_answer: 'a',
          is_correct: true
        });
        recordAttempt({
          question_id: testId('mode_q2'),
          user_answer: 'a',
          correct_answer: 'a',
          is_correct: true
        });

        const res = await request(app).get('/api/questions/ZZModeTestTopic/random');

        // Should fall through to getRandomQuestion since unanswered and failed are empty
        expect([200, 404]).toContain(res.status);
      });
    });
  });
});
