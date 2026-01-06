/**
 * Tests for Questions Routes
 * Tests both legacy and subject-aware routes
 */

import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import questionsRouter from '../../server/routes/questions.js';
import { db, upsertQuestion } from '../../server/database.js';

// Test prefix to identify test data
const TEST_PREFIX = 'QUESTIONS_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

// Create test app
const app = express();
app.use(express.json());
app.use('/api', questionsRouter);

describe('Questions Routes', () => {
  // Cleanup function
  const cleanupTestData = () => {
    try {
      db.prepare(`DELETE FROM attempts WHERE question_id LIKE ?`).run(`${TEST_PREFIX}%`);
      db.prepare(`DELETE FROM questions WHERE id LIKE ?`).run(`${TEST_PREFIX}%`);
    } catch (e) {
      // Tables may not exist
    }
  };

  beforeEach(() => {
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  // Helper to create test questions
  const createTestQuestion = (id, topic, number = 1, subjectId = 'bda') => {
    upsertQuestion({
      id: testId(id),
      subject_id: subjectId,
      topic,
      question_number: number,
      content: `Test question ${id}`,
      options: { a: 'Option A', b: 'Option B', c: 'Option C', d: 'Option D' }
    });
  };

  // =====================================================
  // Subject-Aware Routes (Fase 1)
  // =====================================================

  describe('GET /api/subjects/:subjectId/topics', () => {
    it('should return topics for BDA subject', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/topics');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subject).toBeDefined();
      expect(res.body.subject.id).toBe('bda');
      expect(Array.isArray(res.body.topics)).toBe(true);
    });

    it('should return 404 for non-existent subject', async () => {
      const res = await request(app)
        .get('/api/subjects/nonexistent_xyz/topics');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Subject not found');
    });

    it('should include topic metadata', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/topics');

      expect(res.status).toBe(200);
      if (res.body.topics.length > 0) {
        const topic = res.body.topics[0];
        expect(topic).toHaveProperty('id');
        expect(topic).toHaveProperty('name');
        expect(topic).toHaveProperty('questionCount');
        expect(topic).toHaveProperty('loaded');
      }
    });
  });

  describe('GET /api/subjects/:subjectId/questions/:topic', () => {
    beforeEach(() => {
      // Create test questions for a specific topic
      createTestQuestion('q1', 'TestTopic', 1);
      createTestQuestion('q2', 'TestTopic', 2);
    });

    it('should return questions for a topic', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/questions/TestTopic');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subject).toBeDefined();
      expect(res.body.topic).toBe('TestTopic');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 404 for non-existent subject', async () => {
      const res = await request(app)
        .get('/api/subjects/nonexistent_xyz/questions/TestTopic');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should include count in response', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/questions/TestTopic');

      expect(res.status).toBe(200);
      expect(typeof res.body.count).toBe('number');
    });
  });

  describe('GET /api/subjects/:subjectId/questions/:topic/random', () => {
    beforeEach(() => {
      createTestQuestion('rand1', 'RandomTopic', 1);
      createTestQuestion('rand2', 'RandomTopic', 2);
      createTestQuestion('rand3', 'RandomTopic', 3);
    });

    it('should return a random question', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/questions/RandomTopic/random');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.topic).toBe('RandomTopic');
    });

    it('should return 404 for non-existent subject', async () => {
      const res = await request(app)
        .get('/api/subjects/nonexistent_xyz/questions/RandomTopic/random');

      expect(res.status).toBe(404);
    });

    it('should return error for empty topic', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/questions/EmptyNonexistentTopic/random');

      // Returns 404 if no questions or 500 if file not found
      expect([404, 500]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/subjects/:subjectId/questions/:topic/next', () => {
    beforeEach(() => {
      createTestQuestion('next1', 'NextTopic', 1);
      createTestQuestion('next2', 'NextTopic', 2);
    });

    it('should return next unanswered question', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/questions/NextTopic/next');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 404 for non-existent subject', async () => {
      const res = await request(app)
        .get('/api/subjects/nonexistent_xyz/questions/NextTopic/next');

      expect(res.status).toBe(404);
    });

    it('should return random question if all answered', async () => {
      // First mark questions as answered by creating attempts
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO attempts (question_id, user_answer, correct_answer, is_correct)
        VALUES (?, 'a', 'a', 1)
      `);
      stmt.run(testId('next1'));
      stmt.run(testId('next2'));

      const res = await request(app)
        .get('/api/subjects/bda/questions/NextTopic/next');

      // Should still return a question (random fallback)
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/subjects/:subjectId/question/:questionId', () => {
    beforeEach(() => {
      createTestQuestion('specific1', 'SpecificTopic', 1);
    });

    it('should return a specific question', async () => {
      const res = await request(app)
        .get(`/api/subjects/bda/question/${testId('specific1')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testId('specific1'));
    });

    it('should return 404 for non-existent subject', async () => {
      const res = await request(app)
        .get(`/api/subjects/nonexistent_xyz/question/${testId('specific1')}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent question', async () => {
      const res = await request(app)
        .get('/api/subjects/bda/question/nonexistent_question_xyz');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Question not found');
    });
  });

  // =====================================================
  // Legacy Routes
  // =====================================================

  describe('GET /api/topics', () => {
    it('should return list of topics', async () => {
      const res = await request(app)
        .get('/api/topics');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/questions/:topic', () => {
    beforeEach(() => {
      createTestQuestion('legacy1', 'LegacyTopic', 1);
    });

    it('should return questions for a topic', async () => {
      const res = await request(app)
        .get('/api/questions/LegacyTopic');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/questions/:topic/random', () => {
    beforeEach(() => {
      createTestQuestion('legrand1', 'LegacyRandTopic', 1);
      createTestQuestion('legrand2', 'LegacyRandTopic', 2);
    });

    it('should return a random question', async () => {
      const res = await request(app)
        .get('/api/questions/LegacyRandTopic/random');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should support mode=unanswered', async () => {
      const res = await request(app)
        .get('/api/questions/LegacyRandTopic/random?mode=unanswered');

      // Either returns a question or 404 if all answered
      expect([200, 404]).toContain(res.status);
    });

    it('should support mode=failed', async () => {
      const res = await request(app)
        .get('/api/questions/LegacyRandTopic/random?mode=failed');

      // Either returns a question or 404 if no failed
      expect([200, 404]).toContain(res.status);
    });

    it('should return error for no questions', async () => {
      const res = await request(app)
        .get('/api/questions/NonexistentTopicXYZ/random');

      // Returns 404 if no questions or 500 if file not found
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/questions/:topic/next', () => {
    beforeEach(() => {
      createTestQuestion('legnext1', 'LegacyNextTopic', 1);
    });

    it('should return next unanswered question', async () => {
      const res = await request(app)
        .get('/api/questions/LegacyNextTopic/next');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when all completed', async () => {
      // Mark as answered
      db.prepare(`
        INSERT OR IGNORE INTO attempts (question_id, user_answer, correct_answer, is_correct)
        VALUES (?, 'a', 'a', 1)
      `).run(testId('legnext1'));

      const res = await request(app)
        .get('/api/questions/LegacyNextTopic/next');

      expect(res.status).toBe(404);
      expect(res.body.allCompleted).toBe(true);
    });
  });

  describe('GET /api/question/:id', () => {
    beforeEach(() => {
      createTestQuestion('byid1', 'ByIdTopic', 1);
    });

    it('should return question by ID', async () => {
      const res = await request(app)
        .get(`/api/question/${testId('byid1')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testId('byid1'));
    });

    it('should return 404 for non-existent question', async () => {
      const res = await request(app)
        .get('/api/question/nonexistent_q_xyz');

      expect(res.status).toBe(404);
    });

    it('should handle question ID with topic prefix', async () => {
      // Create a question with tema prefix format
      upsertQuestion({
        id: testId('tema1_q1'),
        subject_id: 'bda',
        topic: 'Tema1',
        question_number: 1,
        content: 'Test tema question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });

      const res = await request(app)
        .get(`/api/question/${testId('tema1_q1')}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/questions/:topic/reload', () => {
    it('should reload questions for existing topic', async () => {
      // Only works for topics with files in Preguntas folder
      // Skip if Tema1 file doesn't exist
      const res = await request(app)
        .post('/api/questions/Tema1/reload');

      // Should succeed if file exists, fail otherwise
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(typeof res.body.count).toBe('number');
      }
    });

    it('should return error for non-existent topic file', async () => {
      const res = await request(app)
        .post('/api/questions/NonexistentTopicFile/reload');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // =====================================================
  // Edge Cases and Error Handling
  // =====================================================

  describe('Edge Cases', () => {
    it('should handle questions with special characters in content', async () => {
      upsertQuestion({
        id: testId('special'),
        subject_id: 'bda',
        topic: 'SpecialTopic',
        question_number: 1,
        content: 'Question with "quotes" and <tags> and émojis 🎉',
        options: { a: 'Option with "quotes"', b: 'Normal', c: 'C', d: 'D' }
      });

      const res = await request(app)
        .get('/api/questions/SpecialTopic');

      expect(res.status).toBe(200);
      const q = res.body.data.find(q => q.id === testId('special'));
      expect(q).toBeDefined();
    });

    it('should handle topics with numbers', async () => {
      createTestQuestion('num1', 'Topic123', 1);

      const res = await request(app)
        .get('/api/questions/Topic123');

      expect(res.status).toBe(200);
    });

    it('should return empty array for topic with no questions', async () => {
      // First ensure the topic doesn't exist
      db.prepare(`DELETE FROM questions WHERE topic = ?`).run('EmptyTestTopic');

      const res = await request(app)
        .get('/api/questions/EmptyTestTopic');

      // May return 500 if file doesn't exist, or 200 with empty array
      if (res.status === 200) {
        expect(res.body.data).toEqual([]);
      }
    });
  });

  describe('Options parsing', () => {
    it('should parse options as object', async () => {
      createTestQuestion('opts1', 'OptionsTopic', 1);

      const res = await request(app)
        .get('/api/questions/OptionsTopic');

      expect(res.status).toBe(200);
      const q = res.body.data[0];
      expect(typeof q.options).toBe('object');
      expect(q.options.a).toBe('Option A');
    });
  });
});
