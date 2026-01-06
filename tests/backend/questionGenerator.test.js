/**
 * Tests for Question Generator Service
 * Tests generateTestQuestions, internal helpers, and all edge cases
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the @anthropic-ai/claude-agent-sdk module
const mockQuery = jest.fn();
jest.unstable_mockModule('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery
}));

// Mock the database module
const mockGetGenerationSessionById = jest.fn();
const mockGetSubjectById = jest.fn();
const mockUpdateGenerationSessionStatus = jest.fn();
const mockAddGeneratedQuestion = jest.fn();
const mockGetQuestionsByTopic = jest.fn();
const mockGetAllTopics = jest.fn();

jest.unstable_mockModule('../../server/database.js', () => ({
  getGenerationSessionById: mockGetGenerationSessionById,
  getSubjectById: mockGetSubjectById,
  updateGenerationSessionStatus: mockUpdateGenerationSessionStatus,
  addGeneratedQuestion: mockAddGeneratedQuestion,
  getQuestionsByTopic: mockGetQuestionsByTopic,
  getAllTopics: mockGetAllTopics
}));

// Import the module after mocking
const questionGeneratorModule = await import('../../server/services/questionGenerator.js');
const { generateTestQuestions } = questionGeneratorModule;
const questionGeneratorDefault = questionGeneratorModule.default;

describe('questionGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // generateTestQuestions - Error Cases
  // ============================================
  describe('generateTestQuestions - Error Cases', () => {
    it('should throw error when session not found', async () => {
      mockGetGenerationSessionById.mockReturnValue(null);

      await expect(generateTestQuestions('nonexistent-session'))
        .rejects.toThrow('Session not found');

      expect(mockGetGenerationSessionById).toHaveBeenCalledWith('nonexistent-session');
    });

    it('should throw error when subject not found', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'invalid-subject',
        question_count: 10,
        difficulty: 'mixed'
      });
      mockGetSubjectById.mockReturnValue(null);

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('Subject not found');

      expect(mockGetSubjectById).toHaveBeenCalledWith('invalid-subject');
    });

    it('should throw error when no real questions found', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 10,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue({
        id: 'bda',
        name: 'Bases de Datos Avanzadas'
      });
      mockGetAllTopics.mockReturnValue([]);

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('No real questions found to base generation on');

      expect(mockUpdateGenerationSessionStatus).toHaveBeenCalledWith('session-1', 'generating');
      expect(mockUpdateGenerationSessionStatus).toHaveBeenCalledWith('session-1', 'error', 'No real questions found to base generation on');
    });

    it('should update status to error on failure', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 10,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue({
        id: 'bda',
        name: 'Bases de Datos Avanzadas'
      });
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([]);

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('No real questions found to base generation on');

      expect(mockUpdateGenerationSessionStatus).toHaveBeenCalledWith('session-1', 'error', expect.any(String));
    });
  });

  // ============================================
  // generateTestQuestions - Claude Timeout
  // ============================================
  describe('generateTestQuestions - Claude Integration', () => {
    const mockSession = {
      id: 'session-1',
      subject_id: 'bda',
      question_count: 2,
      difficulty: 'mixed',
      topic_focus: null
    };

    const mockSubject = {
      id: 'bda',
      name: 'Bases de Datos Avanzadas'
    };

    const mockTopics = [{ topic: 'Tema1' }];

    const mockQuestions = [
      {
        id: 'q1',
        topic: 'Tema1',
        content: 'What is SQL?',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }
    ];

    beforeEach(() => {
      mockGetGenerationSessionById.mockReturnValue(mockSession);
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue(mockTopics);
      mockGetQuestionsByTopic.mockReturnValue(mockQuestions);
    });

    it('should handle Claude timeout via AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          throw abortError;
        }
      }));

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('Claude timeout after 2 minutes');

      expect(mockUpdateGenerationSessionStatus).toHaveBeenCalledWith('session-1', 'error', 'Claude timeout after 2 minutes');
    });

    it('should handle Claude timeout via aborted signal', async () => {
      const error = new Error('Signal aborted');

      mockQuery.mockImplementation(({ abortController }) => {
        // Simulate abort
        abortController.abort();
        return {
          [Symbol.asyncIterator]: async function* () {
            throw error;
          }
        };
      });

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('Claude timeout after 2 minutes');
    });

    it('should rethrow non-abort errors from Claude', async () => {
      const networkError = new Error('Network failure');

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          throw networkError;
        }
      }));

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('Network failure');
    });

    it('should throw error when no valid questions were generated', async () => {
      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'No JSON here' }]
            }
          };
        }
      }));

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('No valid questions were generated');
    });

    it('should process assistant messages correctly', async () => {
      const validResponse = JSON.stringify([{
        content: 'What is a B-tree?',
        options: { a: 'A tree', b: 'Index', c: 'Table', d: 'View' },
        correctAnswer: 'b',
        explanation: 'B-tree is an index structure',
        wrongExplanations: { a: 'Wrong', c: 'Wrong', d: 'Wrong' },
        basedOn: 'Topic 1',
        difficulty: 'medium'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: validResponse }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('What is a B-tree?');
      expect(mockAddGeneratedQuestion).toHaveBeenCalled();
      expect(mockUpdateGenerationSessionStatus).toHaveBeenCalledWith('session-1', 'completed');
    });

    it('should handle result type messages', async () => {
      const validResponse = JSON.stringify([{
        content: 'Test question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'A is correct'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'result',
            result: validResponse
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should prefer assistant messages over result messages', async () => {
      const assistantResponse = JSON.stringify([{
        content: 'Assistant question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'From assistant'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: assistantResponse }]
            }
          };
          yield {
            type: 'result',
            result: 'This should be ignored'
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result[0].content).toBe('Assistant question');
    });

    it('should skip non-text content blocks', async () => {
      const validResponse = JSON.stringify([{
        content: 'Test question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'b',
        explanation: 'B is correct'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [
                { type: 'image', data: 'base64...' },
                { type: 'text', text: validResponse }
              ]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should handle messages without content', async () => {
      const validResponse = JSON.stringify([{
        content: 'Test question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'c',
        explanation: 'C is correct'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'assistant', message: {} };
          yield { type: 'assistant', message: { content: null } };
          yield {
            type: 'assistant',
            message: { content: [{ type: 'text', text: validResponse }] }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });
  });

  // ============================================
  // getSampleRealQuestions - Topic Focus
  // ============================================
  describe('getSampleRealQuestions (via generateTestQuestions)', () => {
    const mockSubject = {
      id: 'bda',
      name: 'Bases de Datos Avanzadas'
    };

    it('should filter topics based on topicFocus', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 2,
        difficulty: 'mixed',
        topic_focus: JSON.stringify(['Query'])
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([
        { topic: 'Query Processing' },
        { topic: 'Transactions' },
        { topic: 'Recovery' }
      ]);

      // Only return questions for Query Processing
      mockGetQuestionsByTopic.mockImplementation((topic) => {
        if (topic === 'Query Processing') {
          return [{
            id: 'q1',
            topic: 'Query Processing',
            content: 'Query question',
            options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
          }];
        }
        return [];
      });

      const validResponse = JSON.stringify([{
        content: 'Generated question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'Correct'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: { content: [{ type: 'text', text: validResponse }] }
          };
        }
      }));

      await generateTestQuestions('session-1');

      // Should only call getQuestionsByTopic for Query Processing
      expect(mockGetQuestionsByTopic).toHaveBeenCalledWith('Query Processing', 'bda');
      expect(mockGetQuestionsByTopic).not.toHaveBeenCalledWith('Transactions', 'bda');
    });

    it('should match topics bidirectionally (focus includes topic)', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 2,
        difficulty: 'mixed',
        topic_focus: JSON.stringify(['Query Processing'])
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([
        { topic: 'Query' }  // Shorter topic name
      ]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Query',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      const validResponse = JSON.stringify([{
        content: 'Question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'Correct'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: { content: [{ type: 'text', text: validResponse }] }
          };
        }
      }));

      await generateTestQuestions('session-1');

      // Should match because focus 'Query Processing' includes 'query'
      expect(mockGetQuestionsByTopic).toHaveBeenCalledWith('Query', 'bda');
    });

    it('should include all topics when topicFocus is empty array', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 2,
        difficulty: 'mixed',
        topic_focus: JSON.stringify([])
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([
        { topic: 'Topic1' },
        { topic: 'Topic2' }
      ]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      const validResponse = JSON.stringify([{
        content: 'Question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'Correct'
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: { content: [{ type: 'text', text: validResponse }] }
          };
        }
      }));

      await generateTestQuestions('session-1');

      expect(mockGetQuestionsByTopic).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // formatQuestionForPrompt
  // ============================================
  describe('formatQuestionForPrompt (via generateTestQuestions)', () => {
    const mockSubject = {
      id: 'bda',
      name: 'Bases de Datos Avanzadas'
    };

    it('should handle options as JSON string', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question with string options',
        options: JSON.stringify({ a: 'Option A', b: 'Option B', c: 'Option C', d: 'Option D' })
      }]);

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Test',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'Correct'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      expect(capturedPrompt).toContain('Option A');
      expect(capturedPrompt).toContain('Option B');
    });

    it('should handle options as object', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question with object options',
        options: { a: 'Obj A', b: 'Obj B', c: 'Obj C', d: 'Obj D' }  // Already an object
      }]);

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Test',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'Correct'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      expect(capturedPrompt).toContain('Obj A');
    });
  });

  // ============================================
  // buildGenerationPrompt - Difficulty
  // ============================================
  describe('buildGenerationPrompt (via generateTestQuestions)', () => {
    const mockSubject = {
      id: 'bda',
      name: 'Bases de Datos Avanzadas'
    };

    const setupMocks = (difficulty) => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: difficulty,
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);
    };

    it('should include mixed difficulty instructions', async () => {
      setupMocks('mixed');

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Q',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'E'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      expect(capturedPrompt).toContain('Varia la dificultad');
    });

    it('should include easy difficulty instructions', async () => {
      setupMocks('easy');

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Q',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'E'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      expect(capturedPrompt).toContain('MAS FACILES');
    });

    it('should include hard difficulty instructions', async () => {
      setupMocks('hard');

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Q',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'E'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      expect(capturedPrompt).toContain('MAS DIFICILES');
    });

    it('should handle undefined difficulty (defaults)', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: null,  // Should default to 10
        difficulty: null,       // Should default to 'mixed'
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Q',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'E'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      expect(capturedPrompt).toContain('10 preguntas');
      expect(capturedPrompt).toContain('Varia la dificultad');
    });
  });

  // ============================================
  // parseGeneratedQuestions
  // ============================================
  describe('parseGeneratedQuestions (via generateTestQuestions)', () => {
    const mockSubject = {
      id: 'bda',
      name: 'Bases de Datos Avanzadas'
    };

    const setupBasicMocks = () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);
    };

    it('should parse JSON wrapped in code blocks', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '```json\n[{"content": "Q", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "a", "explanation": "E"}]\n```'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should parse JSON wrapped in generic code blocks', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '```\n[{"content": "Q", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "E"}]\n```'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
      expect(result[0].correctAnswer).toBe('b');
    });

    it('should normalize uppercase correctAnswer to lowercase', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "C", "explanation": "E"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result[0].correctAnswer).toBe('c');
    });

    it('should filter out questions with missing content', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "a", "explanation": "E"}, {"content": "Valid Q", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "E2"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Valid Q');
    });

    it('should filter out questions with non-string content', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": 123, "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "a", "explanation": "E"}, {"content": "Valid", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "E2"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should filter out questions with missing options', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", "correctAnswer": "a", "explanation": "E"}, {"content": "Q2", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "E2"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should filter out questions with non-object options', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", "options": "invalid", "correctAnswer": "a", "explanation": "E"}, {"content": "Q2", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "E2"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should filter out questions with missing option keys', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", "options": {"a": "A", "b": "B"}, "correctAnswer": "a", "explanation": "E"}, {"content": "Q2", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "E2"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should filter out questions with missing correctAnswer', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "explanation": "E"}, {"content": "Q2", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "c", "explanation": "E2"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should filter out questions with invalid correctAnswer letter', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "e", "explanation": "E"}, {"content": "Q2", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "d", "explanation": "E2"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
      expect(result[0].correctAnswer).toBe('d');
    });

    it('should filter out questions with missing explanation', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "a"}, {"content": "Q2", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "Valid"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should filter out questions with non-string explanation', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "a", "explanation": 123}, {"content": "Q2", "options": {"a": "A", "b": "B", "c": "C", "d": "D"}, "correctAnswer": "b", "explanation": "Valid"}]'
              }]
            }
          };
        }
      }));

      const result = await generateTestQuestions('session-1');

      expect(result).toHaveLength(1);
    });

    it('should return empty array for JSON without array brackets', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '{"content": "Q1"}'  // Object, not array
              }]
            }
          };
        }
      }));

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('No valid questions were generated');
    });

    it('should return empty array for invalid JSON inside array brackets', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: '[{"content": "Q1", invalid json here}]'  // Has brackets but malformed
              }]
            }
          };
        }
      }));

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('No valid questions were generated');
    });

    it('should return empty array when no JSON array found', async () => {
      setupBasicMocks();

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: 'Just some text without any JSON array'
              }]
            }
          };
        }
      }));

      await expect(generateTestQuestions('session-1'))
        .rejects.toThrow('No valid questions were generated');
    });
  });

  // ============================================
  // addGeneratedQuestion - All Fields
  // ============================================
  describe('addGeneratedQuestion calls', () => {
    const mockSubject = {
      id: 'bda',
      name: 'Bases de Datos Avanzadas'
    };

    it('should save questions with all fields', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: JSON.stringify([{
                  content: 'Generated Q',
                  options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                  correctAnswer: 'a',
                  explanation: 'Explanation',
                  wrongExplanations: { b: 'B wrong', c: 'C wrong', d: 'D wrong' },
                  rationale: 'Rationale',
                  targetedWeakness: 'Weak point',
                  section: 'Section 1',
                  difficulty: 'hard'
                }])
              }]
            }
          };
        }
      }));

      await generateTestQuestions('session-1');

      expect(mockAddGeneratedQuestion).toHaveBeenCalledWith({
        sessionId: 'session-1',
        questionNumber: 1,
        content: 'Generated Q',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'a',
        explanation: 'Explanation',
        wrongExplanations: { b: 'B wrong', c: 'C wrong', d: 'D wrong' },
        rationale: 'Rationale',
        targetedWeakness: 'Weak point',
        basedOnSection: 'Section 1',
        difficulty: 'hard'
      });
    });

    it('should save questions with basedOn field (fallback)', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: JSON.stringify([{
                  content: 'Generated Q',
                  options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                  correctAnswer: 'b',
                  explanation: 'Explanation',
                  basedOn: 'Based on topic X'
                }])
              }]
            }
          };
        }
      }));

      await generateTestQuestions('session-1');

      expect(mockAddGeneratedQuestion).toHaveBeenCalledWith(expect.objectContaining({
        basedOnSection: 'Based on topic X'
      }));
    });

    it('should handle missing optional fields with defaults', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: JSON.stringify([{
                  content: 'Minimal Q',
                  options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                  correctAnswer: 'c',
                  explanation: 'Explanation only'
                  // No wrongExplanations, rationale, etc.
                }])
              }]
            }
          };
        }
      }));

      await generateTestQuestions('session-1');

      expect(mockAddGeneratedQuestion).toHaveBeenCalledWith({
        sessionId: 'session-1',
        questionNumber: 1,
        content: 'Minimal Q',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        correctAnswer: 'c',
        explanation: 'Explanation only',
        wrongExplanations: null,
        rationale: null,
        targetedWeakness: null,
        basedOnSection: null,
        difficulty: 'medium'
      });
    });

    it('should increment question numbers for multiple questions', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 3,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Tema1' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Tema1',
        content: 'Question',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{
                type: 'text',
                text: JSON.stringify([
                  { content: 'Q1', options: { a: 'A', b: 'B', c: 'C', d: 'D' }, correctAnswer: 'a', explanation: 'E1' },
                  { content: 'Q2', options: { a: 'A', b: 'B', c: 'C', d: 'D' }, correctAnswer: 'b', explanation: 'E2' },
                  { content: 'Q3', options: { a: 'A', b: 'B', c: 'C', d: 'D' }, correctAnswer: 'c', explanation: 'E3' }
                ])
              }]
            }
          };
        }
      }));

      await generateTestQuestions('session-1');

      expect(mockAddGeneratedQuestion).toHaveBeenCalledTimes(3);
      expect(mockAddGeneratedQuestion).toHaveBeenNthCalledWith(1, expect.objectContaining({ questionNumber: 1 }));
      expect(mockAddGeneratedQuestion).toHaveBeenNthCalledWith(2, expect.objectContaining({ questionNumber: 2 }));
      expect(mockAddGeneratedQuestion).toHaveBeenNthCalledWith(3, expect.objectContaining({ questionNumber: 3 }));
    });
  });

  // ============================================
  // sourceTopic in getSampleRealQuestions
  // ============================================
  describe('sourceTopic handling', () => {
    const mockSubject = {
      id: 'bda',
      name: 'Bases de Datos Avanzadas'
    };

    it('should add sourceTopic to questions', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Query Processing' }]);
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Query Processing',
        content: 'What is a join?',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Q',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'E'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      // The prompt should contain the source topic
      expect(capturedPrompt).toContain('Query Processing');
    });

    it('should use topic as fallback when sourceTopic is not set', async () => {
      mockGetGenerationSessionById.mockReturnValue({
        id: 'session-1',
        subject_id: 'bda',
        question_count: 1,
        difficulty: 'mixed',
        topic_focus: null
      });
      mockGetSubjectById.mockReturnValue(mockSubject);
      mockGetAllTopics.mockReturnValue([{ topic: 'Recovery System' }]);
      // Return a question without explicit sourceTopic (only topic field)
      mockGetQuestionsByTopic.mockReturnValue([{
        id: 'q1',
        topic: 'Recovery System',
        content: 'What is ARIES?',
        options: JSON.stringify({ a: 'A', b: 'B', c: 'C', d: 'D' })
      }]);

      let capturedPrompt = '';
      mockQuery.mockImplementation(({ prompt }) => {
        capturedPrompt = prompt;
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: JSON.stringify([{
                    content: 'Q',
                    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
                    correctAnswer: 'a',
                    explanation: 'E'
                  }])
                }]
              }
            };
          }
        };
      });

      await generateTestQuestions('session-1');

      // The prompt should contain the topic (used as fallback for sourceTopic)
      expect(capturedPrompt).toContain('Recovery System');
      expect(capturedPrompt).toContain('PREGUNTA (Recovery System)');
    });
  });

  // ============================================
  // Default Export
  // ============================================
  describe('default export', () => {
    it('should export generateTestQuestions function', () => {
      expect(questionGeneratorDefault).toBeDefined();
      expect(questionGeneratorDefault.generateTestQuestions).toBe(generateTestQuestions);
    });
  });
});
