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
  cacheSolution,
  // Subject functions (Fase 0)
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  // Topic functions (Fase 0)
  getTopicsBySubject,
  createTopic,
  getTopic,
  // PDF Pipeline functions (Fase 2)
  createExamPdf,
  getExamPdf,
  getExamPdfsBySubject,
  updateExamPdfStatus,
  updateExamPdfPageCount,
  createExamPage,
  getExamPage,
  getExamPages,
  updateExamPage,
  createParsedQuestion,
  getParsedQuestion,
  getParsedQuestionsByExam,
  getParsedQuestionsByStatus,
  updateParsedQuestionStatus,
  updateParsedQuestion,
  deleteExamPdf,
  // Generation Session functions (Fase 3)
  createGenerationSession,
  getGenerationSessionById,
  getGenerationSessionsBySubject,
  getGenerationSessionsByDeliverable,
  updateGenerationSessionStatus,
  addGeneratedQuestion,
  getGeneratedQuestionsBySession,
  getGeneratedQuestionById,
  recordGeneratedAttempt,
  getGeneratedAttemptsBySession,
  getSessionStats
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
    // Core tables
    db.prepare(`DELETE FROM solutions_cache WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM attempts WHERE question_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM questions WHERE id LIKE '${TEST_PREFIX}%'`).run();

    // Generation tables (Fase 3)
    db.prepare(`DELETE FROM generated_question_attempts WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM generated_test_questions WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM generation_sessions WHERE id LIKE '${TEST_PREFIX}%'`).run();

    // PDF Pipeline tables (Fase 2)
    db.prepare(`DELETE FROM parsed_questions WHERE exam_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM exam_pages WHERE exam_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM exam_pdfs WHERE id LIKE '${TEST_PREFIX}%'`).run();

    // Topics and Subjects (Fase 0)
    db.prepare(`DELETE FROM topics WHERE id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM subjects WHERE id LIKE '${TEST_PREFIX}%'`).run();
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

  // ============================================
  // Subject Functions (Fase 0)
  // ============================================

  describe('Subject functions (Fase 0)', () => {
    describe('createSubject', () => {
      it('should create a new subject with all fields', () => {
        const subject = createSubject({
          id: testId('subject1'),
          name: 'Test Subject',
          shortName: 'TS',
          description: 'A test subject',
          language: 'en',
          methodology: ['test', 'practice'],
          examType: 'test',
          modes: ['test'],
          claudeContext: { expertise: 'testing' },
          config: { maxQuestions: 50 }
        });

        expect(subject).toBeDefined();
        expect(subject.id).toBe(testId('subject1'));
        expect(subject.name).toBe('Test Subject');
        expect(subject.short_name).toBe('TS');
        expect(subject.methodology).toEqual(['test', 'practice']);
        expect(subject.modes).toEqual(['test']);
        expect(subject.claudeContext).toEqual({ expertise: 'testing' });
        expect(subject.config).toEqual({ maxQuestions: 50 });
      });

      it('should create subject with minimal fields', () => {
        const subject = createSubject({
          id: testId('subject_minimal'),
          name: 'Minimal Subject',
          methodology: ['test'],
          modes: ['test']
        });

        expect(subject).toBeDefined();
        expect(subject.id).toBe(testId('subject_minimal'));
        expect(subject.short_name).toBeNull();
        expect(subject.description).toBeNull();
        expect(subject.language).toBe('es');
        expect(subject.claudeContext).toBeNull();
      });

      it('should handle null optional fields', () => {
        const subject = createSubject({
          id: testId('subject_nulls'),
          name: 'Null Fields Subject',
          methodology: ['verification'],
          modes: ['verification']
        });

        expect(subject.short_name).toBeNull();
        expect(subject.description).toBeNull();
        expect(subject.claudeContext).toBeNull();
        expect(subject.config).toBeNull();
      });
    });

    describe('getSubjectById', () => {
      beforeEach(() => {
        createSubject({
          id: testId('getsubject1'),
          name: 'Get Subject Test',
          methodology: ['test'],
          modes: ['test'],
          claudeContext: { key: 'value' }
        });
      });

      it('should return subject by ID', () => {
        const subject = getSubjectById(testId('getsubject1'));

        expect(subject).toBeDefined();
        expect(subject.id).toBe(testId('getsubject1'));
        expect(subject.name).toBe('Get Subject Test');
      });

      it('should parse JSON fields correctly', () => {
        const subject = getSubjectById(testId('getsubject1'));

        expect(subject.methodology).toEqual(['test']);
        expect(subject.modes).toEqual(['test']);
        expect(subject.claudeContext).toEqual({ key: 'value' });
      });

      it('should return null for non-existent ID', () => {
        const subject = getSubjectById('non_existent_subject_12345');

        expect(subject).toBeNull();
      });
    });

    describe('getAllSubjects', () => {
      beforeEach(() => {
        createSubject({
          id: testId('allsubject_a'),
          name: 'Subject A',
          methodology: ['test'],
          modes: ['test']
        });
        createSubject({
          id: testId('allsubject_b'),
          name: 'Subject B',
          methodology: ['practice'],
          modes: ['practice']
        });
      });

      it('should return all subjects', () => {
        const subjects = getAllSubjects();
        const testSubjects = subjects.filter(s => s.id.startsWith(TEST_PREFIX));

        expect(testSubjects.length).toBeGreaterThanOrEqual(2);
      });

      it('should return subjects ordered by name', () => {
        const subjects = getAllSubjects();
        const testSubjects = subjects.filter(s => s.id.startsWith(TEST_PREFIX));

        // Subject A comes before Subject B alphabetically
        const indexA = testSubjects.findIndex(s => s.id === testId('allsubject_a'));
        const indexB = testSubjects.findIndex(s => s.id === testId('allsubject_b'));
        expect(indexA).toBeLessThan(indexB);
      });

      it('should parse JSON fields for all subjects', () => {
        const subjects = getAllSubjects();
        const testSubject = subjects.find(s => s.id === testId('allsubject_a'));

        expect(testSubject.methodology).toEqual(['test']);
        expect(testSubject.modes).toEqual(['test']);
      });
    });

    describe('updateSubject', () => {
      beforeEach(() => {
        createSubject({
          id: testId('updatesubject'),
          name: 'Original Name',
          shortName: 'ON',
          methodology: ['test'],
          modes: ['test']
        });
      });

      it('should update subject name', () => {
        const updated = updateSubject(testId('updatesubject'), { name: 'Updated Name' });

        expect(updated.name).toBe('Updated Name');
      });

      it('should update subject shortName', () => {
        const updated = updateSubject(testId('updatesubject'), { shortName: 'UN' });

        expect(updated.short_name).toBe('UN');
      });

      it('should update subject description', () => {
        const updated = updateSubject(testId('updatesubject'), { description: 'New description' });

        expect(updated.description).toBe('New description');
      });

      it('should update methodology', () => {
        const updated = updateSubject(testId('updatesubject'), { methodology: ['practice'] });

        expect(updated.methodology).toEqual(['practice']);
      });

      it('should update modes', () => {
        const updated = updateSubject(testId('updatesubject'), { modes: ['verification'] });

        expect(updated.modes).toEqual(['verification']);
      });

      it('should update claudeContext', () => {
        const updated = updateSubject(testId('updatesubject'), { claudeContext: { newKey: 'newValue' } });

        expect(updated.claudeContext).toEqual({ newKey: 'newValue' });
      });

      it('should return unchanged subject when no updates provided', () => {
        const original = getSubjectById(testId('updatesubject'));
        const unchanged = updateSubject(testId('updatesubject'), {});

        expect(unchanged.name).toBe(original.name);
      });

      it('should update multiple fields at once', () => {
        const updated = updateSubject(testId('updatesubject'), {
          name: 'Multi Update',
          shortName: 'MU',
          description: 'Updated desc'
        });

        expect(updated.name).toBe('Multi Update');
        expect(updated.short_name).toBe('MU');
        expect(updated.description).toBe('Updated desc');
      });
    });
  });

  // ============================================
  // Topic Functions (Fase 0)
  // ============================================

  describe('Topic functions (Fase 0)', () => {
    beforeEach(() => {
      // Create a test subject for topics
      createSubject({
        id: testId('topicsubject'),
        name: 'Topic Test Subject',
        methodology: ['test'],
        modes: ['test']
      });
    });

    describe('createTopic', () => {
      it('should create a new topic', () => {
        const topic = createTopic({
          id: testId('topic1'),
          subjectId: testId('topicsubject'),
          name: 'Test Topic 1',
          description: 'A test topic',
          orderNum: 1
        });

        expect(topic).toBeDefined();
        expect(topic.id).toBe(testId('topic1'));
        expect(topic.subject_id).toBe(testId('topicsubject'));
        expect(topic.name).toBe('Test Topic 1');
        expect(topic.description).toBe('A test topic');
        expect(topic.order_num).toBe(1);
      });

      it('should create topic with minimal fields', () => {
        const topic = createTopic({
          id: testId('topic_minimal'),
          subjectId: testId('topicsubject'),
          name: 'Minimal Topic'
        });

        expect(topic).toBeDefined();
        expect(topic.description).toBeNull();
        expect(topic.order_num).toBe(0);
      });
    });

    describe('getTopic', () => {
      beforeEach(() => {
        createTopic({
          id: testId('gettopic'),
          subjectId: testId('topicsubject'),
          name: 'Get Topic Test'
        });
      });

      it('should return topic by ID', () => {
        const topic = getTopic(testId('gettopic'));

        expect(topic).toBeDefined();
        expect(topic.id).toBe(testId('gettopic'));
        expect(topic.name).toBe('Get Topic Test');
      });

      it('should return undefined for non-existent ID', () => {
        const topic = getTopic('non_existent_topic_12345');

        expect(topic).toBeUndefined();
      });
    });

    describe('getTopicsBySubject', () => {
      beforeEach(() => {
        createTopic({
          id: testId('bysubject_t1'),
          subjectId: testId('topicsubject'),
          name: 'Topic 1',
          orderNum: 2
        });
        createTopic({
          id: testId('bysubject_t2'),
          subjectId: testId('topicsubject'),
          name: 'Topic 2',
          orderNum: 1
        });
      });

      it('should return topics for subject', () => {
        const topics = getTopicsBySubject(testId('topicsubject'));

        expect(topics).toHaveLength(2);
      });

      it('should return topics ordered by order_num', () => {
        const topics = getTopicsBySubject(testId('topicsubject'));

        expect(topics[0].order_num).toBe(1);
        expect(topics[1].order_num).toBe(2);
      });

      it('should return empty array for non-existent subject', () => {
        const topics = getTopicsBySubject('non_existent_subject_12345');

        expect(topics).toHaveLength(0);
      });
    });
  });

  // ============================================
  // PDF Pipeline Functions (Fase 2)
  // ============================================

  describe('PDF Pipeline functions (Fase 2)', () => {
    beforeEach(() => {
      // Create test subject for PDF pipeline
      createSubject({
        id: testId('pdfsubject'),
        name: 'PDF Test Subject',
        methodology: ['test'],
        modes: ['test']
      });
    });

    describe('Exam PDF functions', () => {
      describe('createExamPdf', () => {
        it('should create a new exam PDF record', () => {
          const examPdf = createExamPdf({
            id: testId('exampdf1'),
            subjectId: testId('pdfsubject'),
            filename: 'exam1.pdf',
            originalPath: '/path/to/exam1.pdf',
            pageCount: 10
          });

          expect(examPdf).toBeDefined();
          expect(examPdf.id).toBe(testId('exampdf1'));
          expect(examPdf.subject_id).toBe(testId('pdfsubject'));
          expect(examPdf.filename).toBe('exam1.pdf');
          expect(examPdf.page_count).toBe(10);
          expect(examPdf.status).toBe('uploaded');
        });

        it('should create exam PDF with minimal fields', () => {
          const examPdf = createExamPdf({
            id: testId('exampdf_min'),
            subjectId: testId('pdfsubject'),
            filename: 'exam_min.pdf',
            originalPath: '/path/to/exam_min.pdf'
          });

          expect(examPdf).toBeDefined();
          expect(examPdf.page_count).toBeNull();
          expect(examPdf.status).toBe('uploaded');
        });

        it('should create exam PDF with custom status', () => {
          const examPdf = createExamPdf({
            id: testId('exampdf_status'),
            subjectId: testId('pdfsubject'),
            filename: 'exam_status.pdf',
            originalPath: '/path/to/exam_status.pdf',
            status: 'extracting'
          });

          expect(examPdf.status).toBe('extracting');
        });
      });

      describe('getExamPdf', () => {
        beforeEach(() => {
          createExamPdf({
            id: testId('getpdf'),
            subjectId: testId('pdfsubject'),
            filename: 'get_exam.pdf',
            originalPath: '/path/to/get_exam.pdf'
          });
        });

        it('should return exam PDF by ID', () => {
          const examPdf = getExamPdf(testId('getpdf'));

          expect(examPdf).toBeDefined();
          expect(examPdf.id).toBe(testId('getpdf'));
        });

        it('should return undefined for non-existent ID', () => {
          const examPdf = getExamPdf('non_existent_pdf_12345');

          expect(examPdf).toBeUndefined();
        });
      });

      describe('getExamPdfsBySubject', () => {
        beforeEach(() => {
          createExamPdf({
            id: testId('bysubject_pdf1'),
            subjectId: testId('pdfsubject'),
            filename: 'exam1.pdf',
            originalPath: '/path/exam1.pdf'
          });
          createExamPdf({
            id: testId('bysubject_pdf2'),
            subjectId: testId('pdfsubject'),
            filename: 'exam2.pdf',
            originalPath: '/path/exam2.pdf'
          });
        });

        it('should return all PDFs for subject', () => {
          const pdfs = getExamPdfsBySubject(testId('pdfsubject'));

          expect(pdfs).toHaveLength(2);
        });

        it('should return empty array for non-existent subject', () => {
          const pdfs = getExamPdfsBySubject('non_existent_subject_12345');

          expect(pdfs).toHaveLength(0);
        });
      });

      describe('updateExamPdfStatus', () => {
        beforeEach(() => {
          createExamPdf({
            id: testId('updatestatus_pdf'),
            subjectId: testId('pdfsubject'),
            filename: 'update_status.pdf',
            originalPath: '/path/update_status.pdf'
          });
        });

        it('should update status', () => {
          const updated = updateExamPdfStatus(testId('updatestatus_pdf'), 'extracting');

          expect(updated.status).toBe('extracting');
        });

        it('should set processed_at when status is completed', () => {
          const updated = updateExamPdfStatus(testId('updatestatus_pdf'), 'completed');

          expect(updated.status).toBe('completed');
          expect(updated.processed_at).not.toBeNull();
        });

        it('should set error_message and processed_at when status is error', () => {
          const updated = updateExamPdfStatus(testId('updatestatus_pdf'), 'error', 'PDF parsing failed');

          expect(updated.status).toBe('error');
          expect(updated.error_message).toBe('PDF parsing failed');
          expect(updated.processed_at).not.toBeNull();
        });

        it('should not set processed_at for intermediate status', () => {
          const updated = updateExamPdfStatus(testId('updatestatus_pdf'), 'parsing');

          expect(updated.processed_at).toBeNull();
        });
      });

      describe('updateExamPdfPageCount', () => {
        beforeEach(() => {
          createExamPdf({
            id: testId('pagecount_pdf'),
            subjectId: testId('pdfsubject'),
            filename: 'pagecount.pdf',
            originalPath: '/path/pagecount.pdf'
          });
        });

        it('should update page count', () => {
          const updated = updateExamPdfPageCount(testId('pagecount_pdf'), 25);

          expect(updated.page_count).toBe(25);
        });
      });
    });

    describe('Exam Page functions', () => {
      beforeEach(() => {
        createExamPdf({
          id: testId('page_exam'),
          subjectId: testId('pdfsubject'),
          filename: 'page_exam.pdf',
          originalPath: '/path/page_exam.pdf'
        });
      });

      describe('createExamPage', () => {
        it('should create a new exam page', () => {
          const page = createExamPage({
            id: testId('page1'),
            examId: testId('page_exam'),
            pageNumber: 1,
            imagePath: '/images/page1.png'
          });

          expect(page).toBeDefined();
          expect(page.id).toBe(testId('page1'));
          expect(page.exam_id).toBe(testId('page_exam'));
          expect(page.page_number).toBe(1);
          expect(page.status).toBe('pending');
        });

        it('should create page with custom status', () => {
          const page = createExamPage({
            id: testId('page_custom'),
            examId: testId('page_exam'),
            pageNumber: 2,
            imagePath: '/images/page2.png',
            status: 'processing'
          });

          expect(page.status).toBe('processing');
        });
      });

      describe('getExamPage', () => {
        beforeEach(() => {
          createExamPage({
            id: testId('getpage'),
            examId: testId('page_exam'),
            pageNumber: 1,
            imagePath: '/images/getpage.png'
          });
        });

        it('should return exam page by ID', () => {
          const page = getExamPage(testId('getpage'));

          expect(page).toBeDefined();
          expect(page.id).toBe(testId('getpage'));
        });

        it('should return undefined for non-existent ID', () => {
          const page = getExamPage('non_existent_page_12345');

          expect(page).toBeUndefined();
        });
      });

      describe('getExamPages', () => {
        beforeEach(() => {
          createExamPage({
            id: testId('pages_p2'),
            examId: testId('page_exam'),
            pageNumber: 2,
            imagePath: '/images/p2.png'
          });
          createExamPage({
            id: testId('pages_p1'),
            examId: testId('page_exam'),
            pageNumber: 1,
            imagePath: '/images/p1.png'
          });
        });

        it('should return all pages for exam', () => {
          const pages = getExamPages(testId('page_exam'));

          expect(pages).toHaveLength(2);
        });

        it('should return pages ordered by page_number', () => {
          const pages = getExamPages(testId('page_exam'));

          expect(pages[0].page_number).toBe(1);
          expect(pages[1].page_number).toBe(2);
        });

        it('should return empty array for non-existent exam', () => {
          const pages = getExamPages('non_existent_exam_12345');

          expect(pages).toHaveLength(0);
        });
      });

      describe('updateExamPage', () => {
        beforeEach(() => {
          createExamPage({
            id: testId('updatepage'),
            examId: testId('page_exam'),
            pageNumber: 1,
            imagePath: '/images/updatepage.png'
          });
        });

        it('should update rawMarkdown', () => {
          const updated = updateExamPage(testId('updatepage'), { rawMarkdown: '# Raw content' });

          expect(updated.raw_markdown).toBe('# Raw content');
        });

        it('should update processedMarkdown', () => {
          const updated = updateExamPage(testId('updatepage'), { processedMarkdown: '# Processed' });

          expect(updated.processed_markdown).toBe('# Processed');
        });

        it('should update status', () => {
          const updated = updateExamPage(testId('updatepage'), { status: 'processing' });

          expect(updated.status).toBe('processing');
        });

        it('should update visionTokens', () => {
          const updated = updateExamPage(testId('updatepage'), { visionTokens: 1500 });

          expect(updated.vision_tokens).toBe(1500);
        });

        it('should set processed_at when status is completed', () => {
          const updated = updateExamPage(testId('updatepage'), { status: 'completed' });

          expect(updated.processed_at).not.toBeNull();
        });

        it('should set processed_at when status is error', () => {
          const updated = updateExamPage(testId('updatepage'), { status: 'error' });

          expect(updated.processed_at).not.toBeNull();
        });

        it('should return unchanged page when no updates provided', () => {
          const original = getExamPage(testId('updatepage'));
          const unchanged = updateExamPage(testId('updatepage'), {});

          expect(unchanged.status).toBe(original.status);
        });

        it('should update multiple fields at once', () => {
          const updated = updateExamPage(testId('updatepage'), {
            rawMarkdown: '# Multi',
            status: 'completed',
            visionTokens: 2000
          });

          expect(updated.raw_markdown).toBe('# Multi');
          expect(updated.status).toBe('completed');
          expect(updated.vision_tokens).toBe(2000);
        });
      });
    });

    describe('Parsed Question functions', () => {
      beforeEach(() => {
        createExamPdf({
          id: testId('parsed_exam'),
          subjectId: testId('pdfsubject'),
          filename: 'parsed_exam.pdf',
          originalPath: '/path/parsed_exam.pdf'
        });
        createExamPage({
          id: testId('parsed_page'),
          examId: testId('parsed_exam'),
          pageNumber: 1,
          imagePath: '/images/parsed_page.png'
        });
      });

      describe('createParsedQuestion', () => {
        it('should create a new parsed question', () => {
          const question = createParsedQuestion({
            id: testId('parsedq1'),
            examId: testId('parsed_exam'),
            pageId: testId('parsed_page'),
            questionNumber: 1,
            rawContent: 'What is SQL?',
            normalizedContent: 'What is SQL?',
            options: { a: 'A', b: 'B', c: 'C', d: 'D' }
          });

          expect(question).toBeDefined();
          expect(question.id).toBe(testId('parsedq1'));
          expect(question.exam_id).toBe(testId('parsed_exam'));
          expect(question.page_id).toBe(testId('parsed_page'));
          expect(question.question_number).toBe(1);
          expect(question.options).toEqual({ a: 'A', b: 'B', c: 'C', d: 'D' });
          expect(question.status).toBe('pending');
        });

        it('should create parsed question with minimal fields', () => {
          const question = createParsedQuestion({
            id: testId('parsedq_min'),
            examId: testId('parsed_exam'),
            questionNumber: 2,
            rawContent: 'Minimal question'
          });

          expect(question).toBeDefined();
          expect(question.page_id).toBeNull();
          expect(question.normalized_content).toBeNull();
          expect(question.options).toBeNull();
        });

        it('should create parsed question with custom status', () => {
          const question = createParsedQuestion({
            id: testId('parsedq_status'),
            examId: testId('parsed_exam'),
            questionNumber: 3,
            rawContent: 'Status question',
            status: 'reviewed'
          });

          expect(question.status).toBe('reviewed');
        });
      });

      describe('getParsedQuestion', () => {
        beforeEach(() => {
          createParsedQuestion({
            id: testId('getparsed'),
            examId: testId('parsed_exam'),
            questionNumber: 1,
            rawContent: 'Get parsed question',
            options: { a: 'Option A' }
          });
        });

        it('should return parsed question by ID', () => {
          const question = getParsedQuestion(testId('getparsed'));

          expect(question).toBeDefined();
          expect(question.id).toBe(testId('getparsed'));
        });

        it('should parse options JSON', () => {
          const question = getParsedQuestion(testId('getparsed'));

          expect(question.options).toEqual({ a: 'Option A' });
        });

        it('should return undefined for non-existent ID', () => {
          const question = getParsedQuestion('non_existent_parsedq_12345');

          expect(question).toBeUndefined();
        });
      });

      describe('getParsedQuestionsByExam', () => {
        beforeEach(() => {
          createParsedQuestion({
            id: testId('byexam_q2'),
            examId: testId('parsed_exam'),
            questionNumber: 2,
            rawContent: 'Question 2',
            options: { a: 'A2' }
          });
          createParsedQuestion({
            id: testId('byexam_q1'),
            examId: testId('parsed_exam'),
            questionNumber: 1,
            rawContent: 'Question 1',
            options: { a: 'A1' }
          });
        });

        it('should return all parsed questions for exam', () => {
          const questions = getParsedQuestionsByExam(testId('parsed_exam'));

          expect(questions).toHaveLength(2);
        });

        it('should return questions ordered by question_number', () => {
          const questions = getParsedQuestionsByExam(testId('parsed_exam'));

          expect(questions[0].question_number).toBe(1);
          expect(questions[1].question_number).toBe(2);
        });

        it('should parse options JSON for all questions', () => {
          const questions = getParsedQuestionsByExam(testId('parsed_exam'));

          expect(questions[0].options).toEqual({ a: 'A1' });
          expect(questions[1].options).toEqual({ a: 'A2' });
        });

        it('should return empty array for non-existent exam', () => {
          const questions = getParsedQuestionsByExam('non_existent_exam_12345');

          expect(questions).toHaveLength(0);
        });
      });

      describe('getParsedQuestionsByStatus', () => {
        beforeEach(() => {
          createParsedQuestion({
            id: testId('status_q1'),
            examId: testId('parsed_exam'),
            questionNumber: 1,
            rawContent: 'Pending question',
            status: 'pending'
          });
          createParsedQuestion({
            id: testId('status_q2'),
            examId: testId('parsed_exam'),
            questionNumber: 2,
            rawContent: 'Approved question',
            status: 'approved'
          });
        });

        it('should return questions by status', () => {
          const pending = getParsedQuestionsByStatus('pending');
          const testPending = pending.filter(q => q.id.startsWith(TEST_PREFIX));

          expect(testPending).toHaveLength(1);
          expect(testPending[0].status).toBe('pending');
        });

        it('should filter by status and exam_id', () => {
          const pending = getParsedQuestionsByStatus('pending', testId('parsed_exam'));

          expect(pending).toHaveLength(1);
          expect(pending[0].exam_id).toBe(testId('parsed_exam'));
        });

        it('should return empty array for non-matching status', () => {
          const rejected = getParsedQuestionsByStatus('rejected', testId('parsed_exam'));

          expect(rejected).toHaveLength(0);
        });
      });

      describe('updateParsedQuestionStatus', () => {
        beforeEach(() => {
          createParsedQuestion({
            id: testId('updatestatus_q'),
            examId: testId('parsed_exam'),
            questionNumber: 1,
            rawContent: 'Update status question'
          });
        });

        it('should update status to approved', () => {
          const updated = updateParsedQuestionStatus(testId('updatestatus_q'), 'approved');

          expect(updated.status).toBe('approved');
          expect(updated.reviewed_at).not.toBeNull();
        });

        it('should update status to rejected with notes', () => {
          const updated = updateParsedQuestionStatus(testId('updatestatus_q'), 'rejected', 'Invalid question format');

          expect(updated.status).toBe('rejected');
          expect(updated.reviewer_notes).toBe('Invalid question format');
          expect(updated.reviewed_at).not.toBeNull();
        });

        it('should handle null reviewer notes', () => {
          const updated = updateParsedQuestionStatus(testId('updatestatus_q'), 'approved', null);

          expect(updated.status).toBe('approved');
          expect(updated.reviewer_notes).toBeNull();
        });
      });

      describe('updateParsedQuestion', () => {
        beforeEach(() => {
          createParsedQuestion({
            id: testId('updateparsed_q'),
            examId: testId('parsed_exam'),
            questionNumber: 1,
            rawContent: 'Original raw',
            normalizedContent: 'Original normalized',
            options: { a: 'Original A' }
          });
        });

        it('should update normalizedContent', () => {
          const updated = updateParsedQuestion(testId('updateparsed_q'), { normalizedContent: 'New normalized' });

          expect(updated.normalized_content).toBe('New normalized');
        });

        it('should update options', () => {
          const updated = updateParsedQuestion(testId('updateparsed_q'), { options: { a: 'New A', b: 'New B' } });

          expect(updated.options).toEqual({ a: 'New A', b: 'New B' });
        });

        it('should update rawContent', () => {
          const updated = updateParsedQuestion(testId('updateparsed_q'), { rawContent: 'New raw content' });

          expect(updated.raw_content).toBe('New raw content');
        });

        it('should return unchanged question when no updates provided', () => {
          const original = getParsedQuestion(testId('updateparsed_q'));
          const unchanged = updateParsedQuestion(testId('updateparsed_q'), {});

          expect(unchanged.raw_content).toBe(original.raw_content);
        });

        it('should update multiple fields at once', () => {
          const updated = updateParsedQuestion(testId('updateparsed_q'), {
            normalizedContent: 'Multi norm',
            rawContent: 'Multi raw',
            options: { a: 'Multi A' }
          });

          expect(updated.normalized_content).toBe('Multi norm');
          expect(updated.raw_content).toBe('Multi raw');
          expect(updated.options).toEqual({ a: 'Multi A' });
        });
      });
    });

    describe('deleteExamPdf', () => {
      beforeEach(() => {
        createExamPdf({
          id: testId('delete_exam'),
          subjectId: testId('pdfsubject'),
          filename: 'delete_exam.pdf',
          originalPath: '/path/delete_exam.pdf'
        });
        createExamPage({
          id: testId('delete_page'),
          examId: testId('delete_exam'),
          pageNumber: 1,
          imagePath: '/images/delete_page.png'
        });
        createParsedQuestion({
          id: testId('delete_q'),
          examId: testId('delete_exam'),
          questionNumber: 1,
          rawContent: 'Delete question'
        });
      });

      it('should delete exam PDF and all related data', () => {
        deleteExamPdf(testId('delete_exam'));

        expect(getExamPdf(testId('delete_exam'))).toBeUndefined();
        expect(getExamPage(testId('delete_page'))).toBeUndefined();
        expect(getParsedQuestion(testId('delete_q'))).toBeUndefined();
      });
    });
  });

  // ============================================
  // Generation Session Functions (Fase 3)
  // ============================================

  describe('Generation Session functions (Fase 3)', () => {
    beforeEach(() => {
      // Create test subject for generation sessions
      createSubject({
        id: testId('gensubject'),
        name: 'Generation Test Subject',
        methodology: ['test'],
        modes: ['test']
      });
    });

    describe('createGenerationSession', () => {
      it('should create a new generation session with all fields', () => {
        const session = createGenerationSession({
          id: testId('session1'),
          subjectId: testId('gensubject'),
          studentId: 'student123',
          deliverableId: 'deliverable456',
          sessionMode: 'test',
          topicFocus: ['topic1', 'topic2'],
          difficulty: 'hard',
          questionCount: 20
        });

        expect(session).toBeDefined();
        expect(session.id).toBe(testId('session1'));
        expect(session.subject_id).toBe(testId('gensubject'));
        expect(session.student_id).toBe('student123');
        expect(session.deliverable_id).toBe('deliverable456');
        expect(session.session_mode).toBe('test');
        expect(session.topicFocus).toEqual(['topic1', 'topic2']);
        expect(session.difficulty).toBe('hard');
        expect(session.question_count).toBe(20);
        expect(session.status).toBe('pending');
      });

      it('should create session with minimal fields', () => {
        const session = createGenerationSession({
          id: testId('session_min'),
          subjectId: testId('gensubject')
        });

        expect(session).toBeDefined();
        expect(session.student_id).toBeNull();
        expect(session.deliverable_id).toBeNull();
        expect(session.session_mode).toBe('test');
        expect(session.topicFocus).toBeNull();
        expect(session.difficulty).toBe('mixed');
        expect(session.question_count).toBe(10);
      });

      it('should generate UUID if id not provided', () => {
        const session = createGenerationSession({
          subjectId: testId('gensubject')
        });

        // Clean up manually since we don't know the ID
        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
        expect(session.id.length).toBeGreaterThan(0);

        // Clean up
        db.prepare('DELETE FROM generation_sessions WHERE id = ?').run(session.id);
      });
    });

    describe('getGenerationSessionById', () => {
      beforeEach(() => {
        createGenerationSession({
          id: testId('getsession'),
          subjectId: testId('gensubject'),
          topicFocus: ['topic1']
        });
      });

      it('should return session by ID', () => {
        const session = getGenerationSessionById(testId('getsession'));

        expect(session).toBeDefined();
        expect(session.id).toBe(testId('getsession'));
      });

      it('should parse topicFocus JSON', () => {
        const session = getGenerationSessionById(testId('getsession'));

        expect(session.topicFocus).toEqual(['topic1']);
      });

      it('should return null for non-existent ID', () => {
        const session = getGenerationSessionById('non_existent_session_12345');

        expect(session).toBeNull();
      });
    });

    describe('getGenerationSessionsBySubject', () => {
      beforeEach(() => {
        createGenerationSession({
          id: testId('bysubject_s1'),
          subjectId: testId('gensubject')
        });
        createGenerationSession({
          id: testId('bysubject_s2'),
          subjectId: testId('gensubject')
        });
      });

      it('should return all sessions for subject', () => {
        const sessions = getGenerationSessionsBySubject(testId('gensubject'));

        expect(sessions).toHaveLength(2);
      });

      it('should return empty array for non-existent subject', () => {
        const sessions = getGenerationSessionsBySubject('non_existent_subject_12345');

        expect(sessions).toHaveLength(0);
      });
    });

    describe('getGenerationSessionsByDeliverable', () => {
      beforeEach(() => {
        createGenerationSession({
          id: testId('bydeliverable_s1'),
          subjectId: testId('gensubject'),
          deliverableId: 'deliverable123'
        });
        createGenerationSession({
          id: testId('bydeliverable_s2'),
          subjectId: testId('gensubject'),
          deliverableId: 'deliverable123'
        });
      });

      it('should return all sessions for deliverable', () => {
        const sessions = getGenerationSessionsByDeliverable('deliverable123');

        expect(sessions).toHaveLength(2);
      });

      it('should return empty array for non-existent deliverable', () => {
        const sessions = getGenerationSessionsByDeliverable('non_existent_deliverable_12345');

        expect(sessions).toHaveLength(0);
      });
    });

    describe('updateGenerationSessionStatus', () => {
      beforeEach(() => {
        createGenerationSession({
          id: testId('updatestatus_session'),
          subjectId: testId('gensubject')
        });
      });

      it('should update status to generating', () => {
        const updated = updateGenerationSessionStatus(testId('updatestatus_session'), 'generating');

        expect(updated.status).toBe('generating');
      });

      it('should set completed_at when status is completed', () => {
        const updated = updateGenerationSessionStatus(testId('updatestatus_session'), 'completed');

        expect(updated.status).toBe('completed');
        expect(updated.completed_at).not.toBeNull();
      });

      it('should set error_message and completed_at when status is error', () => {
        const updated = updateGenerationSessionStatus(testId('updatestatus_session'), 'error', 'Generation failed');

        expect(updated.status).toBe('error');
        expect(updated.error_message).toBe('Generation failed');
        expect(updated.completed_at).not.toBeNull();
      });

      it('should not set completed_at for intermediate status', () => {
        const updated = updateGenerationSessionStatus(testId('updatestatus_session'), 'generating');

        expect(updated.completed_at).toBeNull();
      });
    });
  });

  // ============================================
  // Generated Question Functions (Fase 3)
  // ============================================

  describe('Generated Question functions (Fase 3)', () => {
    beforeEach(() => {
      createSubject({
        id: testId('genqsubject'),
        name: 'Gen Question Subject',
        methodology: ['test'],
        modes: ['test']
      });
      createGenerationSession({
        id: testId('genqsession'),
        subjectId: testId('genqsubject')
      });
    });

    describe('addGeneratedQuestion', () => {
      it('should add a generated question with all fields', () => {
        const questionId = addGeneratedQuestion({
          id: testId('genq1'),
          sessionId: testId('genqsession'),
          questionNumber: 1,
          content: 'What is a database?',
          options: { a: 'A storage', b: 'A program', c: 'A network', d: 'A device' },
          correctAnswer: 'a',
          explanation: 'A database is a storage system',
          wrongExplanations: { b: 'Wrong because...', c: 'Wrong because...', d: 'Wrong because...' },
          rationale: 'Testing basic knowledge',
          targetedWeakness: 'definitions',
          basedOnSection: 'Chapter 1',
          difficulty: 'easy'
        });

        expect(questionId).toBe(testId('genq1'));

        const question = getGeneratedQuestionById(testId('genq1'));
        expect(question.content).toBe('What is a database?');
        expect(question.options).toEqual({ a: 'A storage', b: 'A program', c: 'A network', d: 'A device' });
        expect(question.correct_answer).toBe('a');
        expect(question.wrongExplanations).toEqual({ b: 'Wrong because...', c: 'Wrong because...', d: 'Wrong because...' });
        expect(question.difficulty).toBe('easy');
      });

      it('should add question with minimal fields', () => {
        const questionId = addGeneratedQuestion({
          id: testId('genq_min'),
          sessionId: testId('genqsession'),
          questionNumber: 2,
          content: 'Minimal question',
          options: { a: 'A', b: 'B' },
          correctAnswer: 'a',
          explanation: 'Explanation'
        });

        const question = getGeneratedQuestionById(testId('genq_min'));
        expect(question.wrongExplanations).toBeNull();
        expect(question.rationale).toBeNull();
        expect(question.difficulty).toBe('medium');
      });

      it('should generate UUID if id not provided', () => {
        const questionId = addGeneratedQuestion({
          sessionId: testId('genqsession'),
          questionNumber: 3,
          content: 'Auto ID question',
          options: { a: 'A' },
          correctAnswer: 'a',
          explanation: 'Test'
        });

        expect(questionId).toBeDefined();
        expect(questionId.length).toBeGreaterThan(0);

        // Clean up
        db.prepare('DELETE FROM generated_test_questions WHERE id = ?').run(questionId);
      });
    });

    describe('getGeneratedQuestionById', () => {
      beforeEach(() => {
        addGeneratedQuestion({
          id: testId('getgenq'),
          sessionId: testId('genqsession'),
          questionNumber: 1,
          content: 'Get generated question',
          options: { a: 'A', b: 'B' },
          correctAnswer: 'a',
          explanation: 'Test explanation',
          wrongExplanations: { b: 'B is wrong' }
        });
      });

      it('should return generated question by ID', () => {
        const question = getGeneratedQuestionById(testId('getgenq'));

        expect(question).toBeDefined();
        expect(question.id).toBe(testId('getgenq'));
      });

      it('should parse options JSON', () => {
        const question = getGeneratedQuestionById(testId('getgenq'));

        expect(question.options).toEqual({ a: 'A', b: 'B' });
      });

      it('should parse wrongExplanations JSON', () => {
        const question = getGeneratedQuestionById(testId('getgenq'));

        expect(question.wrongExplanations).toEqual({ b: 'B is wrong' });
      });

      it('should return null for non-existent ID', () => {
        const question = getGeneratedQuestionById('non_existent_genq_12345');

        expect(question).toBeNull();
      });
    });

    describe('getGeneratedQuestionsBySession', () => {
      beforeEach(() => {
        addGeneratedQuestion({
          id: testId('bysession_q2'),
          sessionId: testId('genqsession'),
          questionNumber: 2,
          content: 'Question 2',
          options: { a: 'A2' },
          correctAnswer: 'a',
          explanation: 'Exp 2'
        });
        addGeneratedQuestion({
          id: testId('bysession_q1'),
          sessionId: testId('genqsession'),
          questionNumber: 1,
          content: 'Question 1',
          options: { a: 'A1' },
          correctAnswer: 'a',
          explanation: 'Exp 1'
        });
      });

      it('should return all questions for session', () => {
        const questions = getGeneratedQuestionsBySession(testId('genqsession'));

        expect(questions).toHaveLength(2);
      });

      it('should return questions ordered by question_number', () => {
        const questions = getGeneratedQuestionsBySession(testId('genqsession'));

        expect(questions[0].question_number).toBe(1);
        expect(questions[1].question_number).toBe(2);
      });

      it('should parse JSON fields for all questions', () => {
        const questions = getGeneratedQuestionsBySession(testId('genqsession'));

        expect(questions[0].options).toEqual({ a: 'A1' });
        expect(questions[1].options).toEqual({ a: 'A2' });
      });

      it('should return empty array for non-existent session', () => {
        const questions = getGeneratedQuestionsBySession('non_existent_session_12345');

        expect(questions).toHaveLength(0);
      });
    });
  });

  // ============================================
  // Generated Question Attempts Functions (Fase 3)
  // ============================================

  describe('Generated Question Attempts functions (Fase 3)', () => {
    beforeEach(() => {
      createSubject({
        id: testId('attemptsubject'),
        name: 'Attempt Subject',
        methodology: ['test'],
        modes: ['test']
      });
      createGenerationSession({
        id: testId('attemptsession'),
        subjectId: testId('attemptsubject')
      });
      addGeneratedQuestion({
        id: testId('attemptq'),
        sessionId: testId('attemptsession'),
        questionNumber: 1,
        content: 'Attempt question',
        options: { a: 'A', b: 'B' },
        correctAnswer: 'a',
        explanation: 'Test'
      });
    });

    describe('recordGeneratedAttempt', () => {
      it('should record a correct attempt', () => {
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'a',
          isCorrect: true,
          timeSpentSeconds: 30
        });

        const attempts = getGeneratedAttemptsBySession(testId('attemptsession'));
        expect(attempts).toHaveLength(1);
        expect(attempts[0].is_correct).toBe(1);
        expect(attempts[0].time_spent_seconds).toBe(30);
      });

      it('should record an incorrect attempt', () => {
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'b',
          isCorrect: false
        });

        const attempts = getGeneratedAttemptsBySession(testId('attemptsession'));
        expect(attempts).toHaveLength(1);
        expect(attempts[0].is_correct).toBe(0);
      });

      it('should handle null time_spent_seconds', () => {
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'a',
          isCorrect: true
        });

        const attempts = getGeneratedAttemptsBySession(testId('attemptsession'));
        expect(attempts[0].time_spent_seconds).toBeNull();
      });
    });

    describe('getGeneratedAttemptsBySession', () => {
      beforeEach(() => {
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'a',
          isCorrect: true
        });
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'b',
          isCorrect: false
        });
      });

      it('should return all attempts for session', () => {
        const attempts = getGeneratedAttemptsBySession(testId('attemptsession'));

        expect(attempts).toHaveLength(2);
      });

      it('should return attempts ordered by attempted_at', () => {
        const attempts = getGeneratedAttemptsBySession(testId('attemptsession'));

        // First attempt should be first (ordered by attempted_at)
        expect(attempts[0].is_correct).toBe(1);
        expect(attempts[1].is_correct).toBe(0);
      });

      it('should return empty array for non-existent session', () => {
        const attempts = getGeneratedAttemptsBySession('non_existent_session_12345');

        expect(attempts).toHaveLength(0);
      });
    });

    describe('getSessionStats', () => {
      it('should return correct statistics', () => {
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'a',
          isCorrect: true,
          timeSpentSeconds: 20
        });
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'b',
          isCorrect: false,
          timeSpentSeconds: 40
        });

        const stats = getSessionStats(testId('attemptsession'));

        expect(stats.total_attempts).toBe(2);
        expect(stats.correct).toBe(1);
        expect(stats.avg_time).toBe(30);
      });

      it('should return zeros/nulls for session with no attempts', () => {
        const stats = getSessionStats(testId('attemptsession'));

        expect(stats.total_attempts).toBe(0);
        // SUM returns null when there are no rows, not 0
        expect(stats.correct).toBeNull();
        expect(stats.avg_time).toBeNull();
      });

      it('should handle all correct attempts', () => {
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'a',
          isCorrect: true
        });
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'a',
          isCorrect: true
        });

        const stats = getSessionStats(testId('attemptsession'));

        expect(stats.total_attempts).toBe(2);
        expect(stats.correct).toBe(2);
      });

      it('should handle all incorrect attempts', () => {
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'b',
          isCorrect: false
        });
        recordGeneratedAttempt({
          questionId: testId('attemptq'),
          sessionId: testId('attemptsession'),
          userAnswer: 'c',
          isCorrect: false
        });

        const stats = getSessionStats(testId('attemptsession'));

        expect(stats.total_attempts).toBe(2);
        expect(stats.correct).toBe(0);
      });
    });
  });
});
