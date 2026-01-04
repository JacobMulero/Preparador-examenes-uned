import { Link } from 'react-router-dom';
import './SubjectCard.css';

function SubjectCard({ subject }) {
  const methodologyLabels = {
    test: 'Tipo Test',
    practice: 'Practica'
  };

  const modeLabels = {
    test: { icon: '', label: 'Test' },
    verification: { icon: '', label: 'Verificacion' }
  };

  return (
    <Link to={`/subjects/${subject.id}`} className="subject-card">
      <div className="subject-header">
        <span className="subject-short">{subject.short_name || subject.id.toUpperCase()}</span>
        <h2>{subject.name}</h2>
      </div>

      {subject.description && (
        <p className="subject-description">{subject.description}</p>
      )}

      <div className="subject-badges">
        {subject.methodology.map(m => (
          <span key={m} className="badge methodology">
            {methodologyLabels[m] || m}
          </span>
        ))}
      </div>

      <div className="subject-modes">
        <span className="modes-label">Modos disponibles:</span>
        <div className="modes-list">
          {subject.modes.map(mode => (
            <span key={mode} className="mode-badge">
              {modeLabels[mode]?.icon} {modeLabels[mode]?.label || mode}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export default SubjectCard;
