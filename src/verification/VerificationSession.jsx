import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { verificationApi } from '../shared/api';
import './Verification.css';

function VerificationSession() {
  const { subjectId, sessionId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [actualAnswer, setActualAnswer] = useState('');
  const [scoring, setScoring] = useState(false);

  // Fetch session data
  useEffect(() => {
    let timeoutId = null;
    let isMounted = true;

    const fetchSession = async () => {
      // Evitar actualizaciones si el componente se desmontó
      if (!isMounted) return;

      try {
        const res = await verificationApi.getSession(sessionId);

        // Verificar de nuevo después de la llamada async
        if (!isMounted) return;

        if (!res.data.success) {
          setStatus('error');
          return;
        }

        setSession(res.data.session);
        setQuestions(res.data.questions || []);

        const sessionStatus = res.data.session.status;

        if (sessionStatus === 'generating' || sessionStatus === 'pending') {
          setStatus('generating');
          // Poll for completion (guardando referencia para cleanup)
          timeoutId = setTimeout(fetchSession, 2000);
        } else if (sessionStatus === 'ready') {
          // Start the session automatically
          await verificationApi.startSession(sessionId);
          if (isMounted) setStatus('ready');
        } else if (sessionStatus === 'in_progress') {
          setStatus('ready');
          // Find first unanswered question
          const firstUnanswered = res.data.questions.findIndex(q => q.score === null);
          if (firstUnanswered >= 0) {
            setCurrentIndex(firstUnanswered);
          }
        } else if (sessionStatus === 'completed') {
          // Redirect to results
          navigate(`/subjects/${subjectId}/verification/${sessionId}/results`);
        } else if (sessionStatus === 'error') {
          setStatus('error');
        }

      } catch (err) {
        console.error('Error fetching session:', err);
        if (isMounted) setStatus('error');
      }
    };

    fetchSession();

    // Cleanup: cancelar timeout y marcar como desmontado
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [sessionId, subjectId, navigate]);

  const handleScore = async () => {
    if (scoring) return;
    setScoring(true);

    try {
      const question = questions[currentIndex];

      await verificationApi.scoreQuestion(
        question.id,
        score,
        feedback.trim() || null,
        actualAnswer.trim() || null
      );

      // Update local state
      const updatedQuestions = [...questions];
      updatedQuestions[currentIndex] = {
        ...question,
        score,
        feedback: feedback.trim(),
        actual_answer: actualAnswer.trim()
      };
      setQuestions(updatedQuestions);

      // Move to next question or finish
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setScore(5);
        setFeedback('');
        setActualAnswer('');
      } else {
        // All questions answered, complete session
        await verificationApi.completeSession(sessionId);
        navigate(`/subjects/${subjectId}/verification/${sessionId}/results`);
      }

    } catch (err) {
      console.error('Error scoring question:', err);
    } finally {
      setScoring(false);
    }
  };

  const handleSkip = async () => {
    // Score with 0 and no feedback
    setScore(0);
    await handleScore();
  };

  const handleFinish = async () => {
    try {
      await verificationApi.completeSession(sessionId);
      navigate(`/subjects/${subjectId}/verification/${sessionId}/results`);
    } catch (err) {
      console.error('Error completing session:', err);
    }
  };

  // Loading state
  if (status === 'loading' || status === 'generating') {
    return (
      <div className="verification-session loading">
        <div className="spinner" />
        <p>{status === 'generating' ? 'Generando preguntas personalizadas...' : 'Cargando sesion...'}</p>
        <small>Esto puede tardar unos segundos</small>
      </div>
    );
  }

  // Error state
  if (status === 'error' || questions.length === 0) {
    return (
      <div className="verification-session error">
        <h3>Error</h3>
        <p>No se pudieron cargar las preguntas</p>
        <button className="back-button" onClick={() => navigate(`/subjects/${subjectId}`)}>
          Volver
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter(q => q.score !== null).length;

  return (
    <div className="verification-session">
      {/* Header */}
      <header className="session-header">
        <div className="student-info">
          Alumno: <strong>{session?.student_name || 'Sin nombre'}</strong>
        </div>
        <div className="progress-info">
          Pregunta {currentIndex + 1} de {questions.length}
        </div>
      </header>

      {/* Progress bar */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((answeredCount) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="question-card">
        <div className="question-number">Pregunta {currentIndex + 1}</div>

        <span className={`difficulty ${currentQuestion.difficulty}`}>
          {currentQuestion.difficulty}
        </span>

        <div className="question-content">
          {currentQuestion.content}
        </div>

        {/* Expected answer (for professor only) */}
        {currentQuestion.expected_answer && (
          <div className="expected-answer">
            <h4>Respuesta esperada (guia):</h4>
            <p>{currentQuestion.expected_answer}</p>
          </div>
        )}

        {/* Evaluation criteria */}
        {currentQuestion.evaluationCriteria && currentQuestion.evaluationCriteria.length > 0 && (
          <div className="criteria-list">
            <h4>Criterios de evaluacion:</h4>
            <ul>
              {currentQuestion.evaluationCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Scoring section */}
        <div className="scoring-section">
          <h4>Puntuacion (0-10):</h4>
          <div className="score-slider-container">
            <input
              type="range"
              className="score-slider"
              min="0"
              max="10"
              step="0.5"
              value={score}
              onChange={(e) => setScore(parseFloat(e.target.value))}
            />
            <span className="score-value">{score}</span>
          </div>

          <h4>Respuesta del alumno (opcional):</h4>
          <textarea
            className="answer-input"
            placeholder="Transcribe brevemente la respuesta del alumno..."
            value={actualAnswer}
            onChange={(e) => setActualAnswer(e.target.value)}
          />

          <h4>Feedback (opcional):</h4>
          <textarea
            className="feedback-input"
            placeholder="Notas o comentarios sobre la respuesta..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="session-actions">
        <button className="skip-button" onClick={handleSkip} disabled={scoring}>
          Saltar (0 puntos)
        </button>

        <div>
          {currentIndex < questions.length - 1 ? (
            <button className="next-button" onClick={handleScore} disabled={scoring}>
              {scoring ? 'Guardando...' : 'Siguiente'}
            </button>
          ) : (
            <button className="finish-button" onClick={handleScore} disabled={scoring}>
              {scoring ? 'Guardando...' : 'Finalizar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerificationSession;
