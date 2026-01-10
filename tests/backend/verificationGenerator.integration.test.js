/**
 * Integration Tests for Verification Generator with Mocked Claude SDK
 * Tests generateVerificationQuestions with mocked Claude responses
 */

import { jest } from '@jest/globals';

// Mock the Claude Agent SDK before importing the module
const mockQuery = jest.fn();

jest.unstable_mockModule('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery
}));

// Import database functions
const {
  db,
  initializeDatabase,
  createSubject,
  createVerificationSession,
  getVerificationSessionById,
  getVerificationQuestionsBySession,
  updateVerificationSession,
  createExamPdf,
  createExamPage,
  updateExamPage,
  updateExamPdfStatus
} = await import('../../server/database.js');

// Import the module after mocking
const { generateVerificationQuestions } = await import('../../server/services/verificationGenerator.js');

const TEST_PREFIX = 'VGEN_MOCK_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

function cleanupTestData() {
  db.prepare(`DELETE FROM verification_questions WHERE session_id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM verification_sessions WHERE id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM exam_pages WHERE exam_id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM exam_pdfs WHERE id LIKE '${TEST_PREFIX}%'`).run();
  db.prepare(`DELETE FROM subjects WHERE id LIKE '${TEST_PREFIX}%'`).run();
}

// Helper to create async iterator from array
async function* mockAsyncIterator(messages) {
  for (const msg of messages) {
    yield msg;
  }
}

describe('generateVerificationQuestions with mocked Claude', () => {
  beforeAll(() => {
    initializeDatabase();
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cleanupTestData();

    // Create test subject
    createSubject({
      id: testId('subject'),
      name: 'Test Subject',
      methodology: ['test'],
      modes: ['verification']
    });
  });

  it('should generate questions successfully with Claude response', async () => {
    // Create session
    const session = createVerificationSession({
      subjectId: testId('subject'),
      studentName: 'Test Student',
      questionCount: 2
    });

    // Mock Claude response
    const mockResponse = JSON.stringify([
      {
        content: 'Test question 1',
        expectedAnswer: 'Expected answer 1',
        criteria: ['criterio1'],
        section: 'test',
        difficulty: 'medium'
      },
      {
        content: 'Test question 2',
        expectedAnswer: 'Expected answer 2',
        criteria: ['criterio2'],
        section: 'test',
        difficulty: 'easy'
      }
    ]);

    mockQuery.mockReturnValue(mockAsyncIterator([
      { type: 'assistant', message: { content: [{ type: 'text', text: mockResponse }] } },
      { type: 'result', result: mockResponse }
    ]));

    const questions = await generateVerificationQuestions(session.id);

    expect(questions).toHaveLength(2);
    expect(questions[0].content).toBe('Test question 1');
    expect(questions[1].content).toBe('Test question 2');

    // Verify session status was updated
    const updatedSession = getVerificationSessionById(session.id);
    expect(updatedSession.status).toBe('ready');

    // Verify questions were saved
    const savedQuestions = getVerificationQuestionsBySession(session.id);
    expect(savedQuestions).toHaveLength(2);
  });

  it('should throw error if session not found', async () => {
    await expect(generateVerificationQuestions('nonexistent'))
      .rejects.toThrow('Session not found');
  });

  it('should throw error if subject not found', async () => {
    // Create orphan session by temporarily disabling foreign keys
    const sessionId = testId('orphan_session');
    db.pragma('foreign_keys = OFF');
    db.prepare(`
      INSERT INTO verification_sessions (id, subject_id, status, question_count, created_at)
      VALUES (?, ?, 'pending', 5, CURRENT_TIMESTAMP)
    `).run(sessionId, 'nonexistent_subject_id');
    db.pragma('foreign_keys = ON');

    await expect(generateVerificationQuestions(sessionId))
      .rejects.toThrow('Subject not found');
  });

  it('should handle deliverable content when available', async () => {
    // Create PDF with content
    createExamPdf({
      id: testId('pdf'),
      subjectId: testId('subject'),
      filename: 'test.pdf',
      pageCount: 1,
      originalPath: '/tmp/test.pdf'
    });
    updateExamPdfStatus(testId('pdf'), 'completed');
    createExamPage({
      id: testId('page'),
      examId: testId('pdf'),
      pageNumber: 1,
      status: 'completed'
    });
    updateExamPage(testId('page'), { processedMarkdown: 'Test deliverable content' });

    // Create session with deliverable
    const session = createVerificationSession({
      subjectId: testId('subject'),
      studentName: 'Student with deliverable',
      questionCount: 1,
      deliverableId: testId('pdf')
    });

    const mockResponse = JSON.stringify([{
      content: 'Question about deliverable',
      expectedAnswer: 'Answer',
      criteria: ['test'],
      section: 'deliverable',
      difficulty: 'hard'
    }]);

    mockQuery.mockReturnValue(mockAsyncIterator([
      { type: 'assistant', message: { content: [{ type: 'text', text: mockResponse }] } },
      { type: 'result' }
    ]));

    const questions = await generateVerificationQuestions(session.id);

    expect(questions).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('should handle sample exams as guide', async () => {
    // Create sample exam PDF
    createExamPdf({
      id: testId('sample_pdf'),
      subjectId: testId('subject'),
      filename: 'sample.pdf',
      pageCount: 1,
      originalPath: '/tmp/sample.pdf'
    });
    updateExamPdfStatus(testId('sample_pdf'), 'completed');
    createExamPage({
      id: testId('sample_page'),
      examId: testId('sample_pdf'),
      pageNumber: 1,
      status: 'completed'
    });
    updateExamPage(testId('sample_page'), { processedMarkdown: 'Sample exam content' });

    // Create session (no deliverable, but sample exists)
    const session = createVerificationSession({
      subjectId: testId('subject'),
      studentName: 'Student',
      questionCount: 1
    });

    const mockResponse = JSON.stringify([{
      content: 'Question based on sample style',
      expectedAnswer: 'Answer',
      criteria: ['test'],
      section: 'general',
      difficulty: 'medium'
    }]);

    mockQuery.mockReturnValue(mockAsyncIterator([
      { type: 'assistant', message: { content: [{ type: 'text', text: mockResponse }] } },
      { type: 'result' }
    ]));

    const questions = await generateVerificationQuestions(session.id);

    expect(questions).toHaveLength(1);
  });

  it('should throw error if no questions generated', async () => {
    const session = createVerificationSession({
      subjectId: testId('subject'),
      studentName: 'Student',
      questionCount: 1
    });

    // Mock Claude returning invalid response
    mockQuery.mockReturnValue(mockAsyncIterator([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Invalid response' }] } },
      { type: 'result' }
    ]));

    await expect(generateVerificationQuestions(session.id))
      .rejects.toThrow('No questions generated');

    // Verify session status was updated to error
    const updatedSession = getVerificationSessionById(session.id);
    expect(updatedSession.status).toBe('error');
  });

  it('should handle result message type with fallback response', async () => {
    const session = createVerificationSession({
      subjectId: testId('subject'),
      studentName: 'Student',
      questionCount: 1
    });

    const mockResponse = JSON.stringify([{
      content: 'Question from result',
      difficulty: 'easy'
    }]);

    // Only send result type (no assistant message)
    mockQuery.mockReturnValue(mockAsyncIterator([
      { type: 'result', result: mockResponse }
    ]));

    const questions = await generateVerificationQuestions(session.id);

    expect(questions).toHaveLength(1);
    expect(questions[0].content).toBe('Question from result');
  });
});
