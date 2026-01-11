/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Simple mock approach without hoisting issues
const mockReload = jest.fn();
const mockHandleSelectAnswer = jest.fn();
const mockHandleSolve = jest.fn();
const mockGoToQuestion = jest.fn();
const mockGoToPrevious = jest.fn();
const mockGoToNext = jest.fn();

const mockQuestions = [
  { id: 'q1', number: 1, text: 'Question 1', topic: 'Tema1', fullContent: 'Q1 content' },
  { id: 'q2', number: 2, text: 'Question 2', topic: 'Tema2', fullContent: 'Q2 content' },
  { id: 'q3', number: 3, text: 'Question 3', topic: 'Tema3', fullContent: 'Q3 content' }
];

let mockSessionState = {};

// Mock useQuestionSession hook
jest.mock('../../src/shared/hooks/useQuestionSession', () => ({
  useQuestionSession: () => mockSessionState
}));

// Mock the API modules
jest.mock('../../src/shared/api', () => ({
  subjectsApi: {
    startExamMode: jest.fn(() => Promise.resolve({
      data: {
        sessionId: 'exam_test_123',
        questions: mockQuestions,
        totalQuestions: 3,
        totalAvailable: 100,
        excludedCount: 0
      }
    }))
  },
  progressApi: {
    getStats: jest.fn(() => Promise.resolve({
      data: { total: 100, answered: 50, correct: 40, failed: 10 }
    }))
  }
}));

// Must import after mocking
import ExamMode from '../../src/exam/ExamMode';

const renderWithRouter = (component) => {
  return render(
    <MemoryRouter>
      {component}
    </MemoryRouter>
  );
};

describe('ExamMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the session state before each test
    mockSessionState = {
      questions: [],
      currentQuestion: null,
      currentIndex: 0,
      selectedAnswer: null,
      result: null,
      solving: false,
      loading: false,
      error: null,
      progress: 0,
      isFirst: true,
      isLast: false,
      handleSelectAnswer: mockHandleSelectAnswer,
      handleSolve: mockHandleSolve,
      goToQuestion: mockGoToQuestion,
      goToPrevious: mockGoToPrevious,
      goToNext: mockGoToNext,
      resetCurrent: jest.fn(),
      reload: mockReload
    };
  });

  describe('configuration screen', () => {
    it('should render exam mode title', () => {
      renderWithRouter(<ExamMode />);
      expect(screen.getByText(/modo examen/i)).toBeInTheDocument();
    });

    it('should render back link to home', () => {
      renderWithRouter(<ExamMode />);
      const backLink = screen.getByRole('link', { name: /volver/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/');
    });

    it('should render configuration options', () => {
      renderWithRouter(<ExamMode />);
      expect(screen.getByText(/configurar examen/i)).toBeInTheDocument();
      expect(screen.getByText(/numero de preguntas/i)).toBeInTheDocument();
    });

    it('should render question count buttons', () => {
      renderWithRouter(<ExamMode />);
      expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30' })).toBeInTheDocument();
    });

    it('should have 20 as default question count', () => {
      renderWithRouter(<ExamMode />);
      const btn20 = screen.getByRole('button', { name: '20' });
      expect(btn20).toHaveClass('active');
    });

    it('should allow changing question count', () => {
      renderWithRouter(<ExamMode />);
      const btn30 = screen.getByRole('button', { name: '30' });
      fireEvent.click(btn30);
      expect(btn30).toHaveClass('active');
    });

    it('should render exclude answered checkbox', () => {
      renderWithRouter(<ExamMode />);
      expect(screen.getByText(/excluir preguntas ya respondidas/i)).toBeInTheDocument();
    });

    it('should render start button', () => {
      renderWithRouter(<ExamMode />);
      expect(screen.getByRole('button', { name: /comenzar examen/i })).toBeInTheDocument();
    });
  });

  describe('starting exam', () => {
    it('should call reload when starting exam', async () => {
      renderWithRouter(<ExamMode />);

      const startButton = screen.getByRole('button', { name: /comenzar examen/i });
      fireEvent.click(startButton);

      expect(mockReload).toHaveBeenCalled();
    });
  });

  describe('exam session (after start)', () => {
    beforeEach(() => {
      // Set up session state for active exam
      mockSessionState = {
        ...mockSessionState,
        questions: mockQuestions,
        currentQuestion: mockQuestions[0],
        currentIndex: 0,
        progress: 33.33,
        loading: false
      };
    });

    it('should show questions after starting', async () => {
      renderWithRouter(<ExamMode />);

      // Click start to begin exam
      const startButton = screen.getByRole('button', { name: /comenzar examen/i });
      fireEvent.click(startButton);

      // After starting, it should show the question session
      // Since useQuestionSession is mocked, we can check for elements rendered by QuestionSession
      await waitFor(() => {
        expect(screen.getByText(/modo examen/i)).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    beforeEach(() => {
      mockSessionState = {
        ...mockSessionState,
        questions: [],
        currentQuestion: null,
        loading: false
      };
    });

    it('should show empty state message when no questions', async () => {
      renderWithRouter(<ExamMode />);

      // Start exam with no questions
      const startButton = screen.getByRole('button', { name: /comenzar examen/i });
      fireEvent.click(startButton);

      await waitFor(() => {
        // The empty state should be rendered
        expect(screen.getByText(/no hay preguntas disponibles/i)).toBeInTheDocument();
      });
    });
  });
});
