import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { subjectsApi } from '../shared/api';
import TopicSelector from '../questions/TopicSelector';
import './SubjectDashboard.css';

/**
 * SubjectDashboard - Vista principal de una asignatura
 * Fase 0: Muestra info basica y redirige al TopicSelector de BDA
 * Fase 1: Mostrara dashboard completo con modos disponibles
 */
function SubjectDashboard() {
  const { subjectId } = useParams();
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSubject = async () => {
      try {
        const response = await subjectsApi.getSubject(subjectId);
        setSubject(response.data.subject);
      } catch (err) {
        setError('Asignatura no encontrada');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubject();
  }, [subjectId]);

  if (loading) {
    return <div className="subject-dashboard loading">Cargando...</div>;
  }

  if (error) {
    return (
      <div className="subject-dashboard error">
        <p>{error}</p>
        <Link to="/">Volver al inicio</Link>
      </div>
    );
  }

  // Fase 0: Para BDA, mostrar directamente el TopicSelector existente
  // Fase 1 lo expandira con tabs y modos
  if (subjectId === 'bda') {
    return (
      <div className="subject-dashboard">
        <div className="subject-dashboard-header">
          <Link to="/" className="back-link">Cambiar asignatura</Link>
          <h1>{subject.name}</h1>
          <p className="subject-description">{subject.description}</p>
          <div className="subject-actions">
            <Link to={`/practice/${subjectId}`} className="btn btn-primary btn-sm">
              Practicar
            </Link>
            <Link to={`/pipeline/${subjectId}`} className="btn btn-secondary btn-sm">
              Pipeline PDFs
            </Link>
            {subject.modes?.includes('verification') && (
              <Link to={`/subjects/${subjectId}/verification`} className="btn btn-warning btn-sm">
                Verificacion Oral
              </Link>
            )}
          </div>
        </div>
        <TopicSelector />
      </div>
    );
  }

  // Dashboard para otras asignaturas (DS, etc.)
  return (
    <div className="subject-dashboard">
      <div className="subject-dashboard-header">
        <Link to="/" className="back-link">Cambiar asignatura</Link>
        <h1>{subject.name}</h1>
        <p className="subject-description">{subject.description}</p>
        <div className="subject-actions">
          <Link to={`/practice/${subjectId}`} className="btn btn-primary btn-sm">
            Practicar
          </Link>
          <Link to={`/pipeline/${subjectId}`} className="btn btn-secondary btn-sm">
            Pipeline PDFs
          </Link>
          {subject.modes?.includes('verification') && (
            <Link to={`/subjects/${subjectId}/verification`} className="btn btn-warning btn-sm">
              Verificacion Oral
            </Link>
          )}
        </div>
      </div>
      <div className="coming-soon">
        <h2>Selecciona un modo</h2>
        <p>Modos disponibles: {subject.modes?.join(', ')}</p>
        <p>Usa "Pipeline PDFs" para subir examenes y extraer preguntas.</p>
      </div>
    </div>
  );
}

export default SubjectDashboard;
