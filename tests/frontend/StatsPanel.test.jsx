/**
 * Tests for StatsPanel Component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import StatsPanel from '../../src/progress/StatsPanel.jsx';

describe('StatsPanel', () => {
  const mockStats = {
    total: 100,
    answered: 50,
    correct: 40,
    failed: 10
  };

  it('should return null when no stats', () => {
    const { container } = render(<StatsPanel stats={null} />);

    expect(container.firstChild).toBeNull();
  });

  describe('Full mode (compact=false)', () => {
    it('should render full stats panel by default', () => {
      render(<StatsPanel stats={mockStats} />);

      expect(screen.getByText('Estadisticas Globales')).toBeInTheDocument();
    });

    it('should display total questions', () => {
      render(<StatsPanel stats={mockStats} />);

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Total preguntas')).toBeInTheDocument();
    });

    it('should display answered count', () => {
      render(<StatsPanel stats={mockStats} />);

      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('Respondidas')).toBeInTheDocument();
    });

    it('should display correct count with success style', () => {
      render(<StatsPanel stats={mockStats} />);

      expect(screen.getByText('40')).toBeInTheDocument();
      expect(screen.getByText('Correctas')).toBeInTheDocument();
    });

    it('should display failed count with error style', () => {
      render(<StatsPanel stats={mockStats} />);

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Falladas')).toBeInTheDocument();
    });

    it('should display progress percentage', () => {
      render(<StatsPanel stats={mockStats} />);

      expect(screen.getByText('Progreso general')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should display accuracy when answered > 0', () => {
      render(<StatsPanel stats={mockStats} />);

      expect(screen.getByText('Tasa de acierto')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
    });

    it('should not display accuracy when answered = 0', () => {
      const noAnswersStats = { total: 100, answered: 0, correct: 0, failed: 0 };
      render(<StatsPanel stats={noAnswersStats} />);

      expect(screen.queryByText('Tasa de acierto')).not.toBeInTheDocument();
    });

    it('should handle zero total questions', () => {
      const emptyStats = { total: 0, answered: 0, correct: 0, failed: 0 };
      render(<StatsPanel stats={emptyStats} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('Compact mode', () => {
    it('should render compact panel when compact=true', () => {
      const { container } = render(<StatsPanel stats={mockStats} compact={true} />);

      expect(container.querySelector('.stats-panel.compact')).toBeInTheDocument();
    });

    it('should not show header in compact mode', () => {
      render(<StatsPanel stats={mockStats} compact={true} />);

      expect(screen.queryByText('Estadisticas Globales')).not.toBeInTheDocument();
    });

    it('should display answered count in compact mode', () => {
      render(<StatsPanel stats={mockStats} compact={true} />);

      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('Respondidas')).toBeInTheDocument();
    });

    it('should display correct count in compact mode', () => {
      render(<StatsPanel stats={mockStats} compact={true} />);

      expect(screen.getByText('40')).toBeInTheDocument();
      expect(screen.getByText('Correctas')).toBeInTheDocument();
    });

    it('should display failed count in compact mode', () => {
      render(<StatsPanel stats={mockStats} compact={true} />);

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Falladas')).toBeInTheDocument();
    });

    it('should display pending count in compact mode', () => {
      render(<StatsPanel stats={mockStats} compact={true} />);

      expect(screen.getByText('Pendientes')).toBeInTheDocument();
      // 100 total - 50 answered = 50 pending
      expect(screen.getAllByText('50')).toHaveLength(2); // answered and pending
    });

    it('should show accuracy in compact mode when answered > 0', () => {
      render(<StatsPanel stats={mockStats} compact={true} />);

      expect(screen.getByText('80%')).toBeInTheDocument();
    });

    it('should not show accuracy in compact mode when answered = 0', () => {
      const noAnswersStats = { total: 100, answered: 0, correct: 0, failed: 0 };
      const { container } = render(<StatsPanel stats={noAnswersStats} compact={true} />);

      expect(container.querySelector('.stats-compact-progress')).not.toBeInTheDocument();
    });
  });

  describe('Progress bar variants', () => {
    it('should show success variant when accuracy >= 70%', () => {
      const highAccuracyStats = { total: 100, answered: 100, correct: 80, failed: 20 };
      const { container } = render(<StatsPanel stats={highAccuracyStats} />);

      expect(container.querySelector('.progress-bar-fill.success')).toBeInTheDocument();
    });

    it('should show warning variant when 50% <= accuracy < 70%', () => {
      const mediumAccuracyStats = { total: 100, answered: 100, correct: 60, failed: 40 };
      const { container } = render(<StatsPanel stats={mediumAccuracyStats} />);

      expect(container.querySelector('.progress-bar-fill.warning')).toBeInTheDocument();
    });

    it('should show error variant when accuracy < 50%', () => {
      const lowAccuracyStats = { total: 100, answered: 100, correct: 30, failed: 70 };
      const { container } = render(<StatsPanel stats={lowAccuracyStats} />);

      expect(container.querySelector('.progress-bar-fill.error')).toBeInTheDocument();
    });

    it('should show success variant at exactly 70%', () => {
      const exactStats = { total: 100, answered: 100, correct: 70, failed: 30 };
      const { container } = render(<StatsPanel stats={exactStats} />);

      expect(container.querySelector('.progress-bar-fill.success')).toBeInTheDocument();
    });

    it('should show warning variant at exactly 50%', () => {
      const exactStats = { total: 100, answered: 100, correct: 50, failed: 50 };
      const { container } = render(<StatsPanel stats={exactStats} />);

      expect(container.querySelector('.progress-bar-fill.warning')).toBeInTheDocument();
    });
  });

  describe('SVG icons', () => {
    it('should render all stat icons in full mode', () => {
      const { container } = render(<StatsPanel stats={mockStats} />);

      const icons = container.querySelectorAll('.stat-icon svg');
      expect(icons).toHaveLength(4);
    });
  });
});
