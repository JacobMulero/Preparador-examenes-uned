import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuestionSession } from '../shared/hooks/useQuestionSession';
import QuestionSession from '../shared/components/QuestionSession';
import { subjectsApi, progressApi } from '../shared/api';
import './ExamMode.css';

const DEFAULT_QUESTION_COUNT = 20;

function ExamMode() {
  const [examConfig, setExamConfig] = useState({
    count: DEFAULT_QUESTION_COUNT,
    excludeAnswered: false
  });
  const [sessionId, setSessionId] = useState(null);
  const [stats, setStats] = useState(null);
  const [examStarted, setExamStarted] = useState(false);

  // Load global stats on mount
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

  // Load questions for exam mode
  const loadQuestions = useCallback(async () => {
    const res = await subjectsApi.startExamMode('bda', examConfig);
    if (res.data?.sessionId) {
      setSessionId(res.data.sessionId);
    }
    return { data: res.data?.questions || [] };
  }, [examConfig]);

  // Create session with custom onSolve to refresh stats
  const session = useQuestionSession({
    loadQuestions,
    autoLoad: examStarted, // Only load when exam is started
    onSolve: async () => {
      await loadStats();
    }
  });

  // Expose sessionId through session for tests
  const sessionWithId = {
    ...session,
    sessionId
  };

  // Start the exam
  const handleStartExam = () => {
    setExamStarted(true);
    session.reload();
  };

  // Configuration screen
  if (!examStarted) {
    return (
      <div className="exam-mode">
        <div className="exam-config">
          <div className="exam-header">
            <Link to="/" className="back-link">
              Volver
            </Link>
            <h1 className="page-title">Modo Examen</h1>
            <p className="page-subtitle">
              Simula un examen con preguntas aleatorias de todos los temas
            </p>
          </div>

          <div className="card config-card">
            <div className="card-body">
              <h2 className="config-title">Configurar Examen</h2>

              <div className="config-option">
                <label htmlFor="question-count">Numero de preguntas</label>
                <div className="count-selector">
                  {[10, 15, 20, 30, 40, 50].map(count => (
                    <button
                      key={count}
                      className={`count-btn ${examConfig.count === count ? 'active' : ''}`}
                      onClick={() => setExamConfig(c => ({ ...c, count }))}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={examConfig.excludeAnswered}
                    onChange={(e) => setExamConfig(c => ({
                      ...c,
                      excludeAnswered: e.target.checked
                    }))}
                  />
                  <span>Excluir preguntas ya respondidas correctamente</span>
                </label>
                {stats && examConfig.excludeAnswered && (
                  <p className="config-hint">
                    {stats.correct} preguntas seran excluidas
                  </p>
                )}
              </div>

              {stats && (
                <div className="stats-summary">
                  <div className="stat-item">
                    <span className="stat-value">{stats.total}</span>
                    <span className="stat-label">Total preguntas</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{stats.answered}</span>
                    <span className="stat-label">Respondidas</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{stats.correct}</span>
                    <span className="stat-label">Correctas</span>
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary btn-lg start-btn"
                onClick={handleStartExam}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Comenzar Examen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Custom header for exam mode
  const header = (
    <div className="exam-header">
      <div className="exam-title-row">
        <Link to="/" className="back-link">
          Volver
        </Link>
        <h1 className="page-title">Modo Examen</h1>
      </div>
      <p className="page-subtitle">
        {session.questions.length} preguntas aleatorias de todos los temas
      </p>
    </div>
  );

  // Topic indicator when showing question
  const beforeQuestion = session.currentQuestion ? (
    <div className="exam-question-info">
      <span className="question-topic-badge">
        {session.currentQuestion.topic?.replace('Tema', 'Tema ') || 'Sin tema'}
      </span>
      {sessionId && (
        <span className="exam-session-id">
          Sesion: {sessionId.slice(-8)}
        </span>
      )}
    </div>
  ) : null;

  // Custom empty state for exam mode
  const emptyState = (
    <div className="card">
      <div className="card-body">
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="empty-state-title">No hay preguntas disponibles</h3>
          <p className="empty-state-description">
            {examConfig.excludeAnswered
              ? 'Has respondido correctamente todas las preguntas. Desmarca la opcion de excluir respondidas o prueba con mas preguntas.'
              : 'No se encontraron preguntas para el examen.'}
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setExamStarted(false)}
          >
            Volver a configurar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="exam-mode">
      <QuestionSession
        session={sessionWithId}
        header={header}
        beforeQuestion={beforeQuestion}
        showProgress={true}
        showNavigation={true}
        showQuickNav={false}
        emptyState={emptyState}
        navHint="Usa flechas para navegar"
      />
    </div>
  );
}

export default ExamMode;
