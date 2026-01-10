import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { pipelineApi, subjectsApi } from '../shared/api';
import PdfUploader from './PdfUploader';
import ExamCard from './ExamCard';
import './Pipeline.css';

function PipelineDashboard() {
  const { subjectId: urlSubjectId } = useParams();
  const subjectId = urlSubjectId || 'bda';

  const [subject, setSubject] = useState(null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadAsDeliverable, setUploadAsDeliverable] = useState(false);

  useEffect(() => {
    loadData();
  }, [subjectId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [subjectRes, examsRes] = await Promise.all([
        subjectsApi.getSubject(subjectId),
        pipelineApi.getExams(subjectId),
      ]);

      setSubject(subjectRes.data?.subject);
      setExams(examsRes.data?.data || []);
    } catch (err) {
      console.error('Error loading pipeline data:', err);
      setError('Error al cargar los datos del pipeline.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = (newExam) => {
    setExams([newExam, ...exams]);
  };

  const handleExamDeleted = (examId) => {
    setExams(exams.filter(e => e.id !== examId));
  };

  const handleExamUpdated = (updatedExam) => {
    setExams(exams.map(e => e.id === updatedExam.id ? updatedExam : e));
  };

  if (loading) {
    return (
      <div className="pipeline-dashboard">
        <div className="pipeline-header">
          <Link to={`/subjects/${subjectId}`} className="back-link">Volver</Link>
          <h1>Pipeline de PDFs</h1>
        </div>
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pipeline-dashboard">
        <div className="pipeline-header">
          <Link to={`/subjects/${subjectId}`} className="back-link">Volver</Link>
          <h1>Pipeline de PDFs</h1>
        </div>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-primary" onClick={loadData}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="pipeline-dashboard">
      <div className="pipeline-header">
        <Link to={`/subjects/${subjectId}`} className="back-link">Volver</Link>
        <h1>Pipeline de PDFs - {subject?.short_name || subject?.name || subjectId.toUpperCase()}</h1>
      </div>

      <p className="pipeline-description">
        {subject?.modes?.includes('verification')
          ? 'Sube PDFs de entregables de alumnos para verificacion oral, o examenes anteriores para extraer preguntas.'
          : 'Sube PDFs de examenes anteriores para extraer preguntas automaticamente usando Claude Vision.'}
      </p>

      {subject?.modes?.includes('verification') && (
        <div className="deliverable-toggle">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={uploadAsDeliverable}
              onChange={(e) => setUploadAsDeliverable(e.target.checked)}
            />
            <span>Marcar como entregable de alumno (para verificacion oral)</span>
          </label>
        </div>
      )}

      <PdfUploader
        subjectId={subjectId}
        onSuccess={handleUploadSuccess}
        isDeliverable={uploadAsDeliverable}
      />

      <div className="exams-section">
        <h2>Examenes ({exams.length})</h2>

        {exams.length === 0 ? (
          <div className="empty-state">
            <p>No hay examenes subidos. Sube un PDF para empezar.</p>
          </div>
        ) : (
          <div className="exam-list">
            {exams.map(exam => (
              <ExamCard
                key={exam.id}
                exam={exam}
                onDeleted={() => handleExamDeleted(exam.id)}
                onUpdated={handleExamUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PipelineDashboard;
