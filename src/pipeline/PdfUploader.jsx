import { useState, useRef } from 'react';
import { pipelineApi } from '../shared/api';

function PdfUploader({ subjectId, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('El archivo es demasiado grande (max 50MB)');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const res = await pipelineApi.uploadPdf(file, subjectId);
      if (res.data?.success) {
        onSuccess(res.data.data);
        // Reset input
        if (inputRef.current) inputRef.current.value = '';
      } else {
        setError(res.data?.error || 'Error al subir el archivo');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="pdf-uploader">
      <div
        className={`upload-zone ${dragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={!uploading ? handleClick : undefined}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={handleChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />

        {uploading ? (
          <div className="upload-status">
            <div className="spinner"></div>
            <span>Subiendo PDF...</span>
          </div>
        ) : (
          <div className="upload-prompt">
            <span className="upload-icon">📄</span>
            <span className="upload-text">
              Arrastra un PDF aqui o haz clic para seleccionar
            </span>
            <span className="upload-hint">Max 50MB</span>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error mt-2">{error}</div>
      )}
    </div>
  );
}

export default PdfUploader;
