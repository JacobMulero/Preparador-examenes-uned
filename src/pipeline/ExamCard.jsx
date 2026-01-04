import { useState } from 'react';
import { Link } from 'react-router-dom';
import { pipelineApi } from '../shared/api';

const STATUS_LABELS = {
  uploaded: { label: 'Subido', color: 'gray' },
  extracting: { label: 'Extrayendo...', color: 'blue' },
  extracted: { label: 'Extraido', color: 'blue' },
  parsing: { label: 'Procesando...', color: 'yellow' },
  completed: { label: 'Completado', color: 'green' },
  error: { label: 'Error', color: 'red' },
};

function ExamCard({ exam, onDeleted, onUpdated }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const statusInfo = STATUS_LABELS[exam.status] || { label: exam.status, color: 'gray' };

  const handleExtract = async () => {
    setProcessing(true);
    setError(null);

    try {
      const res = await pipelineApi.extractPages(exam.id);
      if (res.data?.success) {
        // Reload exam data
        const examRes = await pipelineApi.getExam(exam.id);
        if (examRes.data?.success) {
          onUpdated(examRes.data.data);
        }
      } else {
        setError(res.data?.error || 'Error al extraer paginas');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al extraer paginas');
    } finally {
      setProcessing(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);

    try {
      const res = await pipelineApi.processExam(exam.id);
      if (res.data?.success) {
        // Reload exam data
        const examRes = await pipelineApi.getExam(exam.id);
        if (examRes.data?.success) {
          onUpdated(examRes.data.data);
        }
      } else {
        setError(res.data?.error || 'Error al procesar');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al procesar');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar ${exam.filename}? Esta accion no se puede deshacer.`)) {
      return;
    }

    try {
      const res = await pipelineApi.deleteExam(exam.id);
      if (res.data?.success) {
        onDeleted();
      } else {
        setError(res.data?.error || 'Error al eliminar');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const canExtract = exam.status === 'uploaded';
  const canProcess = exam.status === 'extracted' || (exam.status === 'error' && exam.page_count > 0);
  const canReview = exam.status === 'completed';

  return (
    <div className="exam-card card">
      <div className="exam-card-header">
        <div className="exam-info">
          <h3 className="exam-filename">{exam.filename}</h3>
          <div className="exam-meta">
            <span className={`status-badge status-${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {exam.page_count && (
              <span className="page-count">{exam.page_count} paginas</span>
            )}
            <span className="upload-date">
              {new Date(exam.uploaded_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mt-2">{error}</div>
      )}

      {exam.error_message && (
        <div className="alert alert-error mt-2">
          Error: {exam.error_message}
        </div>
      )}

      <div className="exam-card-actions">
        {canExtract && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExtract}
            disabled={processing}
          >
            {processing ? 'Extrayendo...' : 'Extraer Paginas'}
          </button>
        )}

        {canProcess && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleProcess}
            disabled={processing}
          >
            {processing ? 'Procesando...' : 'Procesar con Vision'}
          </button>
        )}

        {canReview && (
          <Link
            to={`/pipeline/${exam.subject_id}/exam/${exam.id}/review`}
            className="btn btn-success btn-sm"
          >
            Revisar Preguntas
          </Link>
        )}

        <button
          className="btn btn-danger btn-sm"
          onClick={handleDelete}
          disabled={processing}
        >
          Eliminar
        </button>
      </div>

      {exam.questions?.length > 0 && (
        <div className="exam-questions-summary">
          <span>{exam.questions.length} preguntas extraidas</span>
          <span className="question-status-summary">
            {exam.questions.filter(q => q.status === 'pending').length} pendientes |
            {exam.questions.filter(q => q.status === 'approved').length} aprobadas |
            {exam.questions.filter(q => q.status === 'rejected').length} rechazadas
          </span>
        </div>
      )}
    </div>
  );
}

export default ExamCard;
