import { Link } from 'react-router-dom';
import './SubjectCard.css';

function SubjectCard({ subject }) {
  const methodologyLabels = {
    test: 'Tipo Test',
    practice: 'Practica'
  };

  return (
    <Link to={`/subjects/${subject.id}`} className="subject-card">
      <div className="subject-card-content">
        <div className="subject-header">
          <span className="subject-code">{subject.short_name || subject.id.toUpperCase()}</span>
          <h2 className="subject-name">{subject.name}</h2>
        </div>

        {subject.description && (
          <p className="subject-description">{subject.description}</p>
        )}

        <div className="subject-footer">
          <div className="subject-badges">
            {subject.methodology.map(m => (
              <span key={m} className="subject-badge">
                {methodologyLabels[m] || m}
              </span>
            ))}
          </div>
          <span className="subject-arrow" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default SubjectCard;
