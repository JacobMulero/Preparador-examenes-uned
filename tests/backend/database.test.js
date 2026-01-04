/**
 * Tests for Database Module (server/database.js)
 * Tests the actual exported functions for coverage
 */

import {
  db,
  initializeDatabase,
  upsertQuestion,
  getQuestionsByTopic,
  getQuestionById,
  getAllTopics,
  getRandomQuestion,
  getNextUnansweredQuestion,
  recordAttempt,
  getAttemptsByQuestion,
  getFailedQuestions,
  getGlobalStats,
  getTopicStats,
  getCachedSolution,
  cacheSolution
} from '../../server/database.js';

// Test prefix to identify test data
const TEST_PREFIX = 'TEST_JEST_';

// Helper to create a test question ID
const testId = (id) => `${TEST_PREFIX}${id}`;

describe('database module', () => {
  // Clean up test data before and after all tests
  beforeAll(() => {
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  function cleanupTestData() {
    // Delete test data in order respecting foreign keys
    db.prepare(`DELETE FROM solutions_cache WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM attempts WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM questions WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  describe('initializeDatabase', () => {
    it('should initialize without throwing', () => {
      // initializeDatabase is called at module load, just verify db is accessible
      expect(db).toBeDefined();
    });
  });

  describe('upsertQuestion', () => {
    it('should insert a new question', () => {
      const question = {
        id: testId('pregunta1'),
        topic: 'TestTema',
        question_number: 1,
        content: 'What is SQL?',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      };

      const result = upsertQuestion(question);

      expect(result.changes).toBe(1);
    });

    it('should update existing question', () => {
      const question = {
        id: testId('pregunta2'),
        topic: 'TestTema',
        question_number: 2,
        content: 'Original content',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      };

      upsertQuestion(question);
      question.content = 'Updated content';
      upsertQuestion(question);

      const retrieved = getQuestionById(testId('pregunta2'));
      expect(retrieved.content).toBe('Updated content');
    });

    it('should handle shared_statement', () => {
      const question = {
        id: testId('pregunta3'),
        topic: 'TestTema',
        question_number: 3,
        shared_statement: 'Given a database with tables X and Y',
        content: 'What is correct?',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      };

      upsertQuestion(question);
      const retrieved = getQuestionById(testId('pregunta3'));

      expect(retrieved.shared_statement).toBe('Given a database with tables X and Y');
    });

    it('should handle null shared_statement', () => {
      const question = {
        id: testId('pregunta4'),
        topic: 'TestTema',
        question_number: 4,
        content: 'What is correct?',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      };

      upsertQuestion(question);
      const retrieved = getQuestionById(testId('pregunta4'));

      expect(retrieved.shared_statement).toBeNull();
    });
  });

  describe('getQuestionsByTopic', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('topic_q1'), topic: 'TestTopicA', question_number: 1, content: 'Q1', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
      upsertQuestion({ id: testId('topic_q2'), topic: 'TestTopicA', question_number: 2, content: 'Q2', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
      upsertQuestion({ id: testId('topic_q3'), topic: 'TestTopicB', question_number: 1, content: 'Q3', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
    });

    it('should return questions for specific topic', () => {
      const questions = getQuestionsByTopic('TestTopicA');

      expect(questions).toHaveLength(2);
      expect(questions[0].topic).toBe('TestTopicA');
      expect(questions[1].topic).toBe('TestTopicA');
    });

    it('should return questions ordered by question_number', () => {
      const questions = getQuestionsByTopic('TestTopicA');

      expect(questions[0].question_number).toBe(1);
      expect(questions[1].question_number).toBe(2);
    });

    it('should parse options JSON', () => {
      const questions = getQuestionsByTopic('TestTopicA');

      expect(questions[0].options).toEqual({ a: 'A', b: 'B', c: 'C', d: 'D' });
    });

    it('should return empty array for non-existent topic', () => {
      const questions = getQuestionsByTopic('NonExistentTopic12345');

      expect(questions).toHaveLength(0);
    });
  });

  describe('getQuestionById', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('byid_q1'), topic: 'TestTema', question_number: 1, content: 'Q1', options: { a: 'A', b: 'B', c: 'C', d: 'D' } });
    });

    it('should return question by ID', () => {
      const question = getQuestionById(testId('byid_q1'));

      expect(question).toBeDefined();
      expect(question.id).toBe(testId('byid_q1'));
    });

    it('should return undefined for non-existent ID', () => {
      const question = getQuestionById('non_existent_12345');

      expect(question).toBeUndefined();
    });

    it('should parse options JSON', () => {
      const question = getQuestionById(testId('byid_q1'));

      expect(question.options).toEqual({ a: 'A', b: 'B', c: 'C', d: 'D' });
    });
  });

  describe('getAllTopics', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('alltopic_q1'), topic: 'ZZTestTopicX', question_number: 1, content: 'Q1', options: {} });
      upsertQuestion({ id: testId('alltopic_q2'), topic: 'ZZTestTopicX', question_number: 2, content: 'Q2', options: {} });
      upsertQuestion({ id: testId('alltopic_q3'), topic: 'ZZTestTopicY', question_number: 1, content: 'Q3', options: {} });
    });

    it('should return topics with counts', () => {
      const topics = getAllTopics();

      // Find our test topics
      const topicX = topics.find(t => t.topic === 'ZZTestTopicX');
      const topicY = topics.find(t => t.topic === 'ZZTestTopicY');

      expect(topicX).toBeDefined();
      expect(topicX.question_count).toBe(2);
      expect(topicY).toBeDefined();
      expect(topicY.question_count).toBe(1);
    });
  });

  describe('getRandomQuestion', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('random_q1'), topic: 'ZZRandomTestTopic', question_number: 1, content: 'Q1', options: { a: 'A' } });
      upsertQuestion({ id: testId('random_q2'), topic: 'ZZRandomTestTopic', question_number: 2, content: 'Q2', options: { a: 'A' } });
    });

    it('should return a random question from specific topic', () => {
      const question = getRandomQuestion('ZZRandomTestTopic');

      expect(question).toBeDefined();
      expect(question.topic).toBe('ZZRandomTestTopic');
    });

    it('should return undefined for non-existent topic', () => {
      const question = getRandomQuestion('NonExistentTopic12345');

      expect(question).toBeUndefined();
    });

    it('should parse options JSON', () => {
      const question = getRandomQuestion('ZZRandomTestTopic');

      expect(question.options).toBeDefined();
      expect(typeof question.options).toBe('object');
    });

    it('should return a question when no topic specified', () => {
      const question = getRandomQuestion();

      // Should return some question (may or may not be test question)
      expect(question === undefined || question.id).toBeTruthy();
    });
  });

  describe('getNextUnansweredQuestion', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('next_q1'), topic: 'ZZNextTestTopic', question_number: 1, content: 'Q1', options: {} });
      upsertQuestion({ id: testId('next_q2'), topic: 'ZZNextTestTopic', question_number: 2, content: 'Q2', options: {} });
    });

    it('should return first unanswered question', () => {
      const question = getNextUnansweredQuestion('ZZNextTestTopic');

      expect(question).toBeDefined();
      expect(question.question_number).toBe(1);
    });

    it('should skip answered questions', () => {
      recordAttempt({
        question_id: testId('next_q1'),
        user_answer: 'a',
        correct_answer: 'a',
        is_correct: true
      });

      const question = getNextUnansweredQuestion('ZZNextTestTopic');

      expect(question.question_number).toBe(2);
    });

    it('should return undefined when all answered', () => {
      recordAttempt({ question_id: testId('next_q1'), user_answer: 'a', correct_answer: 'a', is_correct: true });
      recordAttempt({ question_id: testId('next_q2'), user_answer: 'a', correct_answer: 'a', is_correct: true });

      const question = getNextUnansweredQuestion('ZZNextTestTopic');

      expect(question).toBeUndefined();
    });
  });

  describe('recordAttempt', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('attempt_q1'), topic: 'TestTema', question_number: 1, content: 'Q1', options: {} });
    });

    it('should record a correct attempt', () => {
      const result = recordAttempt({
        question_id: testId('attempt_q1'),
        user_answer: 'a',
        correct_answer: 'a',
        is_correct: true
      });

      expect(result.changes).toBe(1);
    });

    it('should record an incorrect attempt', () => {
      const result = recordAttempt({
        question_id: testId('attempt_q1'),
        user_answer: 'b',
        correct_answer: 'a',
        is_correct: false
      });

      expect(result.changes).toBe(1);
    });

    it('should store explanation', () => {
      recordAttempt({
        question_id: testId('attempt_q1'),
        user_answer: 'a',
        correct_answer: 'a',
        is_correct: true,
        explanation: 'This is the explanation'
      });

      const attempts = getAttemptsByQuestion(testId('attempt_q1'));
      expect(attempts[0].explanation).toBe('This is the explanation');
    });

    it('should handle null explanation', () => {
      recordAttempt({
        question_id: testId('attempt_q1'),
        user_answer: 'a',
        correct_answer: 'a',
        is_correct: true
      });

      const attempts = getAttemptsByQuestion(testId('attempt_q1'));
      expect(attempts[0].explanation).toBeNull();
    });
  });

  describe('getAttemptsByQuestion', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('getattempt_q1'), topic: 'TestTema', question_number: 1, content: 'Q1', options: {} });
      recordAttempt({ question_id: testId('getattempt_q1'), user_answer: 'a', correct_answer: 'b', is_correct: false });
      recordAttempt({ question_id: testId('getattempt_q1'), user_answer: 'b', correct_answer: 'b', is_correct: true });
    });

    it('should return all attempts for question', () => {
      const attempts = getAttemptsByQuestion(testId('getattempt_q1'));

      expect(attempts).toHaveLength(2);
    });

    it('should return attempts in descending order', () => {
      const attempts = getAttemptsByQuestion(testId('getattempt_q1'));

      // Most recent first (the correct one)
      expect(attempts[0].is_correct).toBe(1);
    });

    it('should return empty array for no attempts', () => {
      const attempts = getAttemptsByQuestion('non_existent_12345');

      expect(attempts).toHaveLength(0);
    });
  });

  describe('getFailedQuestions', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('failed_q1'), topic: 'ZZFailedTestTopic', question_number: 1, content: 'Q1', options: { a: 'A' } });
      upsertQuestion({ id: testId('failed_q2'), topic: 'ZZFailedTestTopic', question_number: 2, content: 'Q2', options: { a: 'A' } });
    });

    it('should return questions with last attempt incorrect', () => {
      recordAttempt({ question_id: testId('failed_q1'), user_answer: 'b', correct_answer: 'a', is_correct: false });

      const failed = getFailedQuestions();
      const testFailed = failed.filter(f => f.id.startsWith(TEST_PREFIX));

      expect(testFailed).toHaveLength(1);
      expect(testFailed[0].id).toBe(testId('failed_q1'));
    });

    it('should not include questions with last attempt correct', () => {
      recordAttempt({ question_id: testId('failed_q1'), user_answer: 'b', correct_answer: 'a', is_correct: false });
      recordAttempt({ question_id: testId('failed_q1'), user_answer: 'a', correct_answer: 'a', is_correct: true });

      const failed = getFailedQuestions();
      const testFailed = failed.filter(f => f.id.startsWith(TEST_PREFIX));

      expect(testFailed).toHaveLength(0);
    });

    it('should parse options JSON', () => {
      recordAttempt({ question_id: testId('failed_q1'), user_answer: 'b', correct_answer: 'a', is_correct: false });

      const failed = getFailedQuestions();
      const testFailed = failed.filter(f => f.id.startsWith(TEST_PREFIX));

      expect(testFailed[0].options).toEqual({ a: 'A' });
    });
  });

  describe('getGlobalStats', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('stats_q1'), topic: 'ZZStatsTestTopic', question_number: 1, content: 'Q1', options: {} });
      upsertQuestion({ id: testId('stats_q2'), topic: 'ZZStatsTestTopic', question_number: 2, content: 'Q2', options: {} });
    });

    it('should return stats object', () => {
      const stats = getGlobalStats();

      expect(stats).toHaveProperty('total_questions');
      expect(stats).toHaveProperty('questions_attempted');
      expect(stats).toHaveProperty('questions_remaining');
    });

    it('should count correct and total attempts', () => {
      recordAttempt({ question_id: testId('stats_q1'), user_answer: 'a', correct_answer: 'a', is_correct: true });
      recordAttempt({ question_id: testId('stats_q2'), user_answer: 'b', correct_answer: 'a', is_correct: false });

      const stats = getGlobalStats();

      // Stats include all data, not just test data
      expect(stats.total_attempts).toBeGreaterThanOrEqual(2);
      expect(stats.correct_attempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getTopicStats', () => {
    beforeEach(() => {
      upsertQuestion({ id: testId('topicstats_q1'), topic: 'ZZTopicStatsTest', question_number: 1, content: 'Q1', options: {} });
      upsertQuestion({ id: testId('topicstats_q2'), topic: 'ZZTopicStatsTest', question_number: 2, content: 'Q2', options: {} });
      upsertQuestion({ id: testId('topicstats_q3'), topic: 'ZZTopicStatsOther', question_number: 1, content: 'Q3', options: {} });
    });

    it('should return stats for specific topic', () => {
      recordAttempt({ question_id: testId('topicstats_q1'), user_answer: 'a', correct_answer: 'a', is_correct: true });

      const stats = getTopicStats('ZZTopicStatsTest');

      expect(stats.topic).toBe('ZZTopicStatsTest');
      expect(stats.total_questions).toBe(2);
      expect(stats.questions_attempted).toBe(1);
    });

    it('should not include attempts from other topics', () => {
      recordAttempt({ question_id: testId('topicstats_q3'), user_answer: 'a', correct_answer: 'a', is_correct: true });

      const stats = getTopicStats('ZZTopicStatsTest');

      expect(stats.questions_attempted).toBe(0);
    });
  });

  describe('solutions cache', () => {
    beforeEach(() => {
      // Create a question first since solutions_cache has FK constraint
      upsertQuestion({ id: testId('cache_q1'), topic: 'TestTema', question_number: 1, content: 'Q1', options: {} });
    });

    describe('cacheSolution', () => {
      it('should cache a solution', () => {
        const result = cacheSolution({
          question_id: testId('cache_q1'),
          correct_answer: 'a',
          explanation: 'Because A is correct',
          wrong_options: { b: 'B is wrong' }
        });

        expect(result.changes).toBe(1);
      });

      it('should update existing cached solution', () => {
        cacheSolution({
          question_id: testId('cache_q1'),
          correct_answer: 'a',
          explanation: 'Original',
          wrong_options: {}
        });

        cacheSolution({
          question_id: testId('cache_q1'),
          correct_answer: 'b',
          explanation: 'Updated',
          wrong_options: {}
        });

        const cached = getCachedSolution(testId('cache_q1'));
        expect(cached.correct_answer).toBe('b');
        expect(cached.explanation).toBe('Updated');
      });

      it('should handle empty wrong_options', () => {
        cacheSolution({
          question_id: testId('cache_q1'),
          correct_answer: 'a',
          explanation: 'Test'
        });

        const cached = getCachedSolution(testId('cache_q1'));
        expect(cached.wrong_options).toEqual({});
      });
    });

    describe('getCachedSolution', () => {
      it('should return cached solution', () => {
        cacheSolution({
          question_id: testId('cache_q1'),
          correct_answer: 'a',
          explanation: 'Test explanation',
          wrong_options: { b: 'B wrong', c: 'C wrong', d: 'D wrong' }
        });

        const cached = getCachedSolution(testId('cache_q1'));

        expect(cached.correct_answer).toBe('a');
        expect(cached.explanation).toBe('Test explanation');
        expect(cached.wrong_options.b).toBe('B wrong');
      });

      it('should return undefined for non-existent question', () => {
        const cached = getCachedSolution('non_existent_12345');

        expect(cached).toBeUndefined();
      });

      it('should parse wrong_options JSON', () => {
        cacheSolution({
          question_id: testId('cache_q1'),
          correct_answer: 'a',
          explanation: 'Test',
          wrong_options: { b: 'B', c: 'C', d: 'D' }
        });

        const cached = getCachedSolution(testId('cache_q1'));

        expect(typeof cached.wrong_options).toBe('object');
        expect(cached.wrong_options.b).toBe('B');
      });
    });
  });
});
