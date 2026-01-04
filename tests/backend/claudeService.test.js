/**
 * Tests for Claude Service
 * Tests prompt building and response parsing
 */

import { parseClaudeResponse, buildPrompt, TIMEOUT_MS } from '../../server/claudeService.js';

describe('claudeService', () => {
  describe('TIMEOUT_MS', () => {
    it('should be 60 seconds', () => {
      expect(TIMEOUT_MS).toBe(60000);
    });
  });

  describe('buildPrompt', () => {
    it('should build a valid prompt with question text', () => {
      const questionText = 'What is SQL?';
      const prompt = buildPrompt(questionText);

      expect(prompt).toContain(questionText);
      expect(prompt).toContain('bases de datos avanzadas');
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('"answer"');
      expect(prompt).toContain('"explanation"');
      expect(prompt).toContain('"wrongOptions"');
    });

    it('should include all required JSON fields in instructions', () => {
      const prompt = buildPrompt('Test question');

      expect(prompt).toContain('a, b, c, o d');
      expect(prompt).toContain('letra minuscula');
    });
  });

  describe('parseClaudeResponse', () => {
    it('should parse valid JSON response', () => {
      const response = `{
        "answer": "a",
        "explanation": "Because A is correct",
        "wrongOptions": {
          "b": "B is wrong because...",
          "c": "C is wrong because...",
          "d": "D is wrong because..."
        }
      }`;

      const result = parseClaudeResponse(response);

      expect(result.answer).toBe('a');
      expect(result.explanation).toBe('Because A is correct');
      expect(result.wrongOptions.b).toBe('B is wrong because...');
    });

    it('should parse JSON wrapped in code blocks', () => {
      const response = '```json\n{"answer": "b", "explanation": "Correct", "wrongOptions": {}}\n```';

      const result = parseClaudeResponse(response);

      expect(result.answer).toBe('b');
      expect(result.explanation).toBe('Correct');
    });

    it('should parse JSON wrapped in generic code blocks', () => {
      const response = '```\n{"answer": "c", "explanation": "Right answer", "wrongOptions": {}}\n```';

      const result = parseClaudeResponse(response);

      expect(result.answer).toBe('c');
    });

    it('should normalize uppercase answer to lowercase', () => {
      const response = '{"answer": "D", "explanation": "Test", "wrongOptions": {}}';

      const result = parseClaudeResponse(response);

      expect(result.answer).toBe('d');
    });

    it('should trim whitespace from answer', () => {
      const response = '{"answer": "  a  ", "explanation": "Test", "wrongOptions": {}}';

      const result = parseClaudeResponse(response);

      expect(result.answer).toBe('a');
    });

    it('should throw error for missing JSON object', () => {
      expect(() => parseClaudeResponse('No JSON here')).toThrow('No JSON object found');
    });

    it('should throw error for missing answer field', () => {
      const response = '{"explanation": "Test"}';

      expect(() => parseClaudeResponse(response)).toThrow('Missing or invalid "answer" field');
    });

    it('should throw error for invalid answer type', () => {
      const response = '{"answer": 123, "explanation": "Test"}';

      expect(() => parseClaudeResponse(response)).toThrow('Missing or invalid "answer" field');
    });

    it('should throw error for missing explanation field', () => {
      const response = '{"answer": "a"}';

      expect(() => parseClaudeResponse(response)).toThrow('Missing or invalid "explanation" field');
    });

    it('should throw error for invalid explanation type', () => {
      const response = '{"answer": "a", "explanation": 123}';

      expect(() => parseClaudeResponse(response)).toThrow('Missing or invalid "explanation" field');
    });

    it('should throw error for invalid answer letter', () => {
      const response = '{"answer": "e", "explanation": "Test", "wrongOptions": {}}';

      expect(() => parseClaudeResponse(response)).toThrow('Invalid answer "e"');
    });

    it('should throw error for invalid answer (x)', () => {
      const response = '{"answer": "x", "explanation": "Test", "wrongOptions": {}}';

      expect(() => parseClaudeResponse(response)).toThrow('Invalid answer "x"');
    });

    it('should provide empty wrongOptions if not present', () => {
      const response = '{"answer": "a", "explanation": "Test"}';

      const result = parseClaudeResponse(response);

      expect(result.wrongOptions).toEqual({});
    });

    it('should extract JSON from text with surrounding content', () => {
      const response = 'Here is the answer:\n{"answer": "b", "explanation": "Because...", "wrongOptions": {}}\nDone!';

      const result = parseClaudeResponse(response);

      expect(result.answer).toBe('b');
    });

    it('should handle complex wrongOptions', () => {
      const response = `{
        "answer": "a",
        "explanation": "A is correct because of X, Y, Z",
        "wrongOptions": {
          "b": "B fails because...",
          "c": "C would cause...",
          "d": "D is incorrect since..."
        }
      }`;

      const result = parseClaudeResponse(response);

      expect(Object.keys(result.wrongOptions)).toHaveLength(3);
      expect(result.wrongOptions.b).toContain('fails');
      expect(result.wrongOptions.c).toContain('cause');
      expect(result.wrongOptions.d).toContain('incorrect');
    });

    it('should throw on malformed JSON', () => {
      const response = '{"answer": "a", broken json';

      expect(() => parseClaudeResponse(response)).toThrow();
    });
  });
});
