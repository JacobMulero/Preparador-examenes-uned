import QuestionCard from '../../questions/QuestionCard';
import SolveButton from '../../solving/SolveButton';
import AnswerPanel from '../../solving/AnswerPanel';
import ProgressBar from '../../progress/ProgressBar';
import './QuestionSession.css';

/**
 * Componente reutilizable para mostrar una sesion de preguntas
 * @param {Object} props
 * @param {Object} props.session - Return value de useQuestionSession
 * @param {React.ReactNode} props.header - Contenido del header
 * @param {React.ReactNode} props.beforeQuestion - Contenido antes de la pregunta
 * @param {React.ReactNode} props.afterAnswer - Contenido despues de AnswerPanel
 * @param {boolean} props.showProgress - Mostrar barra de progreso
 * @param {boolean} props.showNavigation - Mostrar botones de navegacion
 * @param {boolean} props.showQuickNav - Mostrar navegacion rapida (numeros)
 * @param {string} props.navHint - Texto de ayuda para navegacion
 * @param {React.ReactNode} props.emptyState - Contenido personalizado para estado vacio
 */
function QuestionSession({
  session,
  header,
  beforeQuestion,
  afterAnswer,
  showProgress = true,
  showNavigation = true,
  showQuickNav = false,
  navHint = 'Usa flechas para navegar, a/b/c/d para responder',
  emptyState
}) {
  const {
    questions,
    currentQuestion,
    currentIndex,
    selectedAnswer,
    result,
    solving,
    loading,
    error,
    progress,
    isFirst,
    isLast,
    handleSelectAnswer,
    handleSolve,
    goToPrevious,
    goToNext,
    goToQuestion,
    reload
  } = session;

  // Loading state
  if (loading) {
    return (
      <div className="question-session">
        {header}
        <div className="card">
          <div className="card-body">
            <div className="skeleton skeleton-title"></div>
            <div className="skeleton skeleton-text"></div>
            <div className="skeleton skeleton-text"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state (no questions loaded)
  if (error && questions.length === 0) {
    return (
      <div className="question-session">
        {header}
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-primary" onClick={reload}>
          Reintentar
        </button>
      </div>
    );
  }

  // Empty state
  if (questions.length === 0) {
    return (
      <div className="question-session">
        {header}
        {emptyState || (
          <div className="card">
            <div className="card-body">
              <p>No se encontraron preguntas.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="question-session">
      {header}

      {/* Progress */}
      {showProgress && (
        <div className="question-progress">
          <div className="progress-info">
            <span>Pregunta {currentIndex + 1} de {questions.length}</span>
            <span className="progress-percentage">{progress.toFixed(0)}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      {beforeQuestion}

      {/* Question */}
      <QuestionCard
        question={currentQuestion}
        selectedAnswer={selectedAnswer}
        onSelectAnswer={handleSelectAnswer}
        result={result}
        disabled={solving}
      />

      {/* Solve button */}
      {!result && (
        <div className="question-actions">
          <SolveButton
            onClick={handleSolve}
            disabled={!selectedAnswer}
            loading={solving}
          />
          {error && <div className="alert alert-error mt-3">{error}</div>}
        </div>
      )}

      {/* Answer panel */}
      {result && (
        <AnswerPanel
          result={result}
          userAnswer={selectedAnswer}
          question={currentQuestion}
        />
      )}

      {afterAnswer}

      {/* Navigation */}
      {showNavigation && (
        <div className="question-navigation">
          <button
            className="btn btn-secondary"
            onClick={goToPrevious}
            disabled={isFirst}
          >
            ← Anterior
          </button>

          <div className="question-nav-info">
            <span className="nav-hint">{navHint}</span>
          </div>

          <button
            className="btn btn-secondary"
            onClick={goToNext}
            disabled={isLast}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Quick navigation */}
      {showQuickNav && questions.length <= 30 && (
        <div className="question-quick-nav">
          <span className="quick-nav-label">Ir a:</span>
          <div className="quick-nav-buttons">
            {questions.map((q, index) => (
              <button
                key={q.id}
                className={`quick-nav-btn ${index === currentIndex ? 'active' : ''}`}
                onClick={() => goToQuestion(index)}
              >
                {q.number || index + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionSession;
