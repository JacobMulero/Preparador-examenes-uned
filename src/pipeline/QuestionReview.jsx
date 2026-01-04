import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { pipelineApi, subjectsApi } from '../shared/api';

function QuestionReview() {
  const { subjectId, examId } = useParams();

  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('Exam');
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    loadData();
  }, [examId, filter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [examRes, questionsRes, topicsRes] = await Promise.all([
        pipelineApi.getExam(examId),
        pipelineApi.getExamQuestions(examId, filter === 'all' ? null : filter),
        subjectsApi.getSubjectTopics(subjectId),
      ]);

      setExam(examRes.data?.data);
      setQuestions(questionsRes.data?.data || []);
      setTopics(topicsRes.data?.topics || []);
    } catch (err) {
      console.error('Error loading review data:', err);
      setError('Error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (questionId) => {
    setProcessing(questionId);

    try {
      await pipelineApi.approveQuestion(questionId, selectedTopic);
      setQuestions(questions.map(q =>
        q.id === questionId ? { ...q, status: 'approved' } : q
      ));
    } catch (err) {
      console.error('Error approving:', err);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (questionId) => {
    setProcessing(questionId);

    try {
      await pipelineApi.rejectQuestion(questionId);
      setQuestions(questions.map(q =>
        q.id === questionId ? { ...q, status: 'rejected' } : q
      ));
    } catch (err) {
      console.error('Error rejecting:', err);
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveAll = async () => {
    if (!confirm('¿Aprobar todas las preguntas pendientes?')) return;

    setProcessing('all');

    try {
      await pipelineApi.approveAllQuestions(examId, selectedTopic);
      await loadData();
    } catch (err) {
      console.error('Error approving all:', err);
    } finally {
      setProcessing(null);
    }
  };

  const filteredQuestions = questions.filter(q => {
    if (filter === 'all') return true;
    return q.status === filter;
  });

  const pendingCount = questions.filter(q => q.status === 'pending').length;

  if (loading) {
    return (
      <div className="question-review">
        <div className="review-header">
          <Link to={`/pipeline/${subjectId}`} className="back-link">Volver</Link>
          <h1>Revisar Preguntas</h1>
        </div>
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="question-review">
      <div className="review-header">
        <Link to={`/pipeline/${subjectId}`} className="back-link">Volver</Link>
        <h1>Revisar Preguntas - {exam?.filename}</h1>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      <div className="review-controls">
        <div className="filter-group">
          <label>Filtrar:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="pending">Pendientes ({pendingCount})</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="all">Todas</option>
          </select>
        </div>

        <div className="topic-group">
          <label>Tema destino:</label>
          <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
            <option value="Exam">Exam (general)</option>
            {topics.map(t => (
              <option key={t.id || t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        {pendingCount > 0 && (
          <button
            className="btn btn-success"
            onClick={handleApproveAll}
            disabled={processing === 'all'}
          >
            {processing === 'all' ? 'Aprobando...' : `Aprobar Todas (${pendingCount})`}
          </button>
        )}
      </div>

      <div className="questions-list">
        {filteredQuestions.length === 0 ? (
          <div className="empty-state">
            <p>No hay preguntas con el filtro seleccionado.</p>
          </div>
        ) : (
          filteredQuestions.map(question => (
            <div key={question.id} className={`question-review-card card status-${question.status}`}>
              <div className="question-number">
                Pregunta {question.question_number}
                <span className={`status-badge status-${question.status}`}>
                  {question.status}
                </span>
              </div>

              <div className="question-content">
                <pre>{question.normalized_content || question.raw_content}</pre>
              </div>

              {question.options && (
                <div className="question-options">
                  {Object.entries(question.options).map(([key, value]) => (
                    <div key={key} className="option">
                      <strong>{key})</strong> {value}
                    </div>
                  ))}
                </div>
              )}

              {question.status === 'pending' && (
                <div className="question-actions">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleApprove(question.id)}
                    disabled={processing === question.id}
                  >
                    {processing === question.id ? '...' : 'Aprobar'}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleReject(question.id)}
                    disabled={processing === question.id}
                  >
                    Rechazar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default QuestionReview;
