import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { subjectsApi } from '../shared/api';
import VerificationSetup from './VerificationSetup';

function VerificationSetupPage() {
  const { subjectId } = useParams();
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubject = async () => {
      try {
        const res = await subjectsApi.getSubject(subjectId);
        if (res.data.success) {
          setSubject(res.data.subject);
        }
      } catch (err) {
        console.error('Error fetching subject:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSubject();
  }, [subjectId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        Cargando...
      </div>
    );
  }

  return (
    <VerificationSetup
      subjectId={subjectId}
      subjectName={subject?.name || subjectId}
    />
  );
}

export default VerificationSetupPage;
