/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the child components to simplify testing
jest.mock('../../src/questions/QuestionCard', () => {
  return function MockQuestionCard({ question, selectedAnswer, onSelectAnswer, result, disabled }) {
    return (
      <div data-testid="question-card">
        <div data-testid="question-text">{question?.text}</div>
        <div data-testid="selected-answer">{selectedAnswer}</div>
        <button
          data-testid="select-a"
          onClick={() => onSelectAnswer('a')}
          disabled={disabled}
        >
          Option A
        </button>
        {result && <div data-testid="has-result">Result shown</div>}
      </div>
    );
  };
});

jest.mock('../../src/solving/SolveButton', () => {
  return function MockSolveButton({ onClick, disabled, loading }) {
    return (
      <button
        data-testid="solve-button"
        onClick={onClick}
        disabled={disabled}
      >
        {loading ? 'Loading...' : 'Solve'}
      </button>
    );
  };
});

jest.mock('../../src/solving/AnswerPanel', () => {
  return function MockAnswerPanel({ result, userAnswer, question }) {
    return (
      <div data-testid="answer-panel">
        <div data-testid="correct-answer">{result?.correctAnswer}</div>
        <div data-testid="user-answer">{userAnswer}</div>
      </div>
    );
  };
});

jest.mock('../../src/progress/ProgressBar', () => {
  return function MockProgressBar({ value }) {
    return <div data-testid="progress-bar" data-value={value}>{value}%</div>;
  };
});

import QuestionSession from '../../src/shared/components/QuestionSession';

describe('QuestionSession', () => {
  const mockQuestions = [
    { id: 'q1', number: 1, text: 'Question 1', fullContent: 'Q1 content' },
    { id: 'q2', number: 2, text: 'Question 2', fullContent: 'Q2 content' },
    { id: 'q3', number: 3, text: 'Question 3', fullContent: 'Q3 content' }
  ];

  const createMockSession = (overrides = {}) => ({
    questions: mockQuestions,
    currentQuestion: mockQuestions[0],
    currentIndex: 0,
    selectedAnswer: null,
    result: null,
    solving: false,
    loading: false,
    error: null,
    progress: 33.33,
    isFirst: true,
    isLast: false,
    handleSelectAnswer: jest.fn(),
    handleSolve: jest.fn(),
    goToQuestion: jest.fn(),
    goToPrevious: jest.fn(),
    goToNext: jest.fn(),
    resetCurrent: jest.fn(),
    reload: jest.fn(),
    ...overrides
  });

  describe('rendering states', () => {
    it('should render loading state', () => {
      const session = createMockSession({ loading: true });
      const { container } = render(<QuestionSession session={session} />);

      expect(container.querySelector('.skeleton')).toBeTruthy();
      expect(screen.queryByTestId('question-card')).not.toBeInTheDocument();
    });

    it('should render error state with retry button', () => {
      const session = createMockSession({
        error: 'Test error message',
        questions: []
      });
      render(<QuestionSession session={session} />);

      expect(screen.getByText('Test error message')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });

    it('should call reload on retry', () => {
      const session = createMockSession({
        error: 'Test error message',
        questions: []
      });
      render(<QuestionSession session={session} />);

      fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
      expect(session.reload).toHaveBeenCalled();
    });

    it('should render empty state', () => {
      const session = createMockSession({ questions: [] });
      render(<QuestionSession session={session} />);

      expect(screen.getByText(/no se encontraron preguntas/i)).toBeInTheDocument();
    });

    it('should render question when data is loaded', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} />);

      expect(screen.getByTestId('question-card')).toBeInTheDocument();
      expect(screen.getByTestId('question-text')).toHaveTextContent('Question 1');
    });
  });

  describe('progress display', () => {
    it('should show progress bar by default', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} />);

      expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
      expect(screen.getByText(/pregunta 1 de 3/i)).toBeInTheDocument();
    });

    it('should hide progress bar when showProgress is false', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} showProgress={false} />);

      expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
    });

    it('should display correct progress percentage', () => {
      const session = createMockSession({ progress: 66.67, currentIndex: 1 });
      render(<QuestionSession session={session} />);

      expect(screen.getByText('67%')).toBeInTheDocument();
    });
  });

  describe('solve button', () => {
    it('should show solve button when no result', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} />);

      expect(screen.getByTestId('solve-button')).toBeInTheDocument();
    });

    it('should hide solve button when result exists', () => {
      const session = createMockSession({
        result: { correctAnswer: 'a', explanation: 'test' }
      });
      render(<QuestionSession session={session} />);

      expect(screen.queryByTestId('solve-button')).not.toBeInTheDocument();
    });

    it('should disable solve button when no answer selected', () => {
      const session = createMockSession({ selectedAnswer: null });
      render(<QuestionSession session={session} />);

      expect(screen.getByTestId('solve-button')).toBeDisabled();
    });

    it('should enable solve button when answer is selected', () => {
      const session = createMockSession({ selectedAnswer: 'a' });
      render(<QuestionSession session={session} />);

      expect(screen.getByTestId('solve-button')).not.toBeDisabled();
    });

    it('should call handleSolve when clicked', () => {
      const session = createMockSession({ selectedAnswer: 'a' });
      render(<QuestionSession session={session} />);

      fireEvent.click(screen.getByTestId('solve-button'));
      expect(session.handleSolve).toHaveBeenCalled();
    });
  });

  describe('answer panel', () => {
    it('should show answer panel when result exists', () => {
      const session = createMockSession({
        result: { correctAnswer: 'a', explanation: 'test' },
        selectedAnswer: 'b'
      });
      render(<QuestionSession session={session} />);

      expect(screen.getByTestId('answer-panel')).toBeInTheDocument();
    });

    it('should not show answer panel when no result', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} />);

      expect(screen.queryByTestId('answer-panel')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should show navigation by default', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} />);

      expect(screen.getByRole('button', { name: /anterior/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /siguiente/i })).toBeInTheDocument();
    });

    it('should hide navigation when showNavigation is false', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} showNavigation={false} />);

      expect(screen.queryByRole('button', { name: /anterior/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument();
    });

    it('should disable previous button on first question', () => {
      const session = createMockSession({ isFirst: true });
      render(<QuestionSession session={session} />);

      expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    });

    it('should disable next button on last question', () => {
      const session = createMockSession({ isLast: true });
      render(<QuestionSession session={session} />);

      expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
    });

    it('should call goToPrevious when clicking previous', () => {
      const session = createMockSession({ isFirst: false });
      render(<QuestionSession session={session} />);

      fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
      expect(session.goToPrevious).toHaveBeenCalled();
    });

    it('should call goToNext when clicking next', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} />);

      fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
      expect(session.goToNext).toHaveBeenCalled();
    });

    it('should display custom nav hint', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} navHint="Custom hint text" />);

      expect(screen.getByText('Custom hint text')).toBeInTheDocument();
    });
  });

  describe('quick navigation', () => {
    it('should not show quick nav by default', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} />);

      expect(screen.queryByText(/ir a:/i)).not.toBeInTheDocument();
    });

    it('should show quick nav when enabled', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} showQuickNav={true} />);

      expect(screen.getByText(/ir a:/i)).toBeInTheDocument();
    });

    it('should call goToQuestion when clicking quick nav button', () => {
      const session = createMockSession();
      render(<QuestionSession session={session} showQuickNav={true} />);

      // Click on question 2 button
      const buttons = screen.getAllByRole('button').filter(
        btn => btn.textContent === '2'
      );
      fireEvent.click(buttons[0]);
      expect(session.goToQuestion).toHaveBeenCalledWith(1);
    });
  });

  describe('custom slots', () => {
    it('should render custom header', () => {
      const session = createMockSession();
      const header = <div data-testid="custom-header">Custom Header</div>;
      render(<QuestionSession session={session} header={header} />);

      expect(screen.getByTestId('custom-header')).toBeInTheDocument();
    });

    it('should render beforeQuestion content', () => {
      const session = createMockSession();
      const beforeQuestion = <div data-testid="before-question">Before Content</div>;
      render(<QuestionSession session={session} beforeQuestion={beforeQuestion} />);

      expect(screen.getByTestId('before-question')).toBeInTheDocument();
    });

    it('should render afterAnswer content', () => {
      const session = createMockSession({
        result: { correctAnswer: 'a' }
      });
      const afterAnswer = <div data-testid="after-answer">After Content</div>;
      render(<QuestionSession session={session} afterAnswer={afterAnswer} />);

      expect(screen.getByTestId('after-answer')).toBeInTheDocument();
    });
  });

  describe('error display during session', () => {
    it('should show inline error when questions exist but error occurs', () => {
      const session = createMockSession({ error: 'Solve error' });
      render(<QuestionSession session={session} />);

      expect(screen.getByText('Solve error')).toBeInTheDocument();
      // Question should still be visible
      expect(screen.getByTestId('question-card')).toBeInTheDocument();
    });
  });
});
