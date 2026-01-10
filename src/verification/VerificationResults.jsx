import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { verificationApi } from '../shared/api';
import './Verification.css';

function VerificationResults() {
  const { subjectId, sessionId } = useParams();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await verificationApi.getSession(sessionId);

        if (res.data.success) {
          setSession(res.data.session);
          setQuestions(res.data.questions || []);
        }
      } catch (err) {
        console.error('Error fetching results:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="verification-results">
        <div className="spinner" />
        <p>Cargando resultados...</p>
      </div>
    );
  }

  // Calculate average score
  const scoredQuestions = questions.filter(q => q.score !== null);
  const totalScore = scoredQuestions.reduce((sum, q) => sum + q.score, 0);
  const avgScore = scoredQuestions.length > 0 ? totalScore / scoredQuestions.length : 0;

  // Determine score class
  const getScoreClass = (score) => {
    if (score >= 8) return 'excellent';
    if (score >= 6) return 'good';
    if (score >= 4) return 'needs-work';
    return 'poor';
  };

  return (
    <div className="verification-results">
      <h2>Resultado de Verificacion</h2>

      <div className="student-info">
        <strong>{session?.student_name || 'Sin nombre'}</strong>
      </div>

      <div className={`final-score ${getScoreClass(avgScore)}`}>
        {avgScore.toFixed(1)}
      </div>

      <div className="score-label">
        sobre 10 puntos
      </div>

      <div className="results-summary">
        <h3>Detalle por pregunta</h3>
        {questions.map((q, index) => (
          <div key={q.id} className="question-score-item">
            <span className="question-preview">
              {index + 1}. {q.content.substring(0, 60)}...
            </span>
            <span className={`score ${getScoreClass(q.score || 0)}`}>
              {q.score !== null ? q.score.toFixed(1) : '-'}
            </span>
          </div>
        ))}
      </div>

      {session?.notes && (
        <div className="notes-section">
          <h3>Notas</h3>
          <p>{session.notes}</p>
        </div>
      )}

      <Link to={`/subjects/${subjectId}`} className="back-button">
        Volver a la asignatura
      </Link>
    </div>
  );
}

export default VerificationResults;
