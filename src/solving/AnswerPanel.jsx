import ReactMarkdown from 'react-markdown';
import './AnswerPanel.css';

function AnswerPanel({ result, userAnswer, question }) {
  if (!result) return null;

  const isCorrect = userAnswer === result.correctAnswer;

  const optionLabels = {
    a: question?.optionA,
    b: question?.optionB,
    c: question?.optionC,
    d: question?.optionD,
  };

  return (
    <div className={`answer-panel card ${isCorrect ? 'correct' : 'incorrect'}`}>
      {/* Result header */}
      <div className="answer-header">
        <div className={`answer-icon ${isCorrect ? 'correct' : 'incorrect'}`}>
          {isCorrect ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          )}
        </div>
        <div className="answer-title">
          <h3>{isCorrect ? 'Respuesta correcta' : 'Respuesta incorrecta'}</h3>
          <p>
            {isCorrect
              ? 'Has acertado esta pregunta.'
              : `La respuesta correcta es la opcion ${result.correctAnswer.toUpperCase()}.`}
          </p>
        </div>
      </div>

      {/* Explanation */}
      <div className="answer-body">
        <div className="answer-section">
          <h4 className="section-title">Explicacion</h4>
          <div className="section-content markdown-content">
            <ReactMarkdown>{result.explanation || 'Sin explicacion disponible.'}</ReactMarkdown>
          </div>
        </div>

        {/* Wrong options explanation */}
        {result.wrongOptions && Object.keys(result.wrongOptions).length > 0 && (
          <div className="answer-section">
            <h4 className="section-title">Por que las otras opciones son incorrectas</h4>
            <div className="wrong-options">
              {Object.entries(result.wrongOptions).map(([key, explanation]) => {
                if (key === result.correctAnswer) return null;
                return (
                  <div key={key} className="wrong-option">
                    <div className="wrong-option-header">
                      <span className="wrong-option-key">{key.toUpperCase()}</span>
                      {optionLabels[key] && (
                        <span className="wrong-option-text">
                          {optionLabels[key].length > 60
                            ? optionLabels[key].substring(0, 60) + '...'
                            : optionLabels[key]}
                        </span>
                      )}
                    </div>
                    <div className="wrong-option-explanation markdown-content">
                      <ReactMarkdown>{explanation}</ReactMarkdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="answer-summary">
          <div className="summary-item">
            <span className="summary-label">Tu respuesta:</span>
            <span className={`summary-value ${isCorrect ? 'correct' : 'incorrect'}`}>
              {userAnswer.toUpperCase()}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Respuesta correcta:</span>
            <span className="summary-value correct">
              {result.correctAnswer.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnswerPanel;
