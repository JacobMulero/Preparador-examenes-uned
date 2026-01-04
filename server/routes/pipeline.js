/**
 * Pipeline Routes (Fase 2)
 * Handles PDF upload, processing, and question review
 */

import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import {
  getSubjectById,
  createExamPdf,
  getExamPdf,
  getExamPdfsBySubject,
  updateExamPdfStatus,
  updateExamPdfPageCount,
  createExamPage,
  getExamPages,
  updateExamPage,
  createParsedQuestion,
  getParsedQuestion,
  getParsedQuestionsByExam,
  getParsedQuestionsByStatus,
  updateParsedQuestionStatus,
  updateParsedQuestion,
  deleteExamPdf as deleteExamPdfFromDb,
  upsertQuestion
} from '../database.js';

import pdfService from '../services/pdfService.js';
import visionService from '../services/visionService.js';

const router = Router();

// Configure multer for PDF uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

/**
 * Generate unique ID
 */
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

// ============================================
// PDF Upload & Management
// ============================================

/**
 * POST /api/pipeline/upload
 * Upload a PDF exam file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { subjectId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        error: 'Subject ID is required'
      });
    }

    // Verify subject exists
    const subject = getSubjectById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    const examId = generateId();

    // Save PDF file
    const { filePath, filename } = await pdfService.savePdfFile(
      subjectId,
      examId,
      req.file.buffer,
      req.file.originalname
    );

    // Get page count
    const pageCount = await pdfService.getPdfPageCount(filePath);

    // Create database record
    const examPdf = createExamPdf({
      id: examId,
      subjectId,
      filename,
      originalPath: filePath,
      pageCount,
      status: 'uploaded'
    });

    res.json({
      success: true,
      data: examPdf
    });
  } catch (error) {
    console.error('[pipeline] Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload PDF'
    });
  }
});

/**
 * GET /api/pipeline/exams
 * List all exam PDFs (optionally filtered by subject)
 */
router.get('/exams', (req, res) => {
  try {
    const { subjectId } = req.query;

    let exams;
    if (subjectId) {
      exams = getExamPdfsBySubject(subjectId);
    } else {
      // Get all exams across subjects (would need a new DB function)
      // For now, return empty if no subject specified
      return res.status(400).json({
        success: false,
        error: 'Subject ID is required'
      });
    }

    res.json({
      success: true,
      data: exams
    });
  } catch (error) {
    console.error('[pipeline] List exams error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list exams'
    });
  }
});

/**
 * GET /api/pipeline/exams/:examId
 * Get exam details with pages
 */
router.get('/exams/:examId', (req, res) => {
  try {
    const { examId } = req.params;

    const exam = getExamPdf(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found'
      });
    }

    const pages = getExamPages(examId);
    const questions = getParsedQuestionsByExam(examId);

    res.json({
      success: true,
      data: {
        ...exam,
        pages,
        questions
      }
    });
  } catch (error) {
    console.error('[pipeline] Get exam error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get exam details'
    });
  }
});

/**
 * DELETE /api/pipeline/exams/:examId
 * Delete an exam PDF and all related data
 */
router.delete('/exams/:examId', (req, res) => {
  try {
    const { examId } = req.params;

    const exam = getExamPdf(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found'
      });
    }

    // Delete files from disk
    pdfService.deleteExamFiles(exam.subject_id, examId, exam.filename);

    // Delete from database
    deleteExamPdfFromDb(examId);

    res.json({
      success: true,
      message: 'Exam deleted successfully'
    });
  } catch (error) {
    console.error('[pipeline] Delete exam error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete exam'
    });
  }
});

// ============================================
// PDF Processing
// ============================================

/**
 * POST /api/pipeline/exams/:examId/extract
 * Extract pages from PDF to images
 */
router.post('/exams/:examId/extract', async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = getExamPdf(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found'
      });
    }

    if (exam.status !== 'uploaded') {
      return res.status(400).json({
        success: false,
        error: `Exam is already ${exam.status}`
      });
    }

    // Update status
    updateExamPdfStatus(examId, 'extracting');

    try {
      // Extract pages
      const pageImages = await pdfService.extractPdfPages(
        exam.subject_id,
        examId,
        exam.original_path
      );

      // Update page count
      updateExamPdfPageCount(examId, pageImages.length);

      // Create page records in database
      for (const page of pageImages) {
        createExamPage({
          id: `${examId}_page_${page.pageNumber}`,
          examId,
          pageNumber: page.pageNumber,
          imagePath: page.imagePath,
          status: 'pending'
        });
      }

      // Update status
      updateExamPdfStatus(examId, 'extracted');

      res.json({
        success: true,
        data: {
          examId,
          pageCount: pageImages.length,
          pages: pageImages
        }
      });
    } catch (extractError) {
      updateExamPdfStatus(examId, 'error', extractError.message);
      throw extractError;
    }
  } catch (error) {
    console.error('[pipeline] Extract pages error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract pages'
    });
  }
});

/**
 * POST /api/pipeline/exams/:examId/process
 * Process all pages with Claude Vision
 */
router.post('/exams/:examId/process', async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = getExamPdf(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found'
      });
    }

    if (!['extracted', 'error'].includes(exam.status)) {
      return res.status(400).json({
        success: false,
        error: `Exam must be extracted first. Current status: ${exam.status}`
      });
    }

    const pages = getExamPages(examId);
    if (pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No pages found. Extract pages first.'
      });
    }

    // Get subject context
    const subject = getSubjectById(exam.subject_id);
    const subjectContext = subject ? {
      name: subject.name,
      expertise: subject.claudeContext?.expertise,
      terminology: subject.claudeContext?.terminology
    } : null;

    // Update status
    updateExamPdfStatus(examId, 'parsing');

    try {
      // Process each page
      let totalQuestions = 0;

      for (const page of pages) {
        if (page.status === 'completed') continue; // Skip already processed pages

        // Update page status
        updateExamPage(page.id, { status: 'processing' });

        // Process with Vision
        const result = await visionService.processExamPage(page.image_path, subjectContext);

        if (result.success) {
          // Update page with results
          updateExamPage(page.id, {
            rawMarkdown: result.rawMarkdown,
            visionTokens: result.tokens.total,
            status: 'completed'
          });

          // Parse questions from markdown
          const questions = visionService.parseExtractedQuestions(
            result.rawMarkdown,
            examId,
            page.id
          );

          // Normalize and save questions
          const normalized = visionService.normalizeQuestions(questions);
          for (const q of normalized) {
            createParsedQuestion(q);
            totalQuestions++;
          }
        } else {
          updateExamPage(page.id, {
            status: 'error',
            rawMarkdown: `Error: ${result.error}`
          });
        }

        // Small delay between API calls
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Update exam status
      updateExamPdfStatus(examId, 'completed');

      res.json({
        success: true,
        data: {
          examId,
          questionsExtracted: totalQuestions
        }
      });
    } catch (processError) {
      updateExamPdfStatus(examId, 'error', processError.message);
      throw processError;
    }
  } catch (error) {
    console.error('[pipeline] Process pages error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process pages'
    });
  }
});

/**
 * POST /api/pipeline/exams/:examId/process-page/:pageId
 * Process a single page with Claude Vision
 */
router.post('/exams/:examId/process-page/:pageId', async (req, res) => {
  try {
    const { examId, pageId } = req.params;

    const exam = getExamPdf(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found'
      });
    }

    const pages = getExamPages(examId);
    const page = pages.find(p => p.id === pageId);

    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    // Get subject context
    const subject = getSubjectById(exam.subject_id);
    const subjectContext = subject ? {
      name: subject.name,
      expertise: subject.claudeContext?.expertise
    } : null;

    // Update page status
    updateExamPage(pageId, { status: 'processing' });

    // Process with Vision
    const result = await visionService.processExamPage(page.image_path, subjectContext);

    if (result.success) {
      // Update page
      updateExamPage(pageId, {
        rawMarkdown: result.rawMarkdown,
        visionTokens: result.tokens.total,
        status: 'completed'
      });

      // Parse and save questions
      const questions = visionService.parseExtractedQuestions(result.rawMarkdown, examId, pageId);
      const normalized = visionService.normalizeQuestions(questions);

      for (const q of normalized) {
        createParsedQuestion(q);
      }

      res.json({
        success: true,
        data: {
          pageId,
          rawMarkdown: result.rawMarkdown,
          tokens: result.tokens,
          questionsFound: normalized.length,
          questions: normalized
        }
      });
    } else {
      updateExamPage(pageId, { status: 'error' });
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[pipeline] Process page error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process page'
    });
  }
});

// ============================================
// Question Review
// ============================================

/**
 * GET /api/pipeline/exams/:examId/questions
 * Get all parsed questions for an exam
 */
router.get('/exams/:examId/questions', (req, res) => {
  try {
    const { examId } = req.params;
    const { status } = req.query;

    let questions;
    if (status) {
      questions = getParsedQuestionsByStatus(status, examId);
    } else {
      questions = getParsedQuestionsByExam(examId);
    }

    res.json({
      success: true,
      data: questions
    });
  } catch (error) {
    console.error('[pipeline] Get questions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get questions'
    });
  }
});

/**
 * GET /api/pipeline/questions/:questionId
 * Get a single parsed question
 */
router.get('/questions/:questionId', (req, res) => {
  try {
    const { questionId } = req.params;

    const question = getParsedQuestion(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    res.json({
      success: true,
      data: question
    });
  } catch (error) {
    console.error('[pipeline] Get question error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get question'
    });
  }
});

/**
 * PUT /api/pipeline/questions/:questionId
 * Update a parsed question (edit before approval)
 */
router.put('/questions/:questionId', (req, res) => {
  try {
    const { questionId } = req.params;
    const { normalizedContent, options, rawContent } = req.body;

    const question = getParsedQuestion(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    const updated = updateParsedQuestion(questionId, {
      normalizedContent,
      options,
      rawContent
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('[pipeline] Update question error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update question'
    });
  }
});

/**
 * POST /api/pipeline/questions/:questionId/approve
 * Approve a question and add to main questions table
 */
router.post('/questions/:questionId/approve', (req, res) => {
  try {
    const { questionId } = req.params;
    const { topic, notes } = req.body;

    const question = getParsedQuestion(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    if (!question.options || Object.keys(question.options).length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Question must have at least 2 options'
      });
    }

    // Get exam to find subject
    const exam = getExamPdf(question.exam_id);
    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found'
      });
    }

    // Create new question ID
    const newQuestionId = `${exam.subject_id}_exam_${question.exam_id}_q${question.question_number}`;

    // Add to main questions table
    upsertQuestion({
      id: newQuestionId,
      subject_id: exam.subject_id,
      topic: topic || 'Exam',
      question_number: question.question_number,
      content: question.normalized_content || question.raw_content,
      options: question.options
    });

    // Update parsed question status
    updateParsedQuestionStatus(questionId, 'approved', notes);

    res.json({
      success: true,
      data: {
        questionId: newQuestionId,
        parsedQuestionId: questionId,
        topic: topic || 'Exam'
      }
    });
  } catch (error) {
    console.error('[pipeline] Approve question error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve question'
    });
  }
});

/**
 * POST /api/pipeline/questions/:questionId/reject
 * Reject a question
 */
router.post('/questions/:questionId/reject', (req, res) => {
  try {
    const { questionId } = req.params;
    const { notes } = req.body;

    const question = getParsedQuestion(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    const updated = updateParsedQuestionStatus(questionId, 'rejected', notes);

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('[pipeline] Reject question error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject question'
    });
  }
});

/**
 * POST /api/pipeline/exams/:examId/approve-all
 * Approve all pending questions for an exam
 */
router.post('/exams/:examId/approve-all', (req, res) => {
  try {
    const { examId } = req.params;
    const { topic } = req.body;

    const exam = getExamPdf(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found'
      });
    }

    const pendingQuestions = getParsedQuestionsByStatus('pending', examId);

    let approved = 0;
    let skipped = 0;

    for (const question of pendingQuestions) {
      if (!question.options || Object.keys(question.options).length < 2) {
        skipped++;
        continue;
      }

      const newQuestionId = `${exam.subject_id}_exam_${examId}_q${question.question_number}`;

      upsertQuestion({
        id: newQuestionId,
        subject_id: exam.subject_id,
        topic: topic || 'Exam',
        question_number: question.question_number,
        content: question.normalized_content || question.raw_content,
        options: question.options
      });

      updateParsedQuestionStatus(question.id, 'approved');
      approved++;
    }

    res.json({
      success: true,
      data: {
        approved,
        skipped,
        total: pendingQuestions.length
      }
    });
  } catch (error) {
    console.error('[pipeline] Approve all error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve questions'
    });
  }
});

export default router;
