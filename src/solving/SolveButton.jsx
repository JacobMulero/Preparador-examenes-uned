import './SolveButton.css';

function SolveButton({ onClick, disabled, loading }) {
  return (
    <button
      className={`solve-button btn btn-primary btn-lg ${loading ? 'loading' : ''}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <>
          <div className="spinner"></div>
          <span>Consultando a Claude...</span>
        </>
      ) : (
        <>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>Comprobar respuesta</span>
        </>
      )}
    </button>
  );
}

export default SolveButton;
