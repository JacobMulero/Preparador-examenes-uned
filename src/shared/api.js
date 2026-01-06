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

  // Get topics for a subject (Fase 1: subject-aware)
  getSubjectTopics: async (subjectId) => {
    const res = await api.get(`/subjects/${subjectId}/topics`);
    return {
      ...res,
      data: res.data
    };
  },

  // Get questions for a topic in a subject (Fase 1)
  getSubjectQuestions: async (subjectId, topicId) => {
    const res = await api.get(`/subjects/${subjectId}/questions/${topicId}`);
    return {
      ...res,
      data: (res.data?.data || []).map(transformQuestion)
    };
  },

  // Get random question for a topic in a subject (Fase 1)
  getSubjectRandomQuestion: async (subjectId, topicId) => {
    const res = await api.get(`/subjects/${subjectId}/questions/${topicId}/random`);
    return {
      ...res,
      data: res.data?.data ? transformQuestion(res.data.data) : null
    };
  },

  // Get next unanswered question for a topic in a subject (Fase 1)
  getSubjectNextQuestion: async (subjectId, topicId) => {
    const res = await api.get(`/subjects/${subjectId}/questions/${topicId}/next`);
    return {
      ...res,
      data: res.data?.data ? transformQuestion(res.data.data) : null
    };
  },

  // Get specific question by ID for a subject (Fase 1)
  getSubjectQuestion: async (subjectId, questionId) => {
    const res = await api.get(`/subjects/${subjectId}/question/${questionId}`);
    return {
      ...res,
      data: res.data?.data ? transformQuestion(res.data.data) : null
    };
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

// ============================================
// Pipeline API (Fase 2)
// ============================================

export const pipelineApi = {
  // Upload a PDF exam
  uploadPdf: async (file, subjectId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subjectId', subjectId);

    const res = await api.post('/pipeline/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes for large files
    });
    return res;
  },

  // Get list of exams for a subject
  getExams: async (subjectId) => {
    const res = await api.get(`/pipeline/exams?subjectId=${subjectId}`);
    return res;
  },

  // Get exam details
  getExam: async (examId) => {
    const res = await api.get(`/pipeline/exams/${examId}`);
    return res;
  },

  // Delete an exam
  deleteExam: async (examId) => {
    const res = await api.delete(`/pipeline/exams/${examId}`);
    return res;
  },

  // Extract pages from PDF
  extractPages: async (examId) => {
    const res = await api.post(`/pipeline/exams/${examId}/extract`);
    return res;
  },

  // Process all pages with Claude Vision
  processExam: async (examId) => {
    const res = await api.post(`/pipeline/exams/${examId}/process`, {}, {
      timeout: 600000, // 10 minutes for Vision processing
    });
    return res;
  },

  // Process a single page
  processPage: async (examId, pageId) => {
    const res = await api.post(`/pipeline/exams/${examId}/process-page/${pageId}`, {}, {
      timeout: 120000, // 2 minutes per page
    });
    return res;
  },

  // Get questions for an exam
  getExamQuestions: async (examId, status = null) => {
    let url = `/pipeline/exams/${examId}/questions`;
    if (status) url += `?status=${status}`;
    const res = await api.get(url);
    return res;
  },

  // Get a single question
  getQuestion: async (questionId) => {
    const res = await api.get(`/pipeline/questions/${questionId}`);
    return res;
  },

  // Update a question
  updateQuestion: async (questionId, data) => {
    const res = await api.put(`/pipeline/questions/${questionId}`, data);
    return res;
  },

  // Approve a question
  approveQuestion: async (questionId, topic = null, notes = null) => {
    const res = await api.post(`/pipeline/questions/${questionId}/approve`, { topic, notes });
    return res;
  },

  // Reject a question
  rejectQuestion: async (questionId, notes = null) => {
    const res = await api.post(`/pipeline/questions/${questionId}/reject`, { notes });
    return res;
  },

  // Approve all pending questions for an exam
  approveAllQuestions: async (examId, topic = null) => {
    const res = await api.post(`/pipeline/exams/${examId}/approve-all`, { topic });
    return res;
  },
};

// ============================================
// Generation API (Fase 3)
// ============================================

export const generationApi = {
  // Create a test session
  createTestSession: async (config) => {
    const res = await api.post('/generate/test-session', config);
    return res;
  },

  // Start question generation
  startGeneration: async (sessionId) => {
    const res = await api.post(`/generate/sessions/${sessionId}/start`);
    return res;
  },

  // Get session details
  getSession: async (sessionId) => {
    const res = await api.get(`/generate/sessions/${sessionId}`);
    return res;
  },

  // Get questions for a session
  getSessionQuestions: async (sessionId) => {
    const res = await api.get(`/generate/sessions/${sessionId}/questions`);
    return res;
  },

  // Submit an answer for a generated question
  submitGeneratedAnswer: async (sessionId, attempt) => {
    const res = await api.post(`/generate/sessions/${sessionId}/attempt`, attempt);
    return res;
  },

  // Get session statistics
  getSessionStats: async (sessionId) => {
    const res = await api.get(`/generate/sessions/${sessionId}/stats`);
    return res;
  },

  // Get sessions for a deliverable
  getDeliverableSessions: async (deliverableId) => {
    const res = await api.get(`/generate/deliverable/${deliverableId}/sessions`);
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
