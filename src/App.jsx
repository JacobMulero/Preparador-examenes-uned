import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './shared/Layout';
import SubjectSelector from './subjects/SubjectSelector';
import SubjectDashboard from './subjects/SubjectDashboard';
import TopicSelector from './questions/TopicSelector';
import QuestionList from './questions/QuestionList';
import ReviewMode from './progress/ReviewMode';
import PipelineDashboard from './pipeline/PipelineDashboard';
import QuestionReview from './pipeline/QuestionReview';
import PracticeSetup from './practice/PracticeSetup';
import GeneratedTestQuestions from './practice/GeneratedTestQuestions';
import VerificationSetupPage from './verification/VerificationSetupPage';
import VerificationSession from './verification/VerificationSession';
import VerificationResults from './verification/VerificationResults';

function App() {
  return (
    <Layout>
      <Routes>
        {/* Fase 0: Selector de asignaturas como pagina principal */}
        <Route path="/" element={<SubjectSelector />} />

        {/* Rutas por asignatura */}
        <Route path="/subjects/:subjectId" element={<SubjectDashboard />} />
        <Route path="/subjects/:subjectId/topic/:topicId" element={<QuestionList />} />

        {/* Fase 2: Pipeline de PDFs */}
        <Route path="/pipeline/:subjectId" element={<PipelineDashboard />} />
        <Route path="/pipeline/:subjectId/exam/:examId/review" element={<QuestionReview />} />

        {/* Fase 3: Practica con preguntas generadas */}
        <Route path="/practice/:subjectId" element={<PracticeSetup />} />
        <Route path="/practice/:subjectId/session/:sessionId" element={<GeneratedTestQuestions />} />

        {/* Fase 4: Verificacion oral */}
        <Route path="/subjects/:subjectId/verification" element={<VerificationSetupPage />} />
        <Route path="/subjects/:subjectId/verification/:sessionId" element={<VerificationSession />} />
        <Route path="/subjects/:subjectId/verification/:sessionId/results" element={<VerificationResults />} />

        {/* Compatibilidad hacia atras: redirigir rutas antiguas a BDA */}
        <Route path="/topics" element={<Navigate to="/subjects/bda" replace />} />
        <Route path="/topic/:topicId" element={<QuestionList />} />
        <Route path="/review" element={<ReviewMode />} />
      </Routes>
    </Layout>
  );
}

export default App;
