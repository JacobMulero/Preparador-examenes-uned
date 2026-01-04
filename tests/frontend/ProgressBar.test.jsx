/**
 * Tests for ProgressBar Component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ProgressBar from '../../src/progress/ProgressBar.jsx';

describe('ProgressBar', () => {
  it('should render with default props', () => {
    const { container } = render(<ProgressBar value={50} />);

    const progressBar = container.querySelector('.progress-bar');
    expect(progressBar).toBeInTheDocument();
  });

  it('should display correct width for value', () => {
    const { container } = render(<ProgressBar value={75} />);

    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveStyle({ width: '75%' });
  });

  it('should normalize value above 100', () => {
    const { container } = render(<ProgressBar value={150} />);

    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('should normalize value below 0', () => {
    const { container } = render(<ProgressBar value={-50} />);

    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('should handle null value', () => {
    const { container } = render(<ProgressBar value={null} />);

    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('should handle undefined value', () => {
    const { container } = render(<ProgressBar />);

    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('should show label when showLabel is true', () => {
    render(<ProgressBar value={50} showLabel={true} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should not show label by default', () => {
    const { container } = render(<ProgressBar value={50} />);

    const label = container.querySelector('.progress-bar-label');
    expect(label).not.toBeInTheDocument();
  });

  it('should apply variant class', () => {
    const { container } = render(<ProgressBar value={50} variant="success" />);

    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveClass('success');
  });

  it('should apply size class', () => {
    const { container } = render(<ProgressBar value={50} size="lg" />);

    const progressContainer = container.querySelector('.progress-bar-container');
    expect(progressContainer).toHaveClass('lg');
  });

  it('should format label value correctly', () => {
    render(<ProgressBar value={33.333} showLabel={true} />);

    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('should apply default variant', () => {
    const { container } = render(<ProgressBar value={50} />);

    const bar = container.querySelector('.progress-bar');
    expect(bar).toHaveClass('default');
  });

  it('should apply warning variant', () => {
    const { container } = render(<ProgressBar value={50} variant="warning" />);

    const bar = container.querySelector('.progress-bar');
    expect(bar).toHaveClass('warning');
  });

  it('should apply error variant', () => {
    const { container } = render(<ProgressBar value={50} variant="error" />);

    const bar = container.querySelector('.progress-bar');
    expect(bar).toHaveClass('error');
  });
});
