import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 minutes for Claude calls
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - extract data from { success, data } wrapper
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      console.error(`[API] Error ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      console.error('[API] No response received:', error.message);
    } else {
      console.error('[API] Setup error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Transform topic from backend format to frontend format
function transformTopic(t) {
  return {
    id: t.topic,
    name: t.topic.replace('Tema', 'Tema ').replace('SinTema', 'Mixtas'),
    questionCount: t.question_count,
    loaded: t.loaded
  };
}

// Transform question from backend format to frontend format
function transformQuestion(q) {
  return {
    id: q.id,
    topic: q.topic,
    number: q.question_number,
    statement: q.shared_statement,
    text: q.content,
    optionA: q.options?.a || '',
    optionB: q.options?.b || '',
    optionC: q.options?.c || '',
    optionD: q.options?.d || '',
    // Full content for Claude - includes statement + text + options
    fullContent: buildFullContent(q)
  };
}

function buildFullContent(q) {
  let content = '';
  if (q.shared_statement) {
    content += `**Enunciado:** ${q.shared_statement}\n\n`;
  }
  content += q.content + '\n\n';
  if (q.options) {
    content += `a) ${q.options.a}\n`;
    content += `b) ${q.options.b}\n`;
    content += `c) ${q.options.c}\n`;
    content += `d) ${q.options.d}`;
  }
  return content;
}

// Transform stats from backend format to frontend format
function transformStats(s) {
  return {
    total: s.total_questions || 0,
    answered: s.answered_questions || s.questions_attempted || 0,
    correct: s.correct_attempts || 0,
    failed: (s.answered_questions || s.questions_attempted || 0) - (s.correct_attempts || 0),
    remaining: s.questions_remaining || 0,
    accuracy: s.accuracy || 0
  };
}

// Transform solution from backend format to frontend format
function transformSolution(s) {
  return {
    correctAnswer: s.answer,
    explanation: s.explanation,
    wrongOptions: s.wrongOptions || {}
  };
}

// API methods with transformations
export const questionsApi = {
  // Get list of available topics
  getTopics: async () => {
    const res = await api.get('/topics');
    return {
      ...res,
      data: (res.data?.data || []).map(transformTopic)
    };
  },

  // Get all questions for a topic
  getQuestions: async (topicId) => {
    const res = await api.get(`/questions/${topicId}`);
    return {
      ...res,
      data: (res.data?.data || []).map(transformQuestion)
    };
  },

  // Get a specific question by ID
  getQuestion: async (questionId) => {
    const res = await api.get(`/question/${questionId}`);
    return {
      ...res,
      data: res.data?.data ? transformQuestion(res.data.data) : null
    };
  },

  // Get random question from topic
  getRandomQuestion: async (topicId) => {
    const res = await api.get(`/questions/${topicId}/random`);
    return {
      ...res,
      data: res.data?.data ? transformQuestion(res.data.data) : null
    };
  },

  // Get next unanswered question
  getNextQuestion: async (topicId) => {
    const res = await api.get(`/questions/${topicId}/next`);
    return {
      ...res,
      data: res.data?.data ? transformQuestion(res.data.data) : null
    };
  },
};

export const solvingApi = {
  // Solve a question using Claude
  solve: async (questionId, questionContent) => {
    const res = await api.post('/solve', {
      questionId,
      questionText: questionContent, // Backend expects questionText
    });
    return {
      ...res,
      data: res.data?.data ? transformSolution(res.data.data) : null
    };
  },

  // Get cached solution if exists
  getCachedSolution: async (questionId) => {
    const res = await api.get(`/solve/${questionId}`);
    return {
      ...res,
      data: res.data?.data ? transformSolution(res.data.data) : null
    };
  },
};

// ============================================
// Subjects API (Fase 0)
// ============================================

export const subjectsApi = {
  // Get list of subjects
  getSubjects: async () => {
    const res = await api.get('/subjects');
    return res;
  },

  // Get subject details
  getSubject: async (subjectId) => {
    const res = await api.get(`/subjects/${subjectId}`);
    return res;
  },

  // Get topics for a subject
  getSubjectTopics: async (subjectId) => {
    const res = await api.get(`/subjects/${subjectId}/topics`);
    return res;
  },

  // Create a subject
  createSubject: async (subject) => {
    const res = await api.post('/subjects', subject);
    return res;
  },

  // Update a subject
  updateSubject: async (subjectId, updates) => {
    const res = await api.put(`/subjects/${subjectId}`, updates);
    return res;
  },
};

export const progressApi = {
  // Record an attempt
  recordAttempt: async (data) => {
    const res = await api.post('/attempts', data);
    return res;
  },

  // Get global stats
  getStats: async () => {
    const res = await api.get('/stats');
    return {
      ...res,
      data: res.data?.data ? transformStats(res.data.data) : null
    };
  },

  // Get stats for specific topic
  getTopicStats: async (topicId) => {
    const res = await api.get(`/stats/${topicId}`);
    return {
      ...res,
      data: res.data?.data ? transformStats(res.data.data) : null
    };
  },

  // Get failed questions
  getFailedQuestions: async () => {
    const res = await api.get('/progress/failed');
    return {
      ...res,
      data: (res.data?.data || []).map(transformQuestion)
    };
  },

  // Get unanswered questions
  getUnansweredQuestions: async () => {
    const res = await api.get('/progress/unanswered');
    return {
      ...res,
      data: (res.data?.data || []).map(transformQuestion)
    };
  },
};

export default api;
