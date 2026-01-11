/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the api module - define mocks inside the factory to avoid hoisting issues
jest.mock('../../src/shared/api', () => ({
  solvingApi: {
    solve: jest.fn()
  },
  progressApi: {
    recordAttempt: jest.fn()
  }
}));

// Import the mocked module to get references to the mock functions
import { solvingApi, progressApi } from '../../src/shared/api';

// Now import the hook
import { useQuestionSession } from '../../src/shared/hooks/useQuestionSession';

describe('useQuestionSession', () => {
  const mockQuestions = [
    {
      id: 'q1',
      topic: 'Tema1',
      number: 1,
      text: 'Question 1',
      fullContent: 'Question 1 content',
      optionA: 'A1',
      optionB: 'B1',
      optionC: 'C1',
      optionD: 'D1'
    },
    {
      id: 'q2',
      topic: 'Tema1',
      number: 2,
      text: 'Question 2',
      fullContent: 'Question 2 content',
      optionA: 'A2',
      optionB: 'B2',
      optionC: 'C2',
      optionD: 'D2'
    },
    {
      id: 'q3',
      topic: 'Tema1',
      number: 3,
      text: 'Question 3',
      fullContent: 'Question 3 content',
      optionA: 'A3',
      optionB: 'B3',
      optionC: 'C3',
      optionD: 'D3'
    }
  ];

  const mockSolution = {
    correctAnswer: 'a',
    explanation: 'Test explanation',
    wrongOptions: { b: 'wrong b', c: 'wrong c', d: 'wrong d' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    solvingApi.solve.mockResolvedValue({ data: mockSolution });
    progressApi.recordAttempt.mockResolvedValue({ success: true });
  });

  describe('initialization', () => {
    it('should load questions on mount', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      // Initially loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(loadQuestions).toHaveBeenCalledTimes(1);
      expect(result.current.questions).toEqual(mockQuestions);
      expect(result.current.currentIndex).toBe(0);
      expect(result.current.currentQuestion).toEqual(mockQuestions[0]);
    });

    it('should handle load error', async () => {
      const loadQuestions = jest.fn().mockRejectedValue(new Error('Load failed'));

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Error al cargar las preguntas.');
      expect(result.current.questions).toEqual([]);
    });

    it('should set initial state correctly', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.selectedAnswer).toBe(null);
      expect(result.current.result).toBe(null);
      expect(result.current.solving).toBe(false);
      expect(result.current.isFirst).toBe(true);
      expect(result.current.isLast).toBe(false);
      expect(result.current.progress).toBeCloseTo(33.33, 1);
    });
  });

  describe('answer selection', () => {
    it('should allow selecting an answer', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('b');
      });

      expect(result.current.selectedAnswer).toBe('b');
    });

    it('should not allow selecting answer after result is shown', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('a');
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      await waitFor(() => {
        expect(result.current.result).not.toBe(null);
      });

      act(() => {
        result.current.handleSelectAnswer('b');
      });

      // Should still be 'a' because result is shown
      expect(result.current.selectedAnswer).toBe('a');
    });
  });

  describe('solving', () => {
    it('should solve question and record attempt', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('a');
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      expect(solvingApi.solve).toHaveBeenCalledWith('q1', 'Question 1 content');
      expect(progressApi.recordAttempt).toHaveBeenCalledWith({
        questionId: 'q1',
        userAnswer: 'a',
        correctAnswer: 'a',
        isCorrect: true,
        explanation: 'Test explanation'
      });
      expect(result.current.result).toEqual(mockSolution);
    });

    it('should not solve without selected answer', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      expect(solvingApi.solve).not.toHaveBeenCalled();
    });

    it('should handle solve error', async () => {
      solvingApi.solve.mockRejectedValue(new Error('Solve failed'));
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('a');
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      expect(result.current.error).toBe('Error al obtener la respuesta.');
      expect(result.current.result).toBe(null);
    });

    it('should call onSolve callback', async () => {
      const onSolve = jest.fn();
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions, onSolve }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('a');
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      expect(onSolve).toHaveBeenCalledWith({
        question: mockQuestions[0],
        userAnswer: 'a',
        solution: mockSolution
      });
    });

    it('should not record attempt when recordAttempts is false', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({
        loadQuestions,
        recordAttempts: false
      }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('a');
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      expect(solvingApi.solve).toHaveBeenCalled();
      expect(progressApi.recordAttempt).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('should navigate to next question', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.goToNext();
      });

      expect(result.current.currentIndex).toBe(1);
      expect(result.current.currentQuestion).toEqual(mockQuestions[1]);
      expect(result.current.selectedAnswer).toBe(null);
      expect(result.current.result).toBe(null);
    });

    it('should navigate to previous question', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.goToNext();
      });

      act(() => {
        result.current.goToPrevious();
      });

      expect(result.current.currentIndex).toBe(0);
    });

    it('should go to specific question', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.goToQuestion(2);
      });

      expect(result.current.currentIndex).toBe(2);
      expect(result.current.currentQuestion).toEqual(mockQuestions[2]);
    });

    it('should not navigate beyond bounds', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.goToPrevious();
      });

      expect(result.current.currentIndex).toBe(0);

      act(() => {
        result.current.goToQuestion(2);
      });

      act(() => {
        result.current.goToNext();
      });

      expect(result.current.currentIndex).toBe(2);
    });

    it('should update isFirst and isLast correctly', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isFirst).toBe(true);
      expect(result.current.isLast).toBe(false);

      act(() => {
        result.current.goToNext();
      });

      expect(result.current.isFirst).toBe(false);
      expect(result.current.isLast).toBe(false);

      act(() => {
        result.current.goToNext();
      });

      expect(result.current.isFirst).toBe(false);
      expect(result.current.isLast).toBe(true);
    });

    it('should call onNext callback', async () => {
      const onNext = jest.fn();
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions, onNext }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.goToNext();
      });

      expect(onNext).toHaveBeenCalledWith(1);
    });

    it('should clear selection when navigating', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('a');
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      act(() => {
        result.current.goToNext();
      });

      expect(result.current.selectedAnswer).toBe(null);
      expect(result.current.result).toBe(null);
    });
  });

  describe('progress calculation', () => {
    it('should calculate progress correctly', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 1/3 = 33.33%
      expect(result.current.progress).toBeCloseTo(33.33, 1);

      act(() => {
        result.current.goToNext();
      });

      // 2/3 = 66.67%
      expect(result.current.progress).toBeCloseTo(66.67, 1);

      act(() => {
        result.current.goToNext();
      });

      // 3/3 = 100%
      expect(result.current.progress).toBe(100);
    });

    it('should return 0 progress when no questions', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: [] });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.progress).toBe(0);
    });
  });

  describe('reset and reload', () => {
    it('should reset current question state', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleSelectAnswer('a');
      });

      await act(async () => {
        await result.current.handleSolve();
      });

      act(() => {
        result.current.resetCurrent();
      });

      expect(result.current.selectedAnswer).toBe(null);
      expect(result.current.result).toBe(null);
      expect(result.current.currentIndex).toBe(0); // Index unchanged
    });

    it('should reload questions', async () => {
      const loadQuestions = jest.fn().mockResolvedValue({ data: mockQuestions });

      const { result } = renderHook(() => useQuestionSession({ loadQuestions }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.goToNext();
        result.current.handleSelectAnswer('b');
      });

      await act(async () => {
        await result.current.reload();
      });

      expect(loadQuestions).toHaveBeenCalledTimes(2);
      expect(result.current.currentIndex).toBe(0);
      expect(result.current.selectedAnswer).toBe(null);
      expect(result.current.result).toBe(null);
    });
  });
});
