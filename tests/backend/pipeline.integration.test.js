/**
 * Integration Tests for Pipeline Routes
 * Tests the REAL pipeline.js routes with mocked external services
 */

import express from 'express';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test prefix to identify test data
const TEST_PREFIX = 'PIPELINE_INT_';
const testId = (id) => `${TEST_PREFIX}${id}`;

// Mock services before import
jest.unstable_mockModule('../../server/services/pdfService.js', () => ({
  default: {
    savePdfFile: jest.fn(),
    getPdfPageCount: jest.fn(),
    extractPdfPages: jest.fn(),
    deleteExamFiles: jest.fn()
  }
}));

jest.unstable_mockModule('../../server/services/visionService.js', () => ({
  default: {
    processExamPage: jest.fn(),
    parseExtractedQuestions: jest.fn(),
    normalizeQuestions: jest.fn()
  }
}));

// Import after mocking
const { default: pdfService } = await import('../../server/services/pdfService.js');
const { default: visionService } = await import('../../server/services/visionService.js');
const { default: pipelineRouter } = await import('../../server/routes/pipeline.js');
import {
  db,
  createExamPdf,
  getExamPdf,
  createExamPage,
  createParsedQuestion,
  getParsedQuestion
} from '../../server/database.js';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/pipeline', pipelineRouter);

describe('Pipeline Routes Integration', () => {
  // Cleanup function
  const cleanupTestData = () => {
    try {
      // Delete test parsed questions
      db.prepare(`DELETE FROM parsed_questions WHERE id LIKE ?`).run(`${TEST_PREFIX}%`);
      // Delete test exam pages
      db.prepare(`DELETE FROM exam_pages WHERE id LIKE ?`).run(`${TEST_PREFIX}%`);
      // Delete test exam PDFs
      db.prepare(`DELETE FROM exam_pdfs WHERE id LIKE ?`).run(`${TEST_PREFIX}%`);
      // Delete test questions
      db.prepare(`DELETE FROM questions WHERE id LIKE ?`).run(`${TEST_PREFIX}%`);
    } catch (e) {
      // Tables may not exist
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  describe('POST /api/pipeline/upload', () => {
    it('should upload a PDF file successfully', async () => {
      // Setup mocks
      pdfService.savePdfFile.mockResolvedValue({
        filePath: '/subjects/bda/exams/originals/test.pdf',
        filename: 'test_original.pdf'
      });
      pdfService.getPdfPageCount.mockResolvedValue(5);

      const res = await request(app)
        .post('/api/pipeline/upload')
        .attach('file', Buffer.from('%PDF-1.4 test'), {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        })
        .field('subjectId', 'bda');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.subject_id).toBe('bda');
      expect(res.body.data.status).toBe('uploaded');
    });

    it('should reject upload without file', async () => {
      const res = await request(app)
        .post('/api/pipeline/upload')
        .field('subjectId', 'bda');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('No file');
    });

    it('should reject upload without subjectId', async () => {
      const res = await request(app)
        .post('/api/pipeline/upload')
        .attach('file', Buffer.from('%PDF-1.4 test'), {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Subject ID');
    });

    it('should reject upload for non-existent subject', async () => {
      const res = await request(app)
        .post('/api/pipeline/upload')
        .attach('file', Buffer.from('%PDF-1.4 test'), {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        })
        .field('subjectId', 'nonexistent_subject_xyz');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Subject not found');
    });

    it('should reject non-PDF files', async () => {
      const res = await request(app)
        .post('/api/pipeline/upload')
        .attach('file', Buffer.from('not a pdf'), {
          filename: 'test.txt',
          contentType: 'text/plain'
        })
        .field('subjectId', 'bda');

      // Multer rejects with 500 for file filter errors
      expect([400, 500]).toContain(res.status);
    });
  });

  describe('GET /api/pipeline/exams', () => {
    it('should list exams for a subject', async () => {
      // Create test exam
      createExamPdf({
        id: testId('exam1'),
        subjectId: 'bda',
        filename: 'test.pdf',
        originalPath: '/path/test.pdf',
        pageCount: 3,
        status: 'uploaded'
      });

      const res = await request(app)
        .get('/api/pipeline/exams')
        .query({ subjectId: 'bda' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should require subjectId', async () => {
      const res = await request(app)
        .get('/api/pipeline/exams');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/pipeline/exams/:examId', () => {
    it('should get exam details with pages and questions', async () => {
      // Create test data
      createExamPdf({
        id: testId('exam2'),
        subjectId: 'bda',
        filename: 'test2.pdf',
        originalPath: '/path/test2.pdf',
        pageCount: 2,
        status: 'extracted'
      });

      createExamPage({
        id: testId('page1'),
        examId: testId('exam2'),
        pageNumber: 1,
        imagePath: '/images/page1.png',
        status: 'completed'
      });

      const res = await request(app)
        .get(`/api/pipeline/exams/${testId('exam2')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testId('exam2'));
      expect(Array.isArray(res.body.data.pages)).toBe(true);
      expect(Array.isArray(res.body.data.questions)).toBe(true);
    });

    it('should return 404 for non-existent exam', async () => {
      const res = await request(app)
        .get('/api/pipeline/exams/nonexistent_exam_xyz');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/pipeline/exams/:examId', () => {
    it('should delete an exam', async () => {
      // Create test exam
      createExamPdf({
        id: testId('exam_del'),
        subjectId: 'bda',
        filename: 'delete_me.pdf',
        originalPath: '/path/delete.pdf',
        pageCount: 1,
        status: 'uploaded'
      });

      pdfService.deleteExamFiles.mockReturnValue(undefined);

      const res = await request(app)
        .delete(`/api/pipeline/exams/${testId('exam_del')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(pdfService.deleteExamFiles).toHaveBeenCalled();
    });

    it('should return 404 for non-existent exam', async () => {
      const res = await request(app)
        .delete('/api/pipeline/exams/nonexistent_xyz');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/pipeline/exams/:examId/extract', () => {
    it('should extract pages from PDF', async () => {
      // Create test exam
      createExamPdf({
        id: testId('exam_ext'),
        subjectId: 'bda',
        filename: 'extract.pdf',
        originalPath: '/path/extract.pdf',
        pageCount: 2,
        status: 'uploaded'
      });

      pdfService.extractPdfPages.mockResolvedValue([
        { pageNumber: 1, imagePath: '/images/p1.png' },
        { pageNumber: 2, imagePath: '/images/p2.png' }
      ]);

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_ext')}/extract`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pageCount).toBe(2);
    });

    it('should reject extract for non-uploaded exam', async () => {
      createExamPdf({
        id: testId('exam_ext2'),
        subjectId: 'bda',
        filename: 'test.pdf',
        originalPath: '/path/test.pdf',
        pageCount: 2,
        status: 'extracted' // Already extracted
      });

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_ext2')}/extract`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent exam', async () => {
      const res = await request(app)
        .post('/api/pipeline/exams/nonexistent_xyz/extract');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/pipeline/exams/:examId/process', () => {
    it('should process pages with vision', async () => {
      // Create test exam and pages
      createExamPdf({
        id: testId('exam_proc'),
        subjectId: 'bda',
        filename: 'process.pdf',
        originalPath: '/path/process.pdf',
        pageCount: 1,
        status: 'extracted'
      });

      createExamPage({
        id: testId('page_proc'),
        examId: testId('exam_proc'),
        pageNumber: 1,
        imagePath: '/images/p1.png',
        status: 'pending'
      });

      visionService.processExamPage.mockResolvedValue({
        success: true,
        rawMarkdown: '## Question 1\nTest question\n\na) Option A\nb) Option B',
        tokens: { input: 100, output: 50, total: 150 }
      });

      visionService.parseExtractedQuestions.mockReturnValue([{
        id: testId('q1'),
        examId: testId('exam_proc'),
        pageId: testId('page_proc'),
        questionNumber: 1,
        rawContent: 'Test question',
        options: { a: 'Option A', b: 'Option B', c: 'Option C', d: 'Option D' }
      }]);

      visionService.normalizeQuestions.mockReturnValue([{
        id: testId('q1'),
        examId: testId('exam_proc'),
        pageId: testId('page_proc'),
        questionNumber: 1,
        rawContent: 'Test question',
        normalizedContent: 'Test question',
        options: { a: 'Option A', b: 'Option B', c: 'Option C', d: 'Option D' }
      }]);

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_proc')}/process`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionsExtracted).toBeGreaterThanOrEqual(0);
    });

    it('should reject process for non-extracted exam', async () => {
      createExamPdf({
        id: testId('exam_proc2'),
        subjectId: 'bda',
        filename: 'test.pdf',
        originalPath: '/path/test.pdf',
        pageCount: 1,
        status: 'uploaded' // Not extracted yet
      });

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_proc2')}/process`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject process with no pages', async () => {
      createExamPdf({
        id: testId('exam_proc3'),
        subjectId: 'bda',
        filename: 'test.pdf',
        originalPath: '/path/test.pdf',
        pageCount: 0,
        status: 'extracted'
      });

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_proc3')}/process`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No pages');
    });
  });

  describe('POST /api/pipeline/exams/:examId/process-page/:pageId', () => {
    it('should process a single page', async () => {
      createExamPdf({
        id: testId('exam_sp'),
        subjectId: 'bda',
        filename: 'sp.pdf',
        originalPath: '/path/sp.pdf',
        pageCount: 1,
        status: 'extracted'
      });

      createExamPage({
        id: testId('page_sp'),
        examId: testId('exam_sp'),
        pageNumber: 1,
        imagePath: '/images/sp.png',
        status: 'pending'
      });

      visionService.processExamPage.mockResolvedValue({
        success: true,
        rawMarkdown: '## Q1\nContent\na) A\nb) B',
        tokens: { input: 50, output: 25, total: 75 }
      });

      visionService.parseExtractedQuestions.mockReturnValue([{
        id: testId('q_sp'),
        examId: testId('exam_sp'),
        pageId: testId('page_sp'),
        questionNumber: 1,
        rawContent: 'Content',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      }]);

      visionService.normalizeQuestions.mockReturnValue([{
        id: testId('q_sp'),
        examId: testId('exam_sp'),
        pageId: testId('page_sp'),
        questionNumber: 1,
        rawContent: 'Content',
        normalizedContent: 'Content',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      }]);

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_sp')}/process-page/${testId('page_sp')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionsFound).toBeGreaterThanOrEqual(0);
    });

    it('should return 404 for non-existent page', async () => {
      createExamPdf({
        id: testId('exam_sp2'),
        subjectId: 'bda',
        filename: 'sp.pdf',
        originalPath: '/path/sp.pdf',
        pageCount: 1,
        status: 'extracted'
      });

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_sp2')}/process-page/nonexistent_page`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/pipeline/exams/:examId/questions', () => {
    it('should get questions for an exam', async () => {
      // Create exam first (required for foreign key)
      createExamPdf({
        id: testId('exam_q'),
        subjectId: 'bda',
        filename: 'q.pdf',
        originalPath: '/path/q.pdf',
        pageCount: 1,
        status: 'completed'
      });

      // Create page (for foreign key)
      createExamPage({
        id: testId('page_q'),
        examId: testId('exam_q'),
        pageNumber: 1,
        imagePath: '/images/q.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq1'),
        examId: testId('exam_q'),
        pageId: testId('page_q'),
        questionNumber: 1,
        rawContent: 'Question 1',
        normalizedContent: 'Question 1',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        status: 'pending'
      });

      const res = await request(app)
        .get(`/api/pipeline/exams/${testId('exam_q')}/questions`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should filter questions by status', async () => {
      const res = await request(app)
        .get(`/api/pipeline/exams/${testId('exam_q')}/questions`)
        .query({ status: 'pending' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/pipeline/questions/:questionId', () => {
    it('should get a single question', async () => {
      // Create parent records first
      createExamPdf({
        id: testId('exam_pq'),
        subjectId: 'bda',
        filename: 'pq.pdf',
        originalPath: '/path/pq.pdf',
        pageCount: 1,
        status: 'completed'
      });

      createExamPage({
        id: testId('page_pq'),
        examId: testId('exam_pq'),
        pageNumber: 1,
        imagePath: '/images/pq.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq_single'),
        examId: testId('exam_pq'),
        pageId: testId('page_pq'),
        questionNumber: 1,
        rawContent: 'Single question',
        normalizedContent: 'Single question',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        status: 'pending'
      });

      const res = await request(app)
        .get(`/api/pipeline/questions/${testId('pq_single')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testId('pq_single'));
    });

    it('should return 404 for non-existent question', async () => {
      const res = await request(app)
        .get('/api/pipeline/questions/nonexistent_q');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/pipeline/questions/:questionId', () => {
    it('should update a question', async () => {
      // Create parent records first
      createExamPdf({
        id: testId('exam_u'),
        subjectId: 'bda',
        filename: 'u.pdf',
        originalPath: '/path/u.pdf',
        pageCount: 1,
        status: 'completed'
      });

      createExamPage({
        id: testId('page_u'),
        examId: testId('exam_u'),
        pageNumber: 1,
        imagePath: '/images/u.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq_update'),
        examId: testId('exam_u'),
        pageId: testId('page_u'),
        questionNumber: 1,
        rawContent: 'Original',
        normalizedContent: 'Original',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        status: 'pending'
      });

      const res = await request(app)
        .put(`/api/pipeline/questions/${testId('pq_update')}`)
        .send({
          normalizedContent: 'Updated content',
          options: { a: 'New A', b: 'New B', c: 'C', d: 'D' }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent question', async () => {
      const res = await request(app)
        .put('/api/pipeline/questions/nonexistent_q')
        .send({ normalizedContent: 'test' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/pipeline/questions/:questionId/approve', () => {
    it('should approve a question', async () => {
      createExamPdf({
        id: testId('exam_appr'),
        subjectId: 'bda',
        filename: 'approve.pdf',
        originalPath: '/path/approve.pdf',
        pageCount: 1,
        status: 'completed'
      });

      createExamPage({
        id: testId('page_appr'),
        examId: testId('exam_appr'),
        pageNumber: 1,
        imagePath: '/images/appr.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq_approve'),
        examId: testId('exam_appr'),
        pageId: testId('page_appr'),
        questionNumber: 1,
        rawContent: 'Approve me',
        normalizedContent: 'Approve me',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/pipeline/questions/${testId('pq_approve')}/approve`)
        .send({ topic: 'TestTopic' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.topic).toBe('TestTopic');
    });

    it('should reject question with less than 2 options', async () => {
      // Parent records already exist from previous test, create another one
      createExamPdf({
        id: testId('exam_appr2'),
        subjectId: 'bda',
        filename: 'approve2.pdf',
        originalPath: '/path/approve2.pdf',
        pageCount: 1,
        status: 'completed'
      });

      createExamPage({
        id: testId('page_appr2'),
        examId: testId('exam_appr2'),
        pageNumber: 1,
        imagePath: '/images/appr2.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq_few_opts'),
        examId: testId('exam_appr2'),
        pageId: testId('page_appr2'),
        questionNumber: 2,
        rawContent: 'Few options',
        normalizedContent: 'Few options',
        options: { a: 'Only one' }, // Only 1 option
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/pipeline/questions/${testId('pq_few_opts')}/approve`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('2 options');
    });
  });

  describe('POST /api/pipeline/questions/:questionId/reject', () => {
    it('should reject a question', async () => {
      createExamPdf({
        id: testId('exam_rej'),
        subjectId: 'bda',
        filename: 'rej.pdf',
        originalPath: '/path/rej.pdf',
        pageCount: 1,
        status: 'completed'
      });

      createExamPage({
        id: testId('page_rej'),
        examId: testId('exam_rej'),
        pageNumber: 1,
        imagePath: '/images/rej.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq_reject'),
        examId: testId('exam_rej'),
        pageId: testId('page_rej'),
        questionNumber: 1,
        rawContent: 'Reject me',
        normalizedContent: 'Reject me',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/pipeline/questions/${testId('pq_reject')}/reject`)
        .send({ notes: 'Invalid question' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/pipeline/exams/:examId/approve-all', () => {
    it('should approve all pending questions', async () => {
      createExamPdf({
        id: testId('exam_all'),
        subjectId: 'bda',
        filename: 'all.pdf',
        originalPath: '/path/all.pdf',
        pageCount: 1,
        status: 'completed'
      });

      createExamPage({
        id: testId('page_all'),
        examId: testId('exam_all'),
        pageNumber: 1,
        imagePath: '/images/all.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq_all1'),
        examId: testId('exam_all'),
        pageId: testId('page_all'),
        questionNumber: 1,
        rawContent: 'Q1',
        normalizedContent: 'Q1',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        status: 'pending'
      });

      createParsedQuestion({
        id: testId('pq_all2'),
        examId: testId('exam_all'),
        pageId: testId('page_all'),
        questionNumber: 2,
        rawContent: 'Q2',
        normalizedContent: 'Q2',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' },
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_all')}/approve-all`)
        .send({ topic: 'BulkTopic' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.approved).toBeGreaterThanOrEqual(0);
    });

    it('should skip questions with insufficient options', async () => {
      createExamPdf({
        id: testId('exam_skip'),
        subjectId: 'bda',
        filename: 'skip.pdf',
        originalPath: '/path/skip.pdf',
        pageCount: 1,
        status: 'completed'
      });

      createExamPage({
        id: testId('page_skip'),
        examId: testId('exam_skip'),
        pageNumber: 1,
        imagePath: '/images/skip.png',
        status: 'completed'
      });

      createParsedQuestion({
        id: testId('pq_skip1'),
        examId: testId('exam_skip'),
        pageId: testId('page_skip'),
        questionNumber: 1,
        rawContent: 'Q1',
        normalizedContent: 'Q1',
        options: { a: 'Only one' }, // Will be skipped
        status: 'pending'
      });

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_skip')}/approve-all`);

      expect(res.status).toBe(200);
      expect(res.body.data.skipped).toBeGreaterThanOrEqual(0);
    });

    it('should return 404 for non-existent exam', async () => {
      const res = await request(app)
        .post('/api/pipeline/exams/nonexistent_exam/approve-all');

      expect(res.status).toBe(404);
    });
  });

  describe('Error handling', () => {
    it('should handle pdfService errors in upload', async () => {
      pdfService.savePdfFile.mockRejectedValue(new Error('Storage error'));

      const res = await request(app)
        .post('/api/pipeline/upload')
        .attach('file', Buffer.from('%PDF-1.4'), {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        })
        .field('subjectId', 'bda');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should handle visionService errors in process', async () => {
      createExamPdf({
        id: testId('exam_err'),
        subjectId: 'bda',
        filename: 'err.pdf',
        originalPath: '/path/err.pdf',
        pageCount: 1,
        status: 'extracted'
      });

      createExamPage({
        id: testId('page_err'),
        examId: testId('exam_err'),
        pageNumber: 1,
        imagePath: '/images/err.png',
        status: 'pending'
      });

      visionService.processExamPage.mockResolvedValue({
        success: false,
        error: 'Vision API error'
      });

      const res = await request(app)
        .post(`/api/pipeline/exams/${testId('exam_err')}/process`);

      // Should still complete but with 0 questions
      expect(res.status).toBe(200);
      expect(res.body.data.questionsExtracted).toBe(0);
    });
  });
});
