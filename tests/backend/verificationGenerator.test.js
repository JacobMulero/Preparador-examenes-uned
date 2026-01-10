/**
 * Unit Tests for Verification Generator Service
 * Tests the question generation logic and prompt building
 */

import {
  buildVerificationPrompt,
  parseVerificationQuestions,
  getDeliverableContent,
  getSampleExamsContent,
  TIMEOUT_MS
} from '../../server/services/verificationGenerator.js';
import {
  db,
  initializeDatabase,
  createSubject,
  createExamPdf,
  createExamPage,
  updateExamPage,
  updateExamPdfStatus
} from '../../server/database.js';

const TEST_PREFIX = 'VER_GEN_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

describe('verificationGenerator module', () => {
  beforeAll(() => {
    initializeDatabase();
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  function cleanupTestData() {
    db.prepare(`DELETE FROM exam_pages WHERE exam_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM exam_pdfs WHERE id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM subjects WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  describe('TIMEOUT_MS', () => {
    it('should be 120000 (2 minutes)', () => {
      expect(TIMEOUT_MS).toBe(120000);
    });
  });

  describe('getDeliverableContent', () => {
    beforeEach(() => {
      cleanupTestData();
    });

    it('should return null for null deliverableId', () => {
      const result = getDeliverableContent(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined deliverableId', () => {
      const result = getDeliverableContent(undefined);
      expect(result).toBeNull();
    });

    it('should return null for non-existent PDF', () => {
      const result = getDeliverableContent('nonexistent_pdf_12345');
      expect(result).toBeNull();
    });

    it('should return null for PDF with status other than completed', () => {
      // Create subject first
      createSubject({
        id: testId('subject'),
        name: 'Test Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      // Create PDF with processing status
      createExamPdf({
        id: testId('pdf1'),
        subjectId: testId('subject'),
        filename: 'test.pdf',
        originalPath: '/tmp/test.pdf'
      });

      const result = getDeliverableContent(testId('pdf1'));
      expect(result).toBeNull();
    });

    it('should return null for completed PDF with no pages', () => {
      createSubject({
        id: testId('subject2'),
        name: 'Test Subject 2',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('pdf2'),
        subjectId: testId('subject2'),
        filename: 'test2.pdf',
        originalPath: '/tmp/test2.pdf'
      });

      updateExamPdfStatus(testId('pdf2'), 'completed');

      const result = getDeliverableContent(testId('pdf2'));
      expect(result).toBeNull();
    });

    it('should return content for completed PDF with pages', () => {
      createSubject({
        id: testId('subject3'),
        name: 'Test Subject 3',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('pdf3'),
        subjectId: testId('subject3'),
        filename: 'entregable.pdf',
        pageCount: 2,
        originalPath: '/tmp/entregable.pdf'
      });

      createExamPage({
        id: testId('page1'),
        examId: testId('pdf3'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('page1'), { processedMarkdown: 'Page 1 content here' });

      createExamPage({
        id: testId('page2'),
        examId: testId('pdf3'),
        pageNumber: 2,
        status: 'completed'
      });
      updateExamPage(testId('page2'), { processedMarkdown: 'Page 2 content here' });

      updateExamPdfStatus(testId('pdf3'), 'completed');

      const result = getDeliverableContent(testId('pdf3'));
      expect(result).not.toBeNull();
      expect(result.filename).toBe('entregable.pdf');
      expect(result.pageCount).toBe(2);
      expect(result.content).toContain('Page 1 content here');
      expect(result.content).toContain('Page 2 content here');
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should use raw_markdown if processed_markdown is missing', () => {
      createSubject({
        id: testId('subject4'),
        name: 'Test Subject 4',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('pdf4'),
        subjectId: testId('subject4'),
        filename: 'raw_test.pdf',
        pageCount: 1,
        originalPath: '/tmp/raw_test.pdf'
      });

      createExamPage({
        id: testId('page3'),
        examId: testId('pdf4'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('page3'), { rawMarkdown: 'Raw markdown content only' });

      updateExamPdfStatus(testId('pdf4'), 'completed');

      const result = getDeliverableContent(testId('pdf4'));
      expect(result).not.toBeNull();
      expect(result.content).toContain('Raw markdown content only');
    });
  });

  describe('getSampleExamsContent', () => {
    beforeEach(() => {
      cleanupTestData();
    });

    it('should return null for subject with no exams', () => {
      createSubject({
        id: testId('empty_subject'),
        name: 'Empty Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      const result = getSampleExamsContent(testId('empty_subject'));
      expect(result).toBeNull();
    });

    it('should return null for subject with only non-completed exams', () => {
      createSubject({
        id: testId('pending_subject'),
        name: 'Pending Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('pending_exam'),
        subjectId: testId('pending_subject'),
        filename: 'pending.pdf',
        originalPath: '/tmp/pending.pdf'
      });

      const result = getSampleExamsContent(testId('pending_subject'));
      expect(result).toBeNull();
    });

    it('should return sample content from completed exams', () => {
      createSubject({
        id: testId('sample_subject'),
        name: 'Sample Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('sample_exam'),
        subjectId: testId('sample_subject'),
        filename: 'sample_exam.pdf',
        pageCount: 2,
        originalPath: '/tmp/sample_exam.pdf'
      });

      createExamPage({
        id: testId('sample_page1'),
        examId: testId('sample_exam'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('sample_page1'), { processedMarkdown: 'Sample exam question 1' });

      updateExamPdfStatus(testId('sample_exam'), 'completed');

      const result = getSampleExamsContent(testId('sample_subject'));
      expect(result).not.toBeNull();
      expect(result.count).toBe(1);
      expect(result.samples).toHaveLength(1);
      expect(result.samples[0].filename).toBe('sample_exam.pdf');
      expect(result.samples[0].content).toContain('Sample exam question 1');
    });

    it('should exclude specified deliverable from samples', () => {
      createSubject({
        id: testId('exclude_subject'),
        name: 'Exclude Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      // Create exam that should be included
      createExamPdf({
        id: testId('include_exam'),
        subjectId: testId('exclude_subject'),
        filename: 'include.pdf',
        pageCount: 1,
        originalPath: '/tmp/include.pdf'
      });
      createExamPage({
        id: testId('include_page'),
        examId: testId('include_exam'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('include_page'), { processedMarkdown: 'Include content' });
      updateExamPdfStatus(testId('include_exam'), 'completed');

      // Create deliverable that should be excluded
      createExamPdf({
        id: testId('exclude_exam'),
        subjectId: testId('exclude_subject'),
        filename: 'deliverable.pdf',
        pageCount: 1,
        originalPath: '/tmp/deliverable.pdf'
      });
      createExamPage({
        id: testId('exclude_page'),
        examId: testId('exclude_exam'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('exclude_page'), { processedMarkdown: 'Deliverable content' });
      updateExamPdfStatus(testId('exclude_exam'), 'completed');

      const result = getSampleExamsContent(testId('exclude_subject'), testId('exclude_exam'));
      expect(result).not.toBeNull();
      expect(result.count).toBe(1);
      expect(result.samples[0].content).not.toContain('Deliverable content');
      expect(result.samples[0].content).toContain('Include content');
    });

    it('should limit to 2 exams', () => {
      createSubject({
        id: testId('many_subject'),
        name: 'Many Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      // Create 3 completed exams
      for (let i = 1; i <= 3; i++) {
        createExamPdf({
          id: testId(`many_exam${i}`),
          subjectId: testId('many_subject'),
          filename: `exam${i}.pdf`,
          pageCount: 1,
          originalPath: `/tmp/exam${i}.pdf`
        });
        createExamPage({
          id: testId(`many_page${i}`),
          examId: testId(`many_exam${i}`),
          pageNumber: 1,
          status: 'completed'
        });
        updateExamPage(testId(`many_page${i}`), { processedMarkdown: `Content ${i}` });
        updateExamPdfStatus(testId(`many_exam${i}`), 'completed');
      }

      const result = getSampleExamsContent(testId('many_subject'));
      expect(result).not.toBeNull();
      expect(result.count).toBe(2); // Limited to 2
    });
  });

  describe('buildVerificationPrompt', () => {
    const mockSubject = {
      id: 'ds',
      name: 'Diseño de Software',
      claudeContext: {
        expertise: 'Software Design and UML'
      }
    };

    const mockSession = {
      id: 'session1',
      subject_id: 'ds',
      student_name: 'Juan Garcia',
      question_count: 5,
      focusAreas: ['grasp', 'modelo_dominio']
    };

    it('should build prompt without deliverable content', () => {
      const prompt = buildVerificationPrompt(mockSubject, mockSession, null);

      expect(prompt).toContain('Software Design and UML');
      expect(prompt).toContain('Juan Garcia');
      expect(prompt).toContain('5 preguntas');
      expect(prompt).toContain('No se ha proporcionado el trabajo del alumno');
    });

    it('should build prompt with deliverable content', () => {
      const deliverableContent = {
        filename: 'PUF_GesRAE.pdf',
        pageCount: 10,
        wordCount: 5000,
        content: 'Modelo de Dominio: Reserva, Apartamento, Cliente...'
      };

      const prompt = buildVerificationPrompt(mockSubject, mockSession, deliverableContent);

      expect(prompt).toContain('PUF_GesRAE.pdf');
      expect(prompt).toContain('10');
      expect(prompt).toContain('5000');
      expect(prompt).toContain('Modelo de Dominio: Reserva');
      expect(prompt).toContain('TRABAJO DEL ALUMNO A VERIFICAR');
      expect(prompt).not.toContain('No se ha proporcionado');
    });

    it('should include focus areas in prompt', () => {
      const prompt = buildVerificationPrompt(mockSubject, mockSession, null);

      expect(prompt).toContain('grasp');
      expect(prompt).toContain('modelo_dominio');
    });

    it('should handle session without student name', () => {
      const sessionNoName = { ...mockSession, student_name: null };
      const prompt = buildVerificationPrompt(mockSubject, sessionNoName, null);

      expect(prompt).not.toContain('ALUMNO:');
    });

    it('should handle session without focus areas', () => {
      const sessionNoAreas = { ...mockSession, focusAreas: [] };
      const prompt = buildVerificationPrompt(mockSubject, sessionNoAreas, null);

      expect(prompt).not.toContain('AREAS DE ENFOQUE');
    });

    it('should truncate long deliverable content', () => {
      const longContent = 'x'.repeat(20000);
      const deliverableContent = {
        filename: 'long.pdf',
        pageCount: 100,
        wordCount: 50000,
        content: longContent
      };

      const prompt = buildVerificationPrompt(mockSubject, mockSession, deliverableContent);

      expect(prompt).toContain('contenido truncado');
      expect(prompt.length).toBeLessThan(25000);
    });

    it('should handle subject without claudeContext', () => {
      const subjectNoContext = { id: 'test', name: 'Test Subject' };
      const prompt = buildVerificationPrompt(subjectNoContext, mockSession, null);

      expect(prompt).toContain('Test Subject');
    });

    it('should include sample exams section when provided', () => {
      const sampleExams = {
        count: 2,
        samples: [
          { filename: 'exam1.pdf', content: 'Question about GRASP patterns...' },
          { filename: 'exam2.pdf', content: 'Question about UML diagrams...' }
        ]
      };

      const prompt = buildVerificationPrompt(mockSubject, mockSession, null, sampleExams);

      expect(prompt).toContain('EXAMENES DE REFERENCIA');
      expect(prompt).toContain('exam1.pdf');
      expect(prompt).toContain('exam2.pdf');
      expect(prompt).toContain('GRASP patterns');
      expect(prompt).toContain('UML diagrams');
    });

    it('should not include sample exams section when null', () => {
      const prompt = buildVerificationPrompt(mockSubject, mockSession, null, null);

      expect(prompt).not.toContain('EXAMENES DE REFERENCIA');
    });

    it('should not include sample exams section when empty samples', () => {
      const sampleExams = {
        count: 0,
        samples: []
      };

      const prompt = buildVerificationPrompt(mockSubject, mockSession, null, sampleExams);

      expect(prompt).not.toContain('EXAMENES DE REFERENCIA');
    });

    it('should include both sample exams and deliverable content', () => {
      const deliverableContent = {
        filename: 'deliverable.pdf',
        pageCount: 5,
        wordCount: 2000,
        content: 'Student work content here'
      };

      const sampleExams = {
        count: 1,
        samples: [
          { filename: 'reference.pdf', content: 'Reference question style' }
        ]
      };

      const prompt = buildVerificationPrompt(mockSubject, mockSession, deliverableContent, sampleExams);

      expect(prompt).toContain('EXAMENES DE REFERENCIA');
      expect(prompt).toContain('reference.pdf');
      expect(prompt).toContain('TRABAJO DEL ALUMNO A VERIFICAR');
      expect(prompt).toContain('deliverable.pdf');
      expect(prompt).toContain('Student work content here');
    });
  });

  describe('parseVerificationQuestions', () => {
    it('should parse valid JSON array', () => {
      const response = `[
        {
          "content": "Explain your design decisions",
          "expectedAnswer": "Should mention GRASP",
          "criteria": ["comprension", "justificacion"],
          "section": "modelo_dominio",
          "difficulty": "medium"
        }
      ]`;

      const result = parseVerificationQuestions(response);

      expect(result.length).toBe(1);
      expect(result[0].content).toBe('Explain your design decisions');
      expect(result[0].expectedAnswer).toBe('Should mention GRASP');
      expect(result[0].criteria).toEqual(['comprension', 'justificacion']);
      expect(result[0].section).toBe('modelo_dominio');
      expect(result[0].difficulty).toBe('medium');
    });

    it('should parse JSON wrapped in markdown code block', () => {
      const response = `Here are the questions:
\`\`\`json
[
  {
    "content": "Why did you use Creator?",
    "expectedAnswer": "Explains Creator pattern",
    "criteria": ["grasp"],
    "section": "grasp",
    "difficulty": "hard"
  }
]
\`\`\`
That's all!`;

      const result = parseVerificationQuestions(response);

      expect(result.length).toBe(1);
      expect(result[0].content).toBe('Why did you use Creator?');
      expect(result[0].difficulty).toBe('hard');
    });

    it('should return empty array for invalid JSON', () => {
      const response = 'This is not JSON at all';
      const result = parseVerificationQuestions(response);
      expect(result).toEqual([]);
    });

    it('should return empty array for non-array JSON', () => {
      const response = '{"content": "not an array"}';
      const result = parseVerificationQuestions(response);
      expect(result).toEqual([]);
    });

    it('should filter out questions without content', () => {
      const response = `[
        {"content": "Valid question", "difficulty": "easy"},
        {"expectedAnswer": "Missing content"},
        {"content": null, "difficulty": "hard"},
        {"content": "Another valid", "difficulty": "medium"}
      ]`;

      const result = parseVerificationQuestions(response);

      expect(result.length).toBe(2);
      expect(result[0].content).toBe('Valid question');
      expect(result[1].content).toBe('Another valid');
    });

    it('should normalize missing fields', () => {
      const response = `[{"content": "Minimal question"}]`;
      const result = parseVerificationQuestions(response);

      expect(result.length).toBe(1);
      expect(result[0].expectedAnswer).toBe('');
      expect(result[0].criteria).toEqual([]);
      expect(result[0].section).toBe('general');
      expect(result[0].difficulty).toBe('medium');
    });

    it('should normalize invalid difficulty to medium', () => {
      const response = `[{"content": "Question", "difficulty": "impossible"}]`;
      const result = parseVerificationQuestions(response);

      expect(result[0].difficulty).toBe('medium');
    });

    it('should accept valid difficulties', () => {
      const response = `[
        {"content": "Easy Q", "difficulty": "easy"},
        {"content": "Medium Q", "difficulty": "medium"},
        {"content": "Hard Q", "difficulty": "hard"}
      ]`;
      const result = parseVerificationQuestions(response);

      expect(result[0].difficulty).toBe('easy');
      expect(result[1].difficulty).toBe('medium');
      expect(result[2].difficulty).toBe('hard');
    });

    it('should handle criteria that is not an array', () => {
      const response = `[{"content": "Q", "criteria": "not an array"}]`;
      const result = parseVerificationQuestions(response);

      expect(result[0].criteria).toEqual([]);
    });

    it('should handle empty response', () => {
      const result = parseVerificationQuestions('');
      expect(result).toEqual([]);
    });

    it('should handle whitespace-only response', () => {
      const result = parseVerificationQuestions('   \n\t  ');
      expect(result).toEqual([]);
    });

    it('should parse multiple questions', () => {
      const response = `[
        {"content": "Q1", "section": "s1"},
        {"content": "Q2", "section": "s2"},
        {"content": "Q3", "section": "s3"},
        {"content": "Q4", "section": "s4"},
        {"content": "Q5", "section": "s5"}
      ]`;
      const result = parseVerificationQuestions(response);

      expect(result.length).toBe(5);
    });

    it('should handle JSON parse errors (malformed JSON matching regex)', () => {
      // This matches the regex but is not valid JSON
      const response = '[invalid json that cannot be parsed]';
      const result = parseVerificationQuestions(response);
      expect(result).toEqual([]);
    });

    it('should handle truncated JSON array', () => {
      const response = '[{"content": "truncated';
      const result = parseVerificationQuestions(response);
      expect(result).toEqual([]);
    });
  });

  describe('getSampleExamsContent edge cases', () => {
    beforeEach(() => {
      cleanupTestData();
    });

    it('should return null if all exams are excluded', () => {
      createSubject({
        id: testId('single_subject'),
        name: 'Single Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      // Create only one exam (which we'll exclude)
      createExamPdf({
        id: testId('only_exam'),
        subjectId: testId('single_subject'),
        filename: 'only.pdf',
        pageCount: 1,
        originalPath: '/tmp/only.pdf'
      });
      createExamPage({
        id: testId('only_page'),
        examId: testId('only_exam'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('only_page'), { rawMarkdown: 'Content' });
      updateExamPdfStatus(testId('only_exam'), 'completed');

      // Exclude the only exam
      const result = getSampleExamsContent(testId('single_subject'), testId('only_exam'));
      expect(result).toBeNull();
    });

    it('should return null for completed exams with no page content', () => {
      createSubject({
        id: testId('empty_pages_subject'),
        name: 'Empty Pages Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('empty_pages_exam'),
        subjectId: testId('empty_pages_subject'),
        filename: 'empty_pages.pdf',
        pageCount: 1,
        originalPath: '/tmp/empty_pages.pdf'
      });

      // Create page without markdown content
      createExamPage({
        id: testId('no_content_page'),
        examId: testId('empty_pages_exam'),
        pageNumber: 1,
        status: 'completed'
        // No rawMarkdown or processedMarkdown
      });

      updateExamPdfStatus(testId('empty_pages_exam'), 'completed');

      const result = getSampleExamsContent(testId('empty_pages_subject'));
      expect(result).toBeNull();
    });

    it('should truncate long sample content', () => {
      createSubject({
        id: testId('long_content_subject'),
        name: 'Long Content Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('long_content_exam'),
        subjectId: testId('long_content_subject'),
        filename: 'long_content.pdf',
        pageCount: 1,
        originalPath: '/tmp/long_content.pdf'
      });

      // Create page with very long content
      const longContent = 'x'.repeat(5000);
      createExamPage({
        id: testId('long_page'),
        examId: testId('long_content_exam'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('long_page'), { processedMarkdown: longContent });

      updateExamPdfStatus(testId('long_content_exam'), 'completed');

      const result = getSampleExamsContent(testId('long_content_subject'));
      expect(result).not.toBeNull();
      // Content should be truncated to 3000 chars
      expect(result.samples[0].content.length).toBeLessThanOrEqual(3000);
    });
  });

  describe('getDeliverableContent edge cases', () => {
    beforeEach(() => {
      cleanupTestData();
    });

    it('should return null for pages without any markdown', () => {
      createSubject({
        id: testId('no_md_subject'),
        name: 'No MD Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('no_md_pdf'),
        subjectId: testId('no_md_subject'),
        filename: 'no_markdown.pdf',
        pageCount: 1,
        originalPath: '/tmp/no_markdown.pdf'
      });

      createExamPage({
        id: testId('blank_page'),
        examId: testId('no_md_pdf'),
        pageNumber: 1,
        status: 'completed'
        // No markdown content at all
      });

      updateExamPdfStatus(testId('no_md_pdf'), 'completed');

      const result = getDeliverableContent(testId('no_md_pdf'));
      expect(result).toBeNull();
    });

    it('should calculate word count correctly', () => {
      createSubject({
        id: testId('wordcount_subject'),
        name: 'Word Count Subject',
        methodology: ['test'],
        modes: ['verification']
      });

      createExamPdf({
        id: testId('wordcount_pdf'),
        subjectId: testId('wordcount_subject'),
        filename: 'wordcount.pdf',
        pageCount: 1,
        originalPath: '/tmp/wordcount.pdf'
      });

      createExamPage({
        id: testId('wordcount_page'),
        examId: testId('wordcount_pdf'),
        pageNumber: 1,
        status: 'completed'
      });
      updateExamPage(testId('wordcount_page'), { rawMarkdown: 'one two three four five' });

      updateExamPdfStatus(testId('wordcount_pdf'), 'completed');

      const result = getDeliverableContent(testId('wordcount_pdf'));
      expect(result.wordCount).toBe(5);
    });
  });

  describe('buildVerificationPrompt edge cases', () => {
    const mockSubject = {
      id: 'ds',
      name: 'Diseño de Software'
    };

    const mockSession = {
      id: 'session1',
      subject_id: 'ds',
      question_count: 5
    };

    it('should handle null focusAreas in session', () => {
      const sessionNullAreas = { ...mockSession, focusAreas: null };
      const prompt = buildVerificationPrompt(mockSubject, sessionNullAreas, null);

      expect(prompt).not.toContain('AREAS DE ENFOQUE');
    });

    it('should handle undefined question_count', () => {
      const sessionNoCount = { ...mockSession, question_count: undefined };
      const prompt = buildVerificationPrompt(mockSubject, sessionNoCount, null);

      // Should default to 5
      expect(prompt).toContain('5 preguntas');
    });
  });
});
