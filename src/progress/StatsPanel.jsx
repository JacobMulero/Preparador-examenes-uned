import ProgressBar from './ProgressBar';
import './StatsPanel.css';

function StatsPanel({ stats, compact = false }) {
  if (!stats) return null;

  const { total, answered, correct, failed } = stats;

  const answeredPercent = total > 0 ? (answered / total) * 100 : 0;
  const correctPercent = answered > 0 ? (correct / answered) * 100 : 0;
  const failedPercent = answered > 0 ? (failed / answered) * 100 : 0;

  if (compact) {
    return (
      <div className="stats-panel compact card">
        <div className="stats-compact-row">
          <div className="stat-compact">
            <span className="stat-compact-value">{answered}</span>
            <span className="stat-compact-label">Respondidas</span>
          </div>
          <div className="stat-compact">
            <span className="stat-compact-value text-success">{correct}</span>
            <span className="stat-compact-label">Correctas</span>
          </div>
          <div className="stat-compact">
            <span className="stat-compact-value text-error">{failed}</span>
            <span className="stat-compact-label">Falladas</span>
          </div>
          <div className="stat-compact">
            <span className="stat-compact-value">{total - answered}</span>
            <span className="stat-compact-label">Pendientes</span>
          </div>
        </div>
        {answered > 0 && (
          <div className="stats-compact-progress">
            <span className="progress-label">Tasa de acierto</span>
            <div className="progress-row">
              <ProgressBar
                value={correctPercent}
                variant={correctPercent >= 70 ? 'success' : correctPercent >= 50 ? 'warning' : 'error'}
              />
              <span className="progress-value">{correctPercent.toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stats-panel card">
      <div className="card-header">
        <h3>Estadisticas Globales</h3>
      </div>
      <div className="card-body">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{total}</span>
              <span className="stat-label">Total preguntas</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon answered">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value">{answered}</span>
              <span className="stat-label">Respondidas</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon correct">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value text-success">{correct}</span>
              <span className="stat-label">Correctas</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon failed">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-value text-error">{failed}</span>
              <span className="stat-label">Falladas</span>
            </div>
          </div>
        </div>

        <div className="stats-progress-section">
          <div className="progress-item">
            <div className="progress-header">
              <span className="progress-title">Progreso general</span>
              <span className="progress-value">{answeredPercent.toFixed(0)}%</span>
            </div>
            <ProgressBar value={answeredPercent} />
          </div>

          {answered > 0 && (
            <div className="progress-item">
              <div className="progress-header">
                <span className="progress-title">Tasa de acierto</span>
                <span className="progress-value">{correctPercent.toFixed(0)}%</span>
              </div>
              <ProgressBar
                value={correctPercent}
                variant={correctPercent >= 70 ? 'success' : correctPercent >= 50 ? 'warning' : 'error'}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;
