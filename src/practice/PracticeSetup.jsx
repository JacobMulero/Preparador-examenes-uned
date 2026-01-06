import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { generationApi } from '../shared/api';
import './PracticeSetup.css';

const SECTIONS = [
  { id: 'query_processing', name: 'Query Processing' },
  { id: 'query_optimization', name: 'Query Optimization' },
  { id: 'transactions', name: 'Transacciones' },
  { id: 'concurrency', name: 'Control de Concurrencia' },
  { id: 'recovery', name: 'Recuperacion' }
];

const DIFFICULTIES = [
  { id: 'easy', name: 'Facil', description: 'Preguntas conceptuales basicas' },
  { id: 'mixed', name: 'Mixto', description: 'Combinacion equilibrada (recomendado)' },
  { id: 'hard', name: 'Dificil', description: 'Preguntas de aplicacion avanzada' }
];

const QUESTION_COUNTS = [5, 10, 15, 20];

/**
 * PracticeSetup - Configurar sesion de practica
 * Permite seleccionar temas, dificultad y numero de preguntas
 */
function PracticeSetup() {
  const { subjectId } = useParams();
  const navigate = useNavigate();

  const [topicFocus, setTopicFocus] = useState([]);
  const [difficulty, setDifficulty] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleTopic = (topicId) => {
    setTopicFocus(prev =>
      prev.includes(topicId)
        ? prev.filter(t => t !== topicId)
        : [...prev, topicId]
    );
  };

  const handleStart = async () => {
    setLoading(true);
    setError(null);

    try {
      // Crear sesion
      const sessionResponse = await generationApi.createTestSession({
        subjectId,
        topicFocus: topicFocus.length > 0 ? topicFocus : null,
        difficulty,
        questionCount
      });

      if (!sessionResponse.data?.success) {
        throw new Error(sessionResponse.data?.error || 'Error al crear sesion');
      }

      const session = sessionResponse.data.session;

      // Iniciar generacion
      await generationApi.startGeneration(session.id);

      // Navegar a la pagina de preguntas generadas
      navigate(`/practice/${subjectId}/session/${session.id}`);

    } catch (err) {
      console.error('Error creating practice session:', err);
      setError(err.response?.data?.error || err.message || 'Error al crear sesion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="practice-setup">
      <div className="practice-setup-header">
        <Link to={`/subjects/${subjectId}`} className="back-link">
          Volver al dashboard
        </Link>
        <h1>Sesion de Practica</h1>
        <p className="practice-description">
          Configura tu sesion de estudio. Las preguntas se generaran automaticamente basadas en tus preferencias.
        </p>
      </div>

      <div className="setup-form">
        {/* Seleccion de temas */}
        <div className="setup-section">
          <h3 className="section-title">Temas a enfocar</h3>
          <p className="section-hint">
            Selecciona los temas en los que quieres mas preguntas. Si no seleccionas ninguno, se incluiran todos.
          </p>
          <div className="topic-chips">
            {SECTIONS.map(section => (
              <button
                key={section.id}
                type="button"
                className={`chip ${topicFocus.includes(section.id) ? 'selected' : ''}`}
                onClick={() => toggleTopic(section.id)}
              >
                {section.name}
              </button>
            ))}
          </div>
        </div>

        {/* Seleccion de dificultad */}
        <div className="setup-section">
          <h3 className="section-title">Dificultad</h3>
          <div className="difficulty-options">
            {DIFFICULTIES.map(d => (
              <label
                key={d.id}
                className={`difficulty-option ${difficulty === d.id ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="difficulty"
                  value={d.id}
                  checked={difficulty === d.id}
                  onChange={() => setDifficulty(d.id)}
                />
                <div className="difficulty-content">
                  <span className="difficulty-name">{d.name}</span>
                  <span className="difficulty-description">{d.description}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Numero de preguntas */}
        <div className="setup-section">
          <h3 className="section-title">Numero de preguntas</h3>
          <div className="count-options">
            {QUESTION_COUNTS.map(count => (
              <button
                key={count}
                type="button"
                className={`count-option ${questionCount === count ? 'selected' : ''}`}
                onClick={() => setQuestionCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        {/* Submit button */}
        <div className="setup-actions">
          <button
            className="btn btn-primary btn-lg start-button"
            onClick={handleStart}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Creando sesion...
              </>
            ) : (
              'Comenzar Practica'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PracticeSetup;
