import './ProgressBar.css';

function ProgressBar({ value, showLabel = false, variant = 'default', size = 'md' }) {
  // Ensure value is between 0 and 100
  const normalizedValue = Math.min(100, Math.max(0, value || 0));

  return (
    <div className={`progress-bar-container ${size}`}>
      <div className={`progress-bar ${variant}`}>
        <div
          className={`progress-bar-fill ${variant}`}
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="progress-bar-label">{normalizedValue.toFixed(0)}%</span>
      )}
    </div>
  );
}

export default ProgressBar;
