import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { progressApi, questionsApi, solvingApi } from '../shared/api';
import QuestionCard from '../questions/QuestionCard';
import SolveButton from '../solving/SolveButton';
import AnswerPanel from '../solving/AnswerPanel';
import StatsPanel from './StatsPanel';
import './ReviewMode.css';

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todas', description: 'Ver todas las preguntas' },
  { id: 'unanswered', label: 'Sin responder', description: 'Preguntas pendientes' },
  { id: 'failed', label: 'Falladas', description: 'Preguntas incorrectas' },
];

function ReviewMode() {
  const [filter, setFilter] = useState('failed');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [solving, setSolving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const currentQuestion = questions[currentIndex];

  // Load questions based on filter
  useEffect(() => {
    loadQuestions();
  }, [filter]);

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await progressApi.getStats();
      setStats(res.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);

    try {
      let res;
      switch (filter) {
        case 'failed':
          res = await progressApi.getFailedQuestions();
          break;
        case 'unanswered':
          res = await progressApi.getUnansweredQuestions();
          break;
        default:
          // Get all questions from all topics
          const topicsRes = await questionsApi.getTopics();
          const allQuestions = [];
          for (const topic of topicsRes.data) {
            const questionsRes = await questionsApi.getQuestions(topic.id);
            allQuestions.push(...questionsRes.data);
          }
          res = { data: allQuestions };
      }

      setQuestions(res.data);
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

  const handleSelectAnswer = (answer) => {
    if (!result) {
      setSelectedAnswer(answer);
    }
  };

  const handleSolve = async () => {
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

      await progressApi.recordAttempt({
        questionId: currentQuestion.id,
        userAnswer: selectedAnswer,
        correctAnswer: solution.correctAnswer,
        isCorrect: selectedAnswer === solution.correctAnswer,
        explanation: solution.explanation,
      });

      await loadStats();
    } catch (err) {
      console.error('Error solving question:', err);
      setError('Error al obtener la respuesta.');
    } finally {
      setSolving(false);
    }
  };

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

  return (
    <div className="review-mode">
      <div className="review-header">
        <div className="review-title-row">
          <Link to="/" className="back-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver
          </Link>
          <h1 className="page-title">Modo Repaso</h1>
        </div>
        <p className="page-subtitle">
          Repasa las preguntas que necesitas practicar
        </p>
      </div>

      {stats && <StatsPanel stats={stats} compact />}

      {/* Filter buttons */}
      <div className="filter-section">
        <span className="filter-label">Filtrar por:</span>
        <div className="filter-buttons">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`filter-btn ${filter === option.id ? 'active' : ''}`}
              onClick={() => setFilter(option.id)}
              title={option.description}
            >
              {option.label}
              {option.id === 'failed' && stats && stats.failed > 0 && (
                <span className="filter-count error">{stats.failed}</span>
              )}
              {option.id === 'unanswered' && stats && (stats.total - stats.answered) > 0 && (
                <span className="filter-count">{stats.total - stats.answered}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card">
          <div className="card-body">
            <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
            <div className="skeleton skeleton-text"></div>
            <div className="skeleton skeleton-text" style={{ width: '70%' }}></div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="alert alert-error">{error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && questions.length === 0 && (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-state-icon">
                {filter === 'failed' ? (
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                ) : (
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                )}
              </div>
              <h3 className="empty-state-title">
                {filter === 'failed'
                  ? 'No hay preguntas falladas'
                  : filter === 'unanswered'
                  ? 'Todas las preguntas han sido respondidas'
                  : 'No hay preguntas disponibles'}
              </h3>
              <p className="empty-state-description">
                {filter === 'failed'
                  ? 'Excelente! No tienes preguntas incorrectas para repasar.'
                  : filter === 'unanswered'
                  ? 'Has respondido todas las preguntas. Puedes ver las falladas para repasar.'
                  : 'No se encontraron preguntas.'}
              </p>
              {filter !== 'all' && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setFilter('all')}
                >
                  Ver todas las preguntas
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Question */}
      {!loading && !error && questions.length > 0 && (
        <>
          <div className="review-progress">
            <span className="progress-text">
              Pregunta {currentIndex + 1} de {questions.length}
            </span>
            {currentQuestion && (
              <span className="question-topic">
                {currentQuestion.topic}
              </span>
            )}
          </div>

          <QuestionCard
            question={currentQuestion}
            selectedAnswer={selectedAnswer}
            onSelectAnswer={handleSelectAnswer}
            result={result}
            disabled={solving}
          />

          {!result && (
            <div className="question-actions">
              <SolveButton
                onClick={handleSolve}
                disabled={!selectedAnswer}
                loading={solving}
              />
            </div>
          )}

          {result && (
            <AnswerPanel
              result={result}
              userAnswer={selectedAnswer}
              question={currentQuestion}
            />
          )}

          {/* Navigation */}
          <div className="review-navigation">
            <button
              className="btn btn-secondary"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Anterior
            </button>

            <button
              className="btn btn-secondary"
              onClick={goToNext}
              disabled={currentIndex === questions.length - 1}
            >
              Siguiente
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ReviewMode;
