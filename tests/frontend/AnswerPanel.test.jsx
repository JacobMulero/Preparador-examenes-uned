/**
 * Tests for AnswerPanel Component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import AnswerPanel from '../../src/solving/AnswerPanel.jsx';

describe('AnswerPanel', () => {
  const mockQuestion = {
    optionA: 'First option',
    optionB: 'Second option',
    optionC: 'Third option',
    optionD: 'Fourth option'
  };

  it('should return null when no result', () => {
    const { container } = render(
      <AnswerPanel result={null} userAnswer="a" question={mockQuestion} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should show correct answer message when correct', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'A is correct',
      wrongOptions: {}
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.getByText('Respuesta correcta')).toBeInTheDocument();
    expect(screen.getByText('Has acertado esta pregunta.')).toBeInTheDocument();
  });

  it('should show incorrect answer message when wrong', () => {
    const result = {
      correctAnswer: 'b',
      explanation: 'B is correct',
      wrongOptions: {}
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.getByText('Respuesta incorrecta')).toBeInTheDocument();
    expect(screen.getByText('La respuesta correcta es la opcion B.')).toBeInTheDocument();
  });

  it('should have correct class when answer is correct', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'Test',
      wrongOptions: {}
    };

    const { container } = render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(container.querySelector('.answer-panel')).toHaveClass('correct');
  });

  it('should have incorrect class when answer is wrong', () => {
    const result = {
      correctAnswer: 'b',
      explanation: 'Test',
      wrongOptions: {}
    };

    const { container } = render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(container.querySelector('.answer-panel')).toHaveClass('incorrect');
  });

  it('should display explanation', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'This is the detailed explanation',
      wrongOptions: {}
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.getByText('This is the detailed explanation')).toBeInTheDocument();
  });

  it('should display default message when no explanation', () => {
    const result = {
      correctAnswer: 'a',
      explanation: null,
      wrongOptions: {}
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.getByText('Sin explicacion disponible.')).toBeInTheDocument();
  });

  it('should display wrong options explanations', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'A is correct',
      wrongOptions: {
        b: 'B is wrong because...',
        c: 'C is wrong because...',
        d: 'D is wrong because...'
      }
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.getByText('B is wrong because...')).toBeInTheDocument();
    expect(screen.getByText('C is wrong because...')).toBeInTheDocument();
    expect(screen.getByText('D is wrong because...')).toBeInTheDocument();
  });

  it('should not display correct answer in wrong options', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'A is correct',
      wrongOptions: {
        a: 'This should not appear',
        b: 'B is wrong'
      }
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.queryByText('This should not appear')).not.toBeInTheDocument();
    expect(screen.getByText('B is wrong')).toBeInTheDocument();
  });

  it('should not render wrong options section when empty', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'A is correct',
      wrongOptions: {}
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.queryByText('Por que las otras opciones son incorrectas')).not.toBeInTheDocument();
  });

  it('should display user answer in summary', () => {
    const result = {
      correctAnswer: 'b',
      explanation: 'Test',
      wrongOptions: {}
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.getByText('Tu respuesta:')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('should display correct answer in summary', () => {
    const result = {
      correctAnswer: 'c',
      explanation: 'Test',
      wrongOptions: {}
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    expect(screen.getByText('Respuesta correcta:')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('should truncate long option text', () => {
    const longOptionQuestion = {
      ...mockQuestion,
      optionB: 'This is a very long option text that should be truncated because it exceeds sixty characters in length'
    };

    const result = {
      correctAnswer: 'a',
      explanation: 'A is correct',
      wrongOptions: {
        b: 'B explanation'
      }
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={longOptionQuestion} />
    );

    expect(screen.getByText(/This is a very long option text.*\.\.\./)).toBeInTheDocument();
  });

  it('should handle missing question options', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'Test',
      wrongOptions: { b: 'B wrong' }
    };

    render(
      <AnswerPanel result={result} userAnswer="a" question={null} />
    );

    expect(screen.getByText('B wrong')).toBeInTheDocument();
  });

  it('should render check icon for correct answer', () => {
    const result = {
      correctAnswer: 'a',
      explanation: 'Test',
      wrongOptions: {}
    };

    const { container } = render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    const icon = container.querySelector('.answer-icon.correct svg');
    expect(icon).toBeInTheDocument();
  });

  it('should render X icon for incorrect answer', () => {
    const result = {
      correctAnswer: 'b',
      explanation: 'Test',
      wrongOptions: {}
    };

    const { container } = render(
      <AnswerPanel result={result} userAnswer="a" question={mockQuestion} />
    );

    const icon = container.querySelector('.answer-icon.incorrect svg');
    expect(icon).toBeInTheDocument();
  });
});
