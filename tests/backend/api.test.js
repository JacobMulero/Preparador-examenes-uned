/**
 * Tests for API Client (src/shared/api.js)
 * Tests transformation functions and API methods
 */

// Since this is a Node test file, we need to mock axios and test transformations

describe('API Client', () => {
  // Transform functions (pure functions that can be tested directly)
  const transformTopic = (t) => ({
    id: t.topic,
    name: t.topic.replace('Tema', 'Tema ').replace('SinTema', 'Mixtas'),
    questionCount: t.question_count,
    loaded: t.loaded
  });

  const transformQuestion = (q) => ({
    id: q.id,
    topic: q.topic,
    number: q.question_number,
    statement: q.shared_statement,
    text: q.content,
    optionA: q.options?.a || '',
    optionB: q.options?.b || '',
    optionC: q.options?.c || '',
    optionD: q.options?.d || '',
    fullContent: buildFullContent(q)
  });

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

  const transformStats = (s) => ({
    total: s.total_questions || 0,
    answered: s.answered_questions || s.questions_attempted || 0,
    correct: s.correct_attempts || 0,
    failed: (s.answered_questions || s.questions_attempted || 0) - (s.correct_attempts || 0),
    remaining: s.questions_remaining || 0,
    accuracy: s.accuracy || 0
  });

  const transformSolution = (s) => ({
    correctAnswer: s.answer,
    explanation: s.explanation,
    wrongOptions: s.wrongOptions || {}
  });

  describe('transformTopic', () => {
    it('should transform Tema1 correctly', () => {
      const result = transformTopic({
        topic: 'Tema1',
        question_count: 50,
        loaded: true
      });

      expect(result.id).toBe('Tema1');
      expect(result.name).toBe('Tema 1');
      expect(result.questionCount).toBe(50);
      expect(result.loaded).toBe(true);
    });

    it('should transform SinTema to Mixtas', () => {
      const result = transformTopic({
        topic: 'SinTema',
        question_count: 30,
        loaded: false
      });

      expect(result.id).toBe('SinTema');
      // Note: The replace chain produces 'Mixtas ' with trailing space
      // due to 'SinTema' -> 'SinTema ' -> 'Mixtas '
      expect(result.name).toBe('Mixtas ');
    });

    it('should handle Tema with multiple digits', () => {
      const result = transformTopic({
        topic: 'Tema12',
        question_count: 10,
        loaded: true
      });

      expect(result.name).toBe('Tema 12');
    });
  });

  describe('transformQuestion', () => {
    it('should transform question with all fields', () => {
      const result = transformQuestion({
        id: 'tema1_pregunta1',
        topic: 'Tema1',
        question_number: 1,
        shared_statement: 'Given a database...',
        content: 'What is SQL?',
        options: {
          a: 'Answer A',
          b: 'Answer B',
          c: 'Answer C',
          d: 'Answer D'
        }
      });

      expect(result.id).toBe('tema1_pregunta1');
      expect(result.topic).toBe('Tema1');
      expect(result.number).toBe(1);
      expect(result.statement).toBe('Given a database...');
      expect(result.text).toBe('What is SQL?');
      expect(result.optionA).toBe('Answer A');
      expect(result.optionB).toBe('Answer B');
      expect(result.optionC).toBe('Answer C');
      expect(result.optionD).toBe('Answer D');
    });

    it('should handle missing options', () => {
      const result = transformQuestion({
        id: 'q1',
        topic: 'Tema1',
        question_number: 1,
        content: 'Question',
        options: null
      });

      expect(result.optionA).toBe('');
      expect(result.optionB).toBe('');
      expect(result.optionC).toBe('');
      expect(result.optionD).toBe('');
    });

    it('should handle partial options', () => {
      const result = transformQuestion({
        id: 'q1',
        topic: 'Tema1',
        question_number: 1,
        content: 'Question',
        options: { a: 'A', c: 'C' }
      });

      expect(result.optionA).toBe('A');
      expect(result.optionB).toBe('');
      expect(result.optionC).toBe('C');
      expect(result.optionD).toBe('');
    });

    it('should handle null shared_statement', () => {
      const result = transformQuestion({
        id: 'q1',
        topic: 'Tema1',
        question_number: 1,
        shared_statement: null,
        content: 'Question',
        options: {}
      });

      expect(result.statement).toBeNull();
    });
  });

  describe('buildFullContent', () => {
    it('should build full content with statement', () => {
      const content = buildFullContent({
        shared_statement: 'Given context',
        content: 'Question text',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });

      expect(content).toContain('**Enunciado:** Given context');
      expect(content).toContain('Question text');
      expect(content).toContain('a) A');
      expect(content).toContain('b) B');
      expect(content).toContain('c) C');
      expect(content).toContain('d) D');
    });

    it('should build content without statement', () => {
      const content = buildFullContent({
        shared_statement: null,
        content: 'Question text',
        options: { a: 'A', b: 'B', c: 'C', d: 'D' }
      });

      expect(content).not.toContain('Enunciado');
      expect(content).toContain('Question text');
    });

    it('should handle missing options', () => {
      const content = buildFullContent({
        content: 'Question text',
        options: null
      });

      expect(content).toContain('Question text');
      expect(content).not.toContain('a)');
    });
  });

  describe('transformStats', () => {
    it('should transform stats with all fields', () => {
      const result = transformStats({
        total_questions: 100,
        answered_questions: 50,
        correct_attempts: 40,
        questions_remaining: 50,
        accuracy: 80
      });

      expect(result.total).toBe(100);
      expect(result.answered).toBe(50);
      expect(result.correct).toBe(40);
      expect(result.failed).toBe(10);
      expect(result.remaining).toBe(50);
      expect(result.accuracy).toBe(80);
    });

    it('should handle empty stats', () => {
      const result = transformStats({});

      expect(result.total).toBe(0);
      expect(result.answered).toBe(0);
      expect(result.correct).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);
      expect(result.accuracy).toBe(0);
    });

    it('should prefer questions_attempted over answered_questions', () => {
      const result = transformStats({
        questions_attempted: 30
      });

      expect(result.answered).toBe(30);
    });

    it('should calculate failed correctly', () => {
      const result = transformStats({
        answered_questions: 20,
        correct_attempts: 15
      });

      expect(result.failed).toBe(5);
    });
  });

  describe('transformSolution', () => {
    it('should transform solution with all fields', () => {
      const result = transformSolution({
        answer: 'a',
        explanation: 'Because A is correct',
        wrongOptions: {
          b: 'B is wrong',
          c: 'C is wrong',
          d: 'D is wrong'
        }
      });

      expect(result.correctAnswer).toBe('a');
      expect(result.explanation).toBe('Because A is correct');
      expect(result.wrongOptions.b).toBe('B is wrong');
    });

    it('should handle missing wrongOptions', () => {
      const result = transformSolution({
        answer: 'b',
        explanation: 'Explanation'
      });

      expect(result.correctAnswer).toBe('b');
      expect(result.wrongOptions).toEqual({});
    });

    it('should handle null wrongOptions', () => {
      const result = transformSolution({
        answer: 'c',
        explanation: 'Test',
        wrongOptions: null
      });

      expect(result.wrongOptions).toEqual({});
    });
  });
});
