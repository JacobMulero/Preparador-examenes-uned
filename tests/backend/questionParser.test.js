/**
 * Tests for Question Parser
 * Tests markdown parsing and question extraction
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseQuestionFile, parseAllTopics, getAvailableTopics } from '../../server/questionParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '../fixtures');

// Create test fixtures directory
beforeAll(() => {
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }
});

afterAll(() => {
  // Cleanup fixtures
  if (fs.existsSync(fixturesDir)) {
    fs.rmSync(fixturesDir, { recursive: true });
  }
});

describe('questionParser', () => {
  describe('parseQuestionFile', () => {
    it('should parse a simple question with options on separate lines', () => {
      const content = `# Test Questions

## Pregunta 1

What is a database?

a) A collection of data
b) A programming language
c) An operating system
d) A web browser
`;
      const filePath = path.join(fixturesDir, 'Preguntas_Tema1.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].id).toBe('tema1_pregunta1');
      expect(questions[0].topic).toBe('Tema1');
      expect(questions[0].question_number).toBe(1);
      expect(questions[0].options.a).toBe('A collection of data');
      expect(questions[0].options.b).toBe('A programming language');
      expect(questions[0].options.c).toBe('An operating system');
      expect(questions[0].options.d).toBe('A web browser');
    });

    it('should parse multiple questions', () => {
      const content = `## Pregunta 1

Question one

a) Option A
b) Option B
c) Option C
d) Option D

---

## Pregunta 2

Question two

a) First
b) Second
c) Third
d) Fourth
`;
      const filePath = path.join(fixturesDir, 'Preguntas_Tema2.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(2);
      expect(questions[0].question_number).toBe(1);
      expect(questions[1].question_number).toBe(2);
    });

    it('should parse question with page number', () => {
      const content = `## Pregunta 1 (Pagina 42)

What is SQL?

a) Query language
b) Programming language
c) Markup language
d) Style language
`;
      const filePath = path.join(fixturesDir, 'Preguntas_Tema3.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].question_number).toBe(1);
    });

    it('should parse question with page range', () => {
      const content = `## Pregunta 5 (Pagina 10-12)

Complex question

a) A
b) B
c) C
d) D
`;
      const filePath = path.join(fixturesDir, 'Preguntas_Tema4.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].question_number).toBe(5);
    });

    it('should parse SinTema topic', () => {
      const content = `## Pregunta 1

Generic question

a) One
b) Two
c) Three
d) Four
`;
      const filePath = path.join(fixturesDir, 'Preguntas_SinTema.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].topic).toBe('SinTema');
      expect(questions[0].id).toBe('sintema_pregunta1');
    });

    it('should handle shared statement (Enunciado)', () => {
      const content = `## Pregunta 1

**Enunciado 1:** Given a database schema with tables A and B.

En las condiciones del enunciado 1, which is correct?

a) Option A
b) Option B
c) Option C
d) Option D
`;
      const filePath = path.join(fixturesDir, 'Preguntas_Tema5.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].shared_statement).toContain('Given a database schema');
    });

    it('should parse uppercase options (A. B. C. D.)', () => {
      const content = `## Pregunta 1

What is correct?

A. First option
B. Second option
C. Third option
D. Fourth option
`;
      const filePath = path.join(fixturesDir, 'Preguntas_Tema6.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].options.a).toBe('First option');
      expect(questions[0].options.b).toBe('Second option');
    });

    it('should handle inline options format', () => {
      const content = `## Pregunta 1

What is the answer? a) First b) Second c) Third d) Fourth
`;
      const filePath = path.join(fixturesDir, 'Preguntas_Tema7.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].options.a).toBe('First');
      expect(questions[0].options.b).toBe('Second');
      expect(questions[0].options.c).toBe('Third');
      expect(questions[0].options.d).toBe('Fourth');
    });

    it('should remove leading question numbers', () => {
      const content = `## Pregunta 3

3. What is SQL injection?

a) A security vulnerability
b) A database feature
c) A query type
d) A data type
`;
      const filePath = path.join(fixturesDir, 'Preguntas_TestNum.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].content).not.toMatch(/^3\./);
    });

    it('should handle multi-line options', () => {
      const content = `## Pregunta 1

Choose the best option:

a) This is option A
   which spans multiple lines
b) Option B
c) Option C
d) Option D
`;
      const filePath = path.join(fixturesDir, 'Preguntas_MultiLine.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].options.a).toContain('multiple lines');
    });

    it('should stop multi-line option at separator (---)', () => {
      const content = `## Pregunta 1

Test question

a) Option A
   continues here
b) Option B
---

## Pregunta 2

Next question

a) A
b) B
c) C
d) D
`;
      const filePath = path.join(fixturesDir, 'Preguntas_SepTest.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions.length).toBeGreaterThanOrEqual(1);
      // Option A should not include the separator, and should contain the continued line
      expect(questions[0].options.a).toContain('continues here');
      expect(questions[0].options.b).toBeDefined();
    });

    it('should stop multi-line option at new section (##)', () => {
      const content = `## Pregunta 1

Test question

a) Option A
   continues here
b) Option B before section
## Another Section

More content
`;
      const filePath = path.join(fixturesDir, 'Preguntas_SecTest.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions.length).toBeGreaterThanOrEqual(1);
      // Option B should not include content after ##
      expect(questions[0].options.b).toBe('Option B before section');
    });

    it('should parse inline uppercase A. B. C. D. format', () => {
      const content = `## Pregunta 1

What is correct? A. Alpha B. Beta C. Gamma D. Delta
`;
      const filePath = path.join(fixturesDir, 'Preguntas_InlineUpper.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].options.a).toBe('Alpha');
      expect(questions[0].options.b).toBe('Beta');
      expect(questions[0].options.c).toBe('Gamma');
      expect(questions[0].options.d).toBe('Delta');
    });

    it('should handle unknown topic in filename', () => {
      const content = `## Pregunta 1

Test

a) A
b) B
c) C
d) D
`;
      const filePath = path.join(fixturesDir, 'SomeOtherFile.md');
      fs.writeFileSync(filePath, content);

      const questions = parseQuestionFile(filePath);

      expect(questions).toHaveLength(1);
      expect(questions[0].topic).toBe('Unknown');
    });
  });

  describe('parseAllTopics', () => {
    beforeEach(() => {
      // Create test files
      fs.writeFileSync(path.join(fixturesDir, 'Preguntas_Tema1.md'), `## Pregunta 1\nQ1\na) A\nb) B\nc) C\nd) D`);
      fs.writeFileSync(path.join(fixturesDir, 'Preguntas_Tema2.md'), `## Pregunta 1\nQ2\na) A\nb) B\nc) C\nd) D`);
      fs.writeFileSync(path.join(fixturesDir, 'NotAQuestion.md'), '# Not a question file');
    });

    it('should parse all question files from directory', () => {
      const questions = parseAllTopics(fixturesDir);

      expect(questions.length).toBeGreaterThanOrEqual(2);
    });

    it('should only parse files starting with Preguntas_', () => {
      const questions = parseAllTopics(fixturesDir);
      const topics = [...new Set(questions.map(q => q.topic))];

      expect(topics).not.toContain('NotAQuestion');
    });

    it('should continue on parse errors', () => {
      // Create a valid file and one that will work
      fs.writeFileSync(path.join(fixturesDir, 'Preguntas_Valid.md'), `## Pregunta 1\nQ\na) A\nb) B\nc) C\nd) D`);

      // This should not throw
      expect(() => parseAllTopics(fixturesDir)).not.toThrow();
    });

    it('should log error for malformed files but continue', () => {
      // Clear fixtures
      const files = fs.readdirSync(fixturesDir);
      for (const file of files) {
        const p = path.join(fixturesDir, file);
        if (fs.statSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true });
        } else {
          fs.unlinkSync(p);
        }
      }

      // Create a valid file
      fs.writeFileSync(path.join(fixturesDir, 'Preguntas_Good.md'), `## Pregunta 1\nQ\na) A\nb) B\nc) C\nd) D`);

      // Create a directory with .md extension - this will cause readFileSync to throw EISDIR
      fs.mkdirSync(path.join(fixturesDir, 'Preguntas_ErrorDir.md'));

      // Spy on console.error to verify error is logged
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Should still work and return results from the good file
      const questions = parseAllTopics(fixturesDir);

      expect(questions.length).toBeGreaterThanOrEqual(1);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls.some(call => call[0].includes('Error parsing'))).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('getAvailableTopics', () => {
    beforeEach(() => {
      // Clear and recreate fixtures
      if (fs.existsSync(fixturesDir)) {
        fs.rmSync(fixturesDir, { recursive: true });
      }
      fs.mkdirSync(fixturesDir, { recursive: true });

      fs.writeFileSync(path.join(fixturesDir, 'Preguntas_Tema1.md'), '# Tema1');
      fs.writeFileSync(path.join(fixturesDir, 'Preguntas_Tema2.md'), '# Tema2');
      fs.writeFileSync(path.join(fixturesDir, 'Preguntas_SinTema.md'), '# SinTema');
      fs.writeFileSync(path.join(fixturesDir, 'README.md'), '# Readme');
    });

    it('should return list of available topics', () => {
      const topics = getAvailableTopics(fixturesDir);

      expect(topics).toContain('Tema1');
      expect(topics).toContain('Tema2');
      expect(topics).toContain('SinTema');
    });

    it('should not include non-question files', () => {
      const topics = getAvailableTopics(fixturesDir);

      expect(topics).not.toContain('README');
    });

    it('should return sorted topics', () => {
      const topics = getAvailableTopics(fixturesDir);

      expect(topics).toEqual([...topics].sort());
    });
  });
});
