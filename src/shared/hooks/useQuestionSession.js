import { useState, useEffect, useCallback } from 'react';
import { solvingApi, progressApi } from '../api';

/**
 * Custom hook for managing question sessions
 * Extracts common logic from QuestionList, ReviewMode, and GeneratedTestQuestions
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.loadQuestions - Async function that returns { data: questions[] }
 * @param {Function} [options.onSolve] - Callback after solving a question
 * @param {Function} [options.onNext] - Callback when navigating to a question
 * @param {boolean} [options.enableKeyboard=true] - Enable keyboard navigation
 * @param {boolean} [options.recordAttempts=true] - Record attempts to database
 * @param {boolean} [options.autoLoad=true] - Automatically load questions on mount
 * @returns {Object} Session state and actions
 */
export function useQuestionSession({
  loadQuestions,
  onSolve,
  onNext,
  enableKeyboard = true,
  recordAttempts = true,
  autoLoad = true
}) {
  // State
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [solving, setSolving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Derived values
  const currentQuestion = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;
  const progress = questions.length > 0
    ? ((currentIndex + 1) / questions.length) * 100
    : 0;

  // Load questions
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await loadQuestions();
      setQuestions(res.data || []);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setResult(null);
    } catch (err) {
      console.error('Error loading questions:', err);
      setError('Error al cargar las preguntas.');
    } finally {
      setLoading(false);
    }
  }, [loadQuestions]);

  useEffect(() => {
    if (autoLoad) {
      reload();
    } else {
      setLoading(false);
    }
  }, [autoLoad, reload]);

  // Select answer
  const handleSelectAnswer = useCallback((answer) => {
    if (!result) {
      setSelectedAnswer(answer);
    }
  }, [result]);

  // Solve/check answer
  const handleSolve = useCallback(async () => {
    if (!currentQuestion || !selectedAnswer) return;

    setSolving(true);
    setError(null);

    try {
      const solveRes = await solvingApi.solve(
        currentQuestion.id,
        currentQuestion.fullContent
      );

      const solution = solveRes.data;
      setResult(solution);

      // Record attempt if enabled
      if (recordAttempts) {
        await progressApi.recordAttempt({
          questionId: currentQuestion.id,
          userAnswer: selectedAnswer,
          correctAnswer: solution.correctAnswer,
          isCorrect: selectedAnswer === solution.correctAnswer,
          explanation: solution.explanation,
        });
      }

      // Callback
      if (onSolve) {
        onSolve({
          question: currentQuestion,
          userAnswer: selectedAnswer,
          solution
        });
      }
    } catch (err) {
      console.error('Error solving question:', err);
      setError('Error al obtener la respuesta.');
    } finally {
      setSolving(false);
    }
  }, [currentQuestion, selectedAnswer, recordAttempts, onSolve]);

  // Navigation
  const goToQuestion = useCallback((index) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
      setSelectedAnswer(null);
      setResult(null);

      if (onNext) {
        onNext(index);
      }
    }
  }, [questions.length, onNext]);

  const goToPrevious = useCallback(() => {
    goToQuestion(currentIndex - 1);
  }, [currentIndex, goToQuestion]);

  const goToNext = useCallback(() => {
    goToQuestion(currentIndex + 1);
  }, [currentIndex, goToQuestion]);

  // Reset current question (without changing index)
  const resetCurrent = useCallback(() => {
    setSelectedAnswer(null);
    setResult(null);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!enableKeyboard) return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
          goToNext();
          break;
        case 'a':
        case 'b':
        case 'c':
        case 'd':
          if (!result) {
            handleSelectAnswer(e.key);
          }
          break;
        case 'Enter':
          if (selectedAnswer && !result && !solving) {
            handleSolve();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enableKeyboard,
    goToPrevious,
    goToNext,
    handleSelectAnswer,
    handleSolve,
    selectedAnswer,
    result,
    solving
  ]);

  return {
    // State
    questions,
    currentQuestion,
    currentIndex,
    selectedAnswer,
    result,
    solving,
    loading,
    error,
    progress,
    isFirst,
    isLast,

    // Actions
    handleSelectAnswer,
    handleSolve,
    goToQuestion,
    goToPrevious,
    goToNext,
    resetCurrent,
    reload,

    // Setters (for advanced use)
    setQuestions,
    setError
  };
}

export default useQuestionSession;
