import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { verificationApi, pipelineApi } from '../shared/api';
import './Verification.css';

const FOCUS_AREAS = [
  { id: 'casos_uso', name: 'Casos de Uso' },
  { id: 'modelo_dominio', name: 'Modelo de Dominio' },
  { id: 'diagramas_interaccion', name: 'Diagramas de Interaccion' },
  { id: 'dcd', name: 'DCD' },
  { id: 'grasp', name: 'Principios GRASP' },
  { id: 'gof', name: 'Patrones GoF' },
  { id: 'arquitectura', name: 'Arquitectura' },
  { id: 'codigo', name: 'Codigo' }
];

function VerificationSetup({ subjectId, subjectName }) {
  const navigate = useNavigate();
  const [studentName, setStudentName] = useState('');
  const [focusAreas, setFocusAreas] = useState([]);
  const [questionCount, setQuestionCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Deliverable selection
  const [deliverables, setDeliverables] = useState([]);
  const [loadingDeliverables, setLoadingDeliverables] = useState(true);
  const [selectedDeliverable, setSelectedDeliverable] = useState(null);

  // Load processed PDFs on mount
  useEffect(() => {
    const loadDeliverables = async () => {
      try {
        const res = await pipelineApi.getExams(subjectId);
        if (res.data.success) {
          // Filter only completed PDFs that are deliverables
          const exams = res.data.data || res.data.exams || [];
          const completed = exams.filter(e => e.status === 'completed' && e.is_deliverable === 1);
          setDeliverables(completed);
        }
      } catch (err) {
        console.error('Error loading deliverables:', err);
      } finally {
        setLoadingDeliverables(false);
      }
    };
    loadDeliverables();
  }, [subjectId]);

  const toggleFocusArea = (areaId) => {
    setFocusAreas(prev =>
      prev.includes(areaId)
        ? prev.filter(a => a !== areaId)
        : [...prev, areaId]
    );
  };

  const handleStart = async () => {
    if (!studentName.trim()) {
      setError('Por favor, introduce el nombre del alumno');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create session with deliverable if selected
      const createRes = await verificationApi.createSession({
        subjectId,
        studentName: studentName.trim(),
        focusAreas: focusAreas.length > 0 ? focusAreas : null,
        questionCount,
        deliverableId: selectedDeliverable || null
      });

      if (!createRes.data.success) {
        throw new Error(createRes.data.error || 'Error al crear sesion');
      }

      const sessionId = createRes.data.session.id;

      // Start generating questions
      await verificationApi.generateQuestions(sessionId);

      // Navigate to session page
      navigate(`/subjects/${subjectId}/verification/${sessionId}`);

    } catch (err) {
      console.error('Error creating verification session:', err);
      setError(err.message || 'Error al crear sesion de verificacion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verification-setup">
      <h2>Verificacion Oral - {subjectName}</h2>

      {/* Deliverable selection */}
      <div className="setup-section">
        <h3>Entregable del alumno (opcional pero recomendado)</h3>
        <p className="hint">
          Selecciona un PDF procesado para generar preguntas especificas.
          Si no seleccionas ninguno, las preguntas seran genericas.
        </p>

        {loadingDeliverables ? (
          <p className="loading-text">Cargando entregables...</p>
        ) : deliverables.length === 0 ? (
          <div className="no-deliverables">
            <p>No hay entregables procesados para esta asignatura.</p>
            <Link to={`/pipeline/${subjectId}`} className="btn btn-secondary btn-sm">
              Ir al Pipeline de PDFs
            </Link>
          </div>
        ) : (
          <div className="deliverable-list">
            <div
              className={`deliverable-item ${!selectedDeliverable ? 'selected' : ''}`}
              onClick={() => setSelectedDeliverable(null)}
            >
              <span className="deliverable-name">Sin entregable (preguntas genericas)</span>
            </div>
            {deliverables.map(d => (
              <div
                key={d.id}
                className={`deliverable-item ${selectedDeliverable === d.id ? 'selected' : ''}`}
                onClick={() => setSelectedDeliverable(d.id)}
              >
                <span className="deliverable-name">{d.filename}</span>
                <span className="deliverable-pages">{d.page_count} paginas</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="setup-section">
        <h3>Nombre del alumno</h3>
        <input
          type="text"
          className="student-input"
          placeholder="Introduce el nombre del alumno"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="setup-section">
        <h3>Areas a evaluar (opcional)</h3>
        <p className="hint">Selecciona las areas en las que quieres enfocar las preguntas</p>
        <div className="focus-chips">
          {FOCUS_AREAS.map(area => (
            <button
              key={area.id}
              className={`chip ${focusAreas.includes(area.id) ? 'selected' : ''}`}
              onClick={() => toggleFocusArea(area.id)}
              disabled={loading}
            >
              {area.name}
            </button>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <h3>Numero de preguntas</h3>
        <div className="count-selector">
          <button
            onClick={() => setQuestionCount(Math.max(3, questionCount - 1))}
            disabled={questionCount <= 3 || loading}
          >
            -
          </button>
          <span className="count">{questionCount}</span>
          <button
            onClick={() => setQuestionCount(Math.min(10, questionCount + 1))}
            disabled={questionCount >= 10 || loading}
          >
            +
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <button
        className="start-button"
        onClick={handleStart}
        disabled={loading}
      >
        {loading ? 'Creando sesion...' : 'Generar Preguntas'}
      </button>

      {selectedDeliverable && (
        <p className="hint" style={{ marginTop: '1rem', textAlign: 'center' }}>
          Las preguntas se generaran basandose en el contenido del entregable seleccionado.
        </p>
      )}
    </div>
  );
}

export default VerificationSetup;
