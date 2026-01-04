/**
 * Integration Tests for Claude Service with Mocked SDK
 * Tests the solveQuestion function by mocking @anthropic-ai/claude-agent-sdk
 */

import { jest } from '@jest/globals';

// Mock the Claude Agent SDK before importing claudeService
const mockQuery = jest.fn();

jest.unstable_mockModule('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery
}));

// Import after mocking
const { solveQuestion, parseClaudeResponse } = await import('../../server/claudeService.js');

describe('claudeService - solveQuestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create async iterator from messages
  async function* createMessageIterator(messages) {
    for (const msg of messages) {
      yield msg;
    }
  }

  describe('successful responses', () => {
    it('should solve a question and return parsed response', async () => {
      const mockResponse = {
        answer: 'a',
        explanation: 'Option A is correct because...',
        wrongOptions: { b: 'B is wrong', c: 'C is wrong', d: 'D is wrong' }
      };

      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: JSON.stringify(mockResponse) }
            ]
          }
        }
      ]));

      const result = await solveQuestion('What is SQL? a) Query language b) Programming c) Markup d) Style');

      expect(result.answer).toBe('a');
      expect(result.explanation).toBe('Option A is correct because...');
      expect(result.wrongOptions.b).toBe('B is wrong');
    });

    it('should handle result message type', async () => {
      const mockResponse = {
        answer: 'b',
        explanation: 'B is the correct answer',
        wrongOptions: {}
      };

      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'result',
          subtype: 'success',
          result: JSON.stringify(mockResponse)
        }
      ]));

      const result = await solveQuestion('Test question');

      expect(result.answer).toBe('b');
    });

    it('should prefer assistant message over result message', async () => {
      const assistantResponse = {
        answer: 'c',
        explanation: 'From assistant',
        wrongOptions: {}
      };

      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: JSON.stringify(assistantResponse) }
            ]
          }
        },
        {
          type: 'result',
          result: '{"answer": "d", "explanation": "From result"}'
        }
      ]));

      const result = await solveQuestion('Test');

      expect(result.answer).toBe('c');
    });

    it('should handle multiple content blocks', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: '{"answer": "d"' },
              { type: 'text', text: ', "explanation": "Split response", "wrongOptions": {}}' }
            ]
          }
        }
      ]));

      const result = await solveQuestion('Test');

      expect(result.answer).toBe('d');
      expect(result.explanation).toBe('Split response');
    });

    it('should skip non-text content blocks', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: '123' },
              { type: 'text', text: '{"answer": "a", "explanation": "Test", "wrongOptions": {}}' }
            ]
          }
        }
      ]));

      const result = await solveQuestion('Test');

      expect(result.answer).toBe('a');
    });
  });

  describe('error handling', () => {
    it('should throw timeout error when aborted', async () => {
      mockQuery.mockImplementation(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      });

      await expect(solveQuestion('Test')).rejects.toThrow('Claude timeout');
    });

    it('should throw error for other failures', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('Network error');
      });

      await expect(solveQuestion('Test')).rejects.toThrow('Failed to execute Claude: Network error');
    });

    it('should throw parse error for invalid JSON', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'This is not JSON' }
            ]
          }
        }
      ]));

      await expect(solveQuestion('Test')).rejects.toThrow('No JSON object found');
    });

    it('should throw error for missing answer field', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: '{"explanation": "No answer field"}' }
            ]
          }
        }
      ]));

      await expect(solveQuestion('Test')).rejects.toThrow('Missing or invalid "answer"');
    });
  });

  describe('message handling edge cases', () => {
    it('should handle empty content array', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {
            content: []
          }
        },
        {
          type: 'result',
          result: '{"answer": "a", "explanation": "From result", "wrongOptions": {}}'
        }
      ]));

      const result = await solveQuestion('Test');

      expect(result.answer).toBe('a');
    });

    it('should handle null message content', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: null
        },
        {
          type: 'result',
          result: '{"answer": "b", "explanation": "Fallback", "wrongOptions": {}}'
        }
      ]));

      const result = await solveQuestion('Test');

      expect(result.answer).toBe('b');
    });

    it('should handle messages without content', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'assistant',
          message: {}
        },
        {
          type: 'result',
          result: '{"answer": "c", "explanation": "No content", "wrongOptions": {}}'
        }
      ]));

      const result = await solveQuestion('Test');

      expect(result.answer).toBe('c');
    });

    it('should handle result message without result field', async () => {
      mockQuery.mockReturnValue(createMessageIterator([
        {
          type: 'result',
          subtype: 'end'
        },
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: '{"answer": "d", "explanation": "After empty result", "wrongOptions": {}}' }
            ]
          }
        }
      ]));

      const result = await solveQuestion('Test');

      expect(result.answer).toBe('d');
    });
  });
});
