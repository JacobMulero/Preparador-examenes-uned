import { Routes, Route } from 'react-router-dom';
import Layout from './shared/Layout';
import TopicSelector from './questions/TopicSelector';
import QuestionList from './questions/QuestionList';
import ReviewMode from './progress/ReviewMode';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TopicSelector />} />
        <Route path="/topic/:topicId" element={<QuestionList />} />
        <Route path="/review" element={<ReviewMode />} />
      </Routes>
    </Layout>
  );
}

export default App;
