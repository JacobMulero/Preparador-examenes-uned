import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './QuestionCard.css';

function QuestionCard({
  question,
  selectedAnswer,
  onSelectAnswer,
  result,
  disabled,
}) {
  if (!question) {
    return (
      <div className="question-card card">
        <div className="card-body">
          <div className="empty-state">
            <div className="empty-state-icon">?</div>
            <div className="empty-state-title">No hay pregunta</div>
            <div className="empty-state-description">
              Selecciona un tema para comenzar a practicar
            </div>
          </div>
        </div>
      </div>
    );
  }

  const options = [
    { key: 'a', text: question.optionA },
    { key: 'b', text: question.optionB },
    { key: 'c', text: question.optionC },
    { key: 'd', text: question.optionD },
  ].filter(opt => opt.text); // Filter out empty options

  const getOptionClass = (optionKey) => {
    const classes = ['radio-option'];

    if (selectedAnswer === optionKey && !result) {
      classes.push('selected');
    }

    if (result) {
      if (optionKey === result.correctAnswer) {
        classes.push('correct');
      } else if (selectedAnswer === optionKey && optionKey !== result.correctAnswer) {
        classes.push('incorrect');
      }
    }

    return classes.join(' ');
  };

  return (
    <div className="question-card card">
      <div className="card-header">
        <div className="question-meta">
          <span className="question-number">Pregunta {question.number}</span>
          {question.page && (
            <span className="question-page">Pagina {question.page}</span>
          )}
        </div>
      </div>

      <div className="card-body">
        {/* Shared statement if exists */}
        {question.statement && (
          <div className="question-statement">
            <div className="statement-label">Enunciado</div>
            <div className="statement-content markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.statement}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Question text */}
        <div className="question-text markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.text}</ReactMarkdown>
        </div>

        {/* Options */}
        <div className="question-options radio-group">
          {options.map((option) => (
            <label
              key={option.key}
              className={getOptionClass(option.key)}
              onClick={(e) => {
                if (!disabled && !result) {
                  onSelectAnswer(option.key);
                }
              }}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.key}
                checked={selectedAnswer === option.key}
                onChange={() => onSelectAnswer(option.key)}
                disabled={disabled || !!result}
              />
              <span className="radio-option-key">{option.key}</span>
              <span className="radio-option-label markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{option.text}</ReactMarkdown>
              </span>
              {result && option.key === result.correctAnswer && (
                <span className="option-indicator correct-indicator">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
              )}
              {result && selectedAnswer === option.key && option.key !== result.correctAnswer && (
                <span className="option-indicator incorrect-indicator">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export default QuestionCard;
