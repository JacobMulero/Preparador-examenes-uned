import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuestionSession } from '../shared/hooks/useQuestionSession';
import QuestionSession from '../shared/components/QuestionSession';
import { progressApi, questionsApi } from '../shared/api';
import StatsPanel from './StatsPanel';
import './ReviewMode.css';

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todas', description: 'Ver todas las preguntas' },
  { id: 'unanswered', label: 'Sin responder', description: 'Preguntas pendientes' },
  { id: 'failed', label: 'Falladas', description: 'Preguntas incorrectas' },
];

function ReviewMode() {
  const [filter, setFilter] = useState('failed');
  const [stats, setStats] = useState(null);

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

  // Load questions based on filter
  const loadQuestions = useCallback(async () => {
    switch (filter) {
      case 'failed':
        return progressApi.getFailedQuestions();
      case 'unanswered':
        return progressApi.getUnansweredQuestions();
      default:
        // Get all questions from all topics
        const topicsRes = await questionsApi.getTopics();
        const allQuestions = [];
        for (const topic of topicsRes.data) {
          const questionsRes = await questionsApi.getQuestions(topic.id);
          allQuestions.push(...questionsRes.data);
        }
        return { data: allQuestions };
    }
  }, [filter]);

  // Create session with custom onSolve to refresh stats
  const session = useQuestionSession({
    loadQuestions,
    onSolve: async () => {
      await loadStats();
    }
  });

  // Custom header
  const header = (
    <div className="review-header">
      <div className="review-title-row">
        <Link to="/" className="back-link">
          Volver
        </Link>
        <h1 className="page-title">Modo Repaso</h1>
      </div>
      <p className="page-subtitle">
        Repasa las preguntas que necesitas practicar
      </p>
    </div>
  );

  // Stats panel before questions
  const beforeQuestion = (
    <>
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
    </>
  );

  // Topic indicator when showing question
  const questionTopicIndicator = session.currentQuestion ? (
    <div className="review-progress">
      <span className="question-topic">
        {session.currentQuestion.topic}
      </span>
    </div>
  ) : null;

  // Custom empty state based on filter
  const emptyState = (
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
  );

  return (
    <div className="review-mode">
      <QuestionSession
        session={session}
        header={header}
        beforeQuestion={
          <>
            {beforeQuestion}
            {questionTopicIndicator}
          </>
        }
        showProgress={false}
        showNavigation={true}
        showQuickNav={false}
        emptyState={emptyState}
      />
    </div>
  );
}

export default ReviewMode;
