import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuestionSession } from '../shared/hooks/useQuestionSession';
import QuestionSession from '../shared/components/QuestionSession';
import { subjectsApi } from '../shared/api';
import './AdaptiveMode.css';

const DEFAULT_QUESTION_COUNT = 20;

function AdaptiveMode() {
  const [adaptiveConfig, setAdaptiveConfig] = useState({
    count: DEFAULT_QUESTION_COUNT
  });
  const [sessionId, setSessionId] = useState(null);
  const [adaptiveStats, setAdaptiveStats] = useState(null);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Load adaptive stats on mount
  useEffect(() => {
    loadAdaptiveStats();
  }, []);

  const loadAdaptiveStats = async () => {
    try {
      // Pre-load to get stats without starting a session
      const res = await subjectsApi.startAdaptiveMode('bda', { count: 1 });
      if (res.data?.stats) {
        setAdaptiveStats(res.data.stats);
      }
    } catch (err) {
      console.error('Error loading adaptive stats:', err);
    }
  };

  // Load questions for adaptive mode
  const loadQuestions = useCallback(async () => {
    const res = await subjectsApi.startAdaptiveMode('bda', adaptiveConfig);
    if (res.data?.sessionId) {
      setSessionId(res.data.sessionId);
    }
    if (res.data?.stats) {
      setAdaptiveStats(res.data.stats);
    }
    return { data: res.data?.questions || [] };
  }, [adaptiveConfig]);

  // Create session with custom onSolve to refresh stats
  const session = useQuestionSession({
    loadQuestions,
    autoLoad: sessionStarted,
    onSolve: async () => {
      await loadAdaptiveStats();
    }
  });

  // Expose sessionId through session
  const sessionWithId = {
    ...session,
    sessionId
  };

  // Start the adaptive session
  const handleStartSession = () => {
    setSessionStarted(true);
    session.reload();
  };

  // Get priority label
  const getPriorityLabel = (score) => {
    if (score >= 100) return { text: 'Nueva', className: 'priority-new' };
    if (score >= 50) return { text: 'Fallada', className: 'priority-failed' };
    return { text: 'Dominada', className: 'priority-mastered' };
  };

  // Configuration screen
  if (!sessionStarted) {
    return (
      <div className="adaptive-mode">
        <div className="adaptive-config">
          <div className="adaptive-header">
            <Link to="/" className="back-link">
              Volver
            </Link>
            <h1 className="page-title">Modo Adaptativo</h1>
            <p className="page-subtitle">
              Practica inteligente: prioriza preguntas no vistas y falladas
            </p>
          </div>

          <div className="card config-card">
            <div className="card-body">
              <h2 className="config-title">Configurar Sesion</h2>

              <div className="config-option">
                <label htmlFor="question-count">Numero de preguntas</label>
                <div className="count-selector">
                  {[10, 15, 20, 30, 40, 50].map(count => (
                    <button
                      key={count}
                      className={`count-btn ${adaptiveConfig.count === count ? 'active' : ''}`}
                      onClick={() => setAdaptiveConfig(c => ({ ...c, count }))}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="adaptive-info">
                <h3>Como funciona</h3>
                <ul>
                  <li>
                    <span className="priority-badge priority-new">Nueva</span>
                    Preguntas que nunca has visto (maxima prioridad)
                  </li>
                  <li>
                    <span className="priority-badge priority-failed">Fallada</span>
                    Preguntas que has fallado recientemente
                  </li>
                  <li>
                    <span className="priority-badge priority-mastered">Dominada</span>
                    Preguntas que has respondido correctamente
                  </li>
                </ul>
              </div>

              {adaptiveStats && (
                <div className="stats-summary">
                  <div className="stat-item stat-new">
                    <span className="stat-value">{adaptiveStats.neverSeen}</span>
                    <span className="stat-label">Sin ver</span>
                  </div>
                  <div className="stat-item stat-failed">
                    <span className="stat-value">{adaptiveStats.failed}</span>
                    <span className="stat-label">Falladas</span>
                  </div>
                  <div className="stat-item stat-mastered">
                    <span className="stat-value">{adaptiveStats.mastered}</span>
                    <span className="stat-label">Dominadas</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{adaptiveStats.total}</span>
                    <span className="stat-label">Total</span>
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary btn-lg start-btn"
                onClick={handleStartSession}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Comenzar Practica Adaptativa
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Custom header for adaptive mode
  const header = (
    <div className="adaptive-header">
      <div className="adaptive-title-row">
        <Link to="/" className="back-link">
          Volver
        </Link>
        <h1 className="page-title">Modo Adaptativo</h1>
      </div>
      <p className="page-subtitle">
        {session.questions.length} preguntas priorizadas para tu aprendizaje
      </p>
    </div>
  );

  // Priority and topic indicator when showing question
  const beforeQuestion = session.currentQuestion ? (
    <div className="adaptive-question-info">
      <span className="question-topic-badge">
        {session.currentQuestion.topic?.replace('Tema', 'Tema ') || 'Sin tema'}
      </span>
      {session.currentQuestion.priorityScore !== undefined && (
        <span className={`priority-badge ${getPriorityLabel(session.currentQuestion.priorityScore).className}`}>
          {getPriorityLabel(session.currentQuestion.priorityScore).text}
        </span>
      )}
      {sessionId && (
        <span className="adaptive-session-id">
          Sesion: {sessionId.slice(-8)}
        </span>
      )}
    </div>
  ) : null;

  // Custom empty state for adaptive mode
  const emptyState = (
    <div className="card">
      <div className="card-body">
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3 className="empty-state-title">¡Felicidades!</h3>
          <p className="empty-state-description">
            Has dominado todas las preguntas disponibles. Sigue practicando para mantener tu conocimiento fresco.
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setSessionStarted(false)}
          >
            Volver a configurar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="adaptive-mode">
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

export default AdaptiveMode;
