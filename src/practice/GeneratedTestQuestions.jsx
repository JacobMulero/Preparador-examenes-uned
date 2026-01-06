import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generationApi } from '../shared/api';
import './GeneratedTestQuestions.css';

/**
 * GeneratedTestQuestions - Muestra preguntas generadas y recoge respuestas
 * Usa el mismo estilo que QuestionCard y AnswerPanel
 */
function GeneratedTestQuestions() {
  const { subjectId, sessionId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [startTime, setStartTime] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [finalStats, setFinalStats] = useState(null);

  // Cargar preguntas con polling
  const fetchQuestions = useCallback(async () => {
    try {
      const response = await generationApi.getSessionQuestions(sessionId);
      const data = response.data;

      setStatus(data.status);

      if (data.status === 'completed' && data.questions?.length > 0) {
        setQuestions(data.questions);
        setStartTime(Date.now());
      } else if (data.status === 'generating' || data.status === 'pending') {
        setTimeout(fetchQuestions, 2000);
      } else if (data.status === 'error') {
        setStatus('error');
      }
    } catch (err) {
      console.error('Error fetching questions:', err);
      setStatus('error');
    }
  }, [sessionId]);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await generationApi.getSession(sessionId);
        if (response.data?.success) {
          setSession(response.data.session);
        }
      } catch (err) {
        console.error('Error fetching session:', err);
      }
    };

    fetchSession();
    fetchQuestions();
  }, [sessionId, fetchQuestions]);

  const handleAnswer = async (answer) => {
    if (result) return;
    setSelectedAnswer(answer);

    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    try {
      const response = await generationApi.submitGeneratedAnswer(sessionId, {
        questionId: questions[currentIndex].id,
        userAnswer: answer,
        timeSpentSeconds: timeSpent
      });

      const data = response.data;
      setResult(data);
      setStats(prev => ({
        correct: prev.correct + (data.isCorrect ? 1 : 0),
        total: prev.total + 1
      }));
    } catch (err) {
      console.error('Error submitting answer:', err);
    }
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setResult(null);
      setStartTime(Date.now());
    } else {
      try {
        const response = await generationApi.getSessionStats(sessionId);
        setFinalStats(response.data?.stats);
      } catch (err) {
        console.error('Error fetching final stats:', err);
      }
      setShowResults(true);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showResults) return;

      if (!result) {
        if (['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) {
          handleAnswer(e.key.toLowerCase());
        }
      } else {
        if (e.key === 'Enter') {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [result, showResults, currentIndex, questions.length]);

  // Estado de carga
  if (status === 'loading' || status === 'generating' || status === 'pending') {
    return (
      <div className="generated-questions">
        <div className="loading-state">
          <div className="spinner spinner-lg"></div>
          <h3>Generando preguntas personalizadas...</h3>
          <p>Esto puede tardar unos segundos mientras Claude analiza el material.</p>
        </div>
      </div>
    );
  }

  // Estado de error
  if (status === 'error' || questions.length === 0) {
    return (
      <div className="generated-questions">
        <div className="error-state">
          <h3>Error al cargar preguntas</h3>
          <p>No se pudieron generar las preguntas. Por favor, intenta de nuevo.</p>
          <Link to={`/practice/${subjectId}`} className="btn btn-primary">
            Volver a configurar
          </Link>
        </div>
      </div>
    );
  }

  // Resultados finales
  if (showResults) {
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

    return (
      <div className="generated-questions">
        <div className="results-view">
          <div className="results-header">
            <h2>Sesion completada</h2>
          </div>

          <div className="results-card card">
            <div className="card-body">
              <div className="results-score">
                <span className="score-value">{stats.correct}</span>
                <span className="score-divider">/</span>
                <span className="score-total">{stats.total}</span>
              </div>
              <p className="results-label">respuestas correctas</p>

              <div className="results-accuracy">
                <div className="progress-bar-bg">
                  <div
                    className={`progress-bar-fill ${accuracy >= 70 ? 'good' : accuracy >= 50 ? 'medium' : 'low'}`}
                    style={{ width: `${accuracy}%` }}
                  ></div>
                </div>
                <span className="accuracy-value">{accuracy}%</span>
              </div>

              {finalStats?.avg_time && (
                <p className="results-time">
                  Tiempo promedio: {Math.round(finalStats.avg_time)}s por pregunta
                </p>
              )}
            </div>
          </div>

          <div className="results-actions">
            <Link to={`/practice/${subjectId}`} className="btn btn-primary">
              Nueva sesion
            </Link>
            <Link to={`/subjects/${subjectId}`} className="btn btn-secondary">
              Volver al dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const isCorrect = result && selectedAnswer === result.correctAnswer;

  const getOptionClass = (optionKey) => {
    const classes = ['radio-option'];

    if (selectedAnswer === optionKey && !result) {
      classes.push('selected');
    }

    if (result) {
      if (optionKey === result.correctAnswer) {
        classes.push('correct');
      } else if (selectedAnswer === optionKey && optionKey !== result.correctAnswer) {
        classes.push('incorrect');
      }
    }

    return classes.join(' ');
  };

  return (
    <div className="generated-questions question-list">
      {/* Header */}
      <div className="question-list-header">
        <Link to={`/subjects/${subjectId}`} className="back-link">
          Volver
        </Link>
        <h1 className="topic-title">Practica Generada</h1>
        <div className="topic-quick-stats">
          <span className="stat-item">
            <span className="stat-success">{stats.correct}</span> / {stats.total} correctas
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="question-progress">
        <div className="progress-info">
          <span className="progress-text">
            Pregunta {currentIndex + 1} de {questions.length}
          </span>
          <span className="progress-percentage">
            {Math.round(((currentIndex + 1) / questions.length) * 100)}%
          </span>
        </div>
        <div className="progress-bar-bg">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Question Card - Same structure as QuestionCard.jsx */}
      <div className="question-card card">
        <div className="card-header">
          <div className="question-meta">
            <span className="question-number">Pregunta {currentIndex + 1}</span>
            {currentQuestion.based_on_section && (
              <span className="question-topic">{currentQuestion.based_on_section}</span>
            )}
          </div>
        </div>

        <div className="card-body">
          {/* Question text */}
          <div className="question-text markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentQuestion.content}</ReactMarkdown>
          </div>

          {/* Options - Same structure as QuestionCard */}
          <div className="question-options radio-group">
            {Object.entries(currentQuestion.options).map(([key, value]) => (
              <label
                key={key}
                className={getOptionClass(key)}
                onClick={() => {
                  if (!result) {
                    handleAnswer(key);
                  }
                }}
              >
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  value={key}
                  checked={selectedAnswer === key}
                  onChange={() => handleAnswer(key)}
                  disabled={!!result}
                />
                <span className="radio-option-key">{key}</span>
                <span className="radio-option-label markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
                </span>
                {result && key === result.correctAnswer && (
                  <span className="option-indicator correct-indicator">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </span>
                )}
                {result && selectedAnswer === key && key !== result.correctAnswer && (
                  <span className="option-indicator incorrect-indicator">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Answer Panel - Same structure as AnswerPanel.jsx */}
      {result && (
        <div className={`answer-panel card ${isCorrect ? 'correct' : 'incorrect'}`}>
          <div className="answer-header">
            <div className={`answer-icon ${isCorrect ? 'correct' : 'incorrect'}`}>
              {isCorrect ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              )}
            </div>
            <div className="answer-title">
              <h3>{isCorrect ? 'Respuesta correcta' : 'Respuesta incorrecta'}</h3>
              <p>
                {isCorrect
                  ? 'Has acertado esta pregunta.'
                  : `La respuesta correcta es la opcion ${result.correctAnswer.toUpperCase()}.`}
              </p>
            </div>
          </div>

          <div className="answer-body">
            <div className="answer-section">
              <h4 className="section-title">Explicacion</h4>
              <div className="section-content markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.explanation || 'Sin explicacion disponible.'}</ReactMarkdown>
              </div>
            </div>

            {!isCorrect && result.wrongExplanations && result.wrongExplanations[selectedAnswer] && (
              <div className="answer-section">
                <h4 className="section-title">Por que {selectedAnswer.toUpperCase()} es incorrecta</h4>
                <div className="wrong-options">
                  <div className="wrong-option">
                    <div className="wrong-option-explanation markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.wrongExplanations[selectedAnswer]}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="answer-summary">
              <div className="summary-item">
                <span className="summary-label">Tu respuesta:</span>
                <span className={`summary-value ${isCorrect ? 'correct' : 'incorrect'}`}>
                  {selectedAnswer.toUpperCase()}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Respuesta correcta:</span>
                <span className="summary-value correct">
                  {result.correctAnswer.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="question-navigation">
        <button
          className="btn btn-secondary"
          onClick={() => {
            if (currentIndex > 0) {
              setCurrentIndex(currentIndex - 1);
              setSelectedAnswer(null);
              setResult(null);
            }
          }}
          disabled={currentIndex === 0}
        >
          Anterior
        </button>

        <div className="question-nav-info">
          {!result && (
            <span className="nav-hint">
              Pulsa <kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd> <kbd>D</kbd> para responder
            </span>
          )}
          {result && (
            <span className="nav-hint">
              Pulsa <kbd>Enter</kbd> para continuar
            </span>
          )}
        </div>

        {result ? (
          <button className="btn btn-primary" onClick={handleNext}>
            {currentIndex < questions.length - 1 ? 'Siguiente' : 'Ver resultados'}
          </button>
        ) : (
          <button className="btn btn-secondary" disabled>
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}

export default GeneratedTestQuestions;
