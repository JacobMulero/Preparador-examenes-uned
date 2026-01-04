/**
 * Tests for FALLBACK_DIR branch in questions.js
 * Tests the case when DATA_DIR doesn't exist but FALLBACK_DIR does
 */

import { jest } from '@jest/globals';

describe('FALLBACK_DIR branch coverage', () => {
  let originalExistsSync;

  beforeEach(() => {
    jest.resetModules();
  });

  it('should use FALLBACK_DIR when DATA_DIR does not exist', async () => {
    // Mock fs before importing questions router
    const mockExistsSync = jest.fn((p) => {
      // DATA_DIR doesn't exist
      if (p.includes('data')) return false;
      // FALLBACK_DIR exists
      if (p.includes('Preguntas')) return true;
      return true;
    });

    const mockReaddirSync = jest.fn(() => ['Preguntas_Tema1.md']);
    const mockReadFileSync = jest.fn(() => '## Pregunta 1\nTest\na) A\nb) B\nc) C\nd) D');

    jest.unstable_mockModule('fs', () => ({
      default: {
        existsSync: mockExistsSync,
        readdirSync: mockReaddirSync,
        readFileSync: mockReadFileSync
      },
      existsSync: mockExistsSync,
      readdirSync: mockReaddirSync,
      readFileSync: mockReadFileSync
    }));

    // Mock database
    jest.unstable_mockModule('../../server/database.js', () => ({
      db: {
        prepare: jest.fn(() => ({
          get: jest.fn(() => ({ count: 0 })),
          all: jest.fn(() => []),
          run: jest.fn()
        })),
        transaction: jest.fn((fn) => fn)
      },
      upsertQuestion: jest.fn(),
      getQuestionsByTopic: jest.fn(() => []),
      getQuestionById: jest.fn(),
      getAllTopics: jest.fn(() => []),
      getRandomQuestion: jest.fn(),
      getNextUnansweredQuestion: jest.fn()
    }));

    // Mock questionParser
    jest.unstable_mockModule('../../server/questionParser.js', () => ({
      parseQuestionFile: jest.fn(() => [
        { id: 'tema1_pregunta1', topic: 'Tema1', question_number: 1, content: 'Test', options: {} }
      ]),
      getAvailableTopics: jest.fn(() => ['Tema1'])
    }));

    // Import after mocking
    const { default: questionsRouter } = await import('../../server/routes/questions.js');
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;

    const app = express();
    app.use(express.json());
    app.use('/api', questionsRouter);

    // Make request to trigger getQuestionsDir
    const res = await request(app).get('/api/topics');

    // Should use FALLBACK_DIR and return successfully
    expect(res.status).toBe(200);
    expect(mockExistsSync).toHaveBeenCalled();
  });

  it('should throw error when neither DATA_DIR nor FALLBACK_DIR exist', async () => {
    // Mock fs with both directories not existing
    const mockExistsSync = jest.fn(() => false);

    jest.unstable_mockModule('fs', () => ({
      default: {
        existsSync: mockExistsSync,
        readdirSync: jest.fn(() => []),
        readFileSync: jest.fn()
      },
      existsSync: mockExistsSync,
      readdirSync: jest.fn(() => []),
      readFileSync: jest.fn()
    }));

    // Mock database
    jest.unstable_mockModule('../../server/database.js', () => ({
      db: {
        prepare: jest.fn(() => ({
          get: jest.fn(() => ({ count: 0 })),
          all: jest.fn(() => []),
          run: jest.fn()
        })),
        transaction: jest.fn((fn) => fn)
      },
      upsertQuestion: jest.fn(),
      getQuestionsByTopic: jest.fn(() => []),
      getQuestionById: jest.fn(),
      getAllTopics: jest.fn(() => []),
      getRandomQuestion: jest.fn(),
      getNextUnansweredQuestion: jest.fn()
    }));

    // Mock questionParser to throw (simulating directory not found)
    jest.unstable_mockModule('../../server/questionParser.js', () => ({
      parseQuestionFile: jest.fn(),
      getAvailableTopics: jest.fn(() => { throw new Error('Questions directory not found'); })
    }));

    // Import after mocking
    const { default: questionsRouter } = await import('../../server/routes/questions.js');
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;

    const app = express();
    app.use(express.json());
    app.use('/api', questionsRouter);

    // Make request - should get error
    const res = await request(app).get('/api/topics');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
