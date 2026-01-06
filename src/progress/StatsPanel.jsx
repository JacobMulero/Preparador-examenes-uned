import ProgressBar from './ProgressBar';
import './StatsPanel.css';

function StatsPanel({ stats, compact = false }) {
  if (!stats) return null;

  const { total, answered, correct, failed } = stats;
  const pending = total - answered;

  const answeredPercent = total > 0 ? (answered / total) * 100 : 0;
  const correctPercent = answered > 0 ? (correct / answered) * 100 : 0;

  // Linear-style inline stats
  return (
    <div className={`stats-panel ${compact ? 'compact' : ''}`}>
      <div className="stats-inline">
        <span className="stat-item">
          <span className="stat-value">{answered}</span>
          <span className="stat-label">respondidas</span>
        </span>
        <span className="stat-separator" aria-hidden="true"></span>
        <span className="stat-item">
          <span className="stat-value stat-success">{correct}</span>
          <span className="stat-label">correctas</span>
        </span>
        <span className="stat-separator" aria-hidden="true"></span>
        <span className="stat-item">
          <span className="stat-value stat-error">{failed}</span>
          <span className="stat-label">falladas</span>
        </span>
        <span className="stat-separator" aria-hidden="true"></span>
        <span className="stat-item">
          <span className="stat-value">{pending}</span>
          <span className="stat-label">pendientes</span>
        </span>
      </div>

      <div className="stats-progress">
        <ProgressBar value={answeredPercent} />
      </div>

      {answered > 0 && !compact && (
        <div className="stats-accuracy">
          <span className="accuracy-label">Tasa de acierto</span>
          <span className="accuracy-value">{correctPercent.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

export default StatsPanel;
