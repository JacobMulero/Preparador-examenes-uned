import { useState, useEffect } from 'react';
import SubjectCard from './SubjectCard';
import { subjectsApi } from '../shared/api';
import './SubjectSelector.css';

function SubjectSelector() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const response = await subjectsApi.getSubjects();
        setSubjects(response.data.subjects || []);
      } catch (err) {
        setError('Error al cargar asignaturas');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubjects();
  }, []);

  if (loading) {
    return <div className="subject-selector loading">Cargando asignaturas...</div>;
  }

  if (error) {
    return <div className="subject-selector error">{error}</div>;
  }

  return (
    <div className="subject-selector">
      <h1>Selecciona una Asignatura</h1>

      <div className="subjects-grid">
        {subjects.map(subject => (
          <SubjectCard key={subject.id} subject={subject} />
        ))}
      </div>

      {subjects.length === 0 && (
        <p className="no-subjects">No hay asignaturas disponibles</p>
      )}
    </div>
  );
}

export default SubjectSelector;
