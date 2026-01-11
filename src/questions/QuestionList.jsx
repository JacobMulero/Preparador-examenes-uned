import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuestionSession } from '../shared/hooks/useQuestionSession';
import QuestionSession from '../shared/components/QuestionSession';
import { subjectsApi, progressApi } from '../shared/api';
import './QuestionList.css';

function QuestionList() {
  const { subjectId: urlSubjectId, topicId } = useParams();
  const subjectId = urlSubjectId || 'bda';

  const [topicStats, setTopicStats] = useState(null);

  // Load questions function for the hook
  const loadQuestions = useCallback(async () => {
    // Also load stats when loading questions
    try {
      const statsRes = await progressApi.getTopicStats(topicId);
      setTopicStats(statsRes.data || null);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
    return subjectsApi.getSubjectQuestions(subjectId, topicId);
  }, [subjectId, topicId]);

  // Create session with custom onSolve to refresh stats
  const session = useQuestionSession({
    loadQuestions,
    onSolve: async () => {
      // Refresh stats after solving
      try {
        const statsRes = await progressApi.getTopicStats(topicId);
        setTopicStats(statsRes.data || null);
      } catch (err) {
        console.error('Error refreshing stats:', err);
      }
    }
  });

  // Back link URL
  const backUrl = `/subjects/${subjectId}`;

  // Custom header with stats
  const header = (
    <div className="question-list-header">
      <Link to={backUrl} className="back-link">Volver</Link>
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
  );

  return (
    <QuestionSession
      session={session}
      header={header}
      showProgress={true}
      showNavigation={true}
      showQuickNav={true}
      navHint="Usa flechas para navegar, a/b/c/d para responder"
    />
  );
}

export default QuestionList;
