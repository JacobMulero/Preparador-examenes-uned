import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { questionsApi, solvingApi, progressApi } from '../shared/api';
import QuestionCard from './QuestionCard';
import SolveButton from '../solving/SolveButton';
import AnswerPanel from '../solving/AnswerPanel';
import ProgressBar from '../progress/ProgressBar';
import './QuestionList.css';

function QuestionList() {
  const { topicId } = useParams();

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [solving, setSolving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topicStats, setTopicStats] = useState(null);

  const currentQuestion = questions[currentIndex];

  // Load questions and stats
  useEffect(() => {
    loadQuestions();
  }, [topicId]);

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const [questionsRes, statsRes] = await Promise.all([
        questionsApi.getQuestions(topicId),
        progressApi.getTopicStats(topicId),
      ]);

      // API layer already transforms data
      setQuestions(questionsRes.data || []);
      setTopicStats(statsRes.data || null);

      // Reset state
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setResult(null);
    } catch (err) {
      console.error('Error loading questions:', err);
      setError('Error al cargar las preguntas.');
    } finally {
      setLoading(false);
    }
  };

  const loadTopicStats = async () => {
    try {
      const res = await progressApi.getTopicStats(topicId);
      setTopicStats(res.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  // Handle answer selection
  const handleSelectAnswer = (answer) => {
    if (!result) {
      setSelectedAnswer(answer);
    }
  };

  // Handle solve/check answer
  const handleSolve = async () => {
    if (!currentQuestion || !selectedAnswer) return;

    setSolving(true);
    setError(null);

    try {
      // Call solve API with full content
      const solveRes = await solvingApi.solve(
        currentQuestion.id,
        currentQuestion.fullContent
      );

      const solution = solveRes.data;
      setResult(solution);

      // Record attempt
      await progressApi.recordAttempt({
        questionId: currentQuestion.id,
        userAnswer: selectedAnswer,
        correctAnswer: solution.correctAnswer,
        isCorrect: selectedAnswer === solution.correctAnswer,
        explanation: solution.explanation,
      });

      // Refresh stats
      await loadTopicStats();
    } catch (err) {
      console.error('Error solving question:', err);
      setError('Error al obtener la respuesta. Asegurate de que Claude CLI esta instalado.');
    } finally {
      setSolving(false);
    }
  };

  // Navigation
  const goToQuestion = (index) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
      setSelectedAnswer(null);
      setResult(null);
    }
  };

  const goToPrevious = () => goToQuestion(currentIndex - 1);
  const goToNext = () => goToQuestion(currentIndex + 1);

  // Keyboard navigation
  useEffect(() => {
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
  }, [currentIndex, questions.length, selectedAnswer, result, solving]);

  // Loading state
  if (loading) {
    return (
      <div className="question-list">
        <div className="question-list-header">
          <Link to="/" className="back-link">← Volver</Link>
          <h1 className="topic-title">{topicId}</h1>
        </div>
        <div className="card question-card-skeleton">
          <div className="skeleton skeleton-title"></div>
          <div className="skeleton skeleton-text"></div>
          <div className="skeleton skeleton-text"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && questions.length === 0) {
    return (
      <div className="question-list">
        <div className="question-list-header">
          <Link to="/" className="back-link">← Volver</Link>
          <h1 className="topic-title">{topicId}</h1>
        </div>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-primary" onClick={loadQuestions}>
          Reintentar
        </button>
      </div>
    );
  }

  // Empty state
  if (questions.length === 0) {
    return (
      <div className="question-list">
        <div className="question-list-header">
          <Link to="/" className="back-link">← Volver</Link>
          <h1 className="topic-title">{topicId}</h1>
        </div>
        <div className="card">
          <div className="card-body">
            <p>No se encontraron preguntas para este tema.</p>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="question-list">
      {/* Header */}
      <div className="question-list-header">
        <Link to="/" className="back-link">← Volver</Link>
        <h1 className="topic-title">{topicId.replace('Tema', 'Tema ')}</h1>
        {topicStats && (
          <div className="topic-quick-stats">
            <span className="stat-item">
              {topicStats.answered}/{topicStats.total} respondidas
            </span>
            {topicStats.answered > 0 && (
              <span className="stat-item stat-success">
                {((topicStats.correct / topicStats.answered) * 100).toFixed(0)}% aciertos
              </span>
            )}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="question-progress">
        <div className="progress-info">
          <span>Pregunta {currentIndex + 1} de {questions.length}</span>
          <span className="progress-percentage">{progress.toFixed(0)}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {/* Question */}
      <QuestionCard
        question={currentQuestion}
        selectedAnswer={selectedAnswer}
        onSelectAnswer={handleSelectAnswer}
        result={result}
        disabled={solving}
      />

      {/* Solve button */}
      {!result && (
        <div className="question-actions">
          <SolveButton
            onClick={handleSolve}
            disabled={!selectedAnswer}
            loading={solving}
          />
          {error && <div className="alert alert-error mt-3">{error}</div>}
        </div>
      )}

      {/* Answer panel */}
      {result && (
        <AnswerPanel
          result={result}
          userAnswer={selectedAnswer}
          question={currentQuestion}
        />
      )}

      {/* Navigation */}
      <div className="question-navigation">
        <button
          className="btn btn-secondary"
          onClick={goToPrevious}
          disabled={currentIndex === 0}
        >
          ← Anterior
        </button>

        <div className="question-nav-info">
          <span className="nav-hint">Usa flechas para navegar, a/b/c/d para responder</span>
        </div>

        <button
          className="btn btn-secondary"
          onClick={goToNext}
          disabled={currentIndex === questions.length - 1}
        >
          Siguiente →
        </button>
      </div>

      {/* Quick navigation */}
      <div className="question-quick-nav">
        <span className="quick-nav-label">Ir a:</span>
        <div className="quick-nav-buttons">
          {questions.slice(0, 20).map((q, index) => (
            <button
              key={q.id}
              className={`quick-nav-btn ${index === currentIndex ? 'active' : ''}`}
              onClick={() => goToQuestion(index)}
            >
              {q.number}
            </button>
          ))}
          {questions.length > 20 && <span>...</span>}
        </div>
      </div>
    </div>
  );
}

export default QuestionList;
