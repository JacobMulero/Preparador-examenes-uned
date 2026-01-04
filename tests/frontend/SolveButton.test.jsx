/**
 * Tests for SolveButton Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SolveButton from '../../src/solving/SolveButton.jsx';

describe('SolveButton', () => {
  it('should render with default state', () => {
    render(<SolveButton onClick={() => {}} />);

    expect(screen.getByText('Comprobar respuesta')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<SolveButton onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<SolveButton onClick={() => {}} disabled={true} />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should be disabled when loading', () => {
    render(<SolveButton onClick={() => {}} loading={true} />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should show loading state', () => {
    render(<SolveButton onClick={() => {}} loading={true} />);

    expect(screen.getByText('Consultando a Claude...')).toBeInTheDocument();
  });

  it('should show spinner when loading', () => {
    const { container } = render(<SolveButton onClick={() => {}} loading={true} />);

    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('should have loading class when loading', () => {
    const { container } = render(<SolveButton onClick={() => {}} loading={true} />);

    expect(container.querySelector('.solve-button')).toHaveClass('loading');
  });

  it('should not call onClick when disabled', () => {
    const handleClick = jest.fn();
    render(<SolveButton onClick={handleClick} disabled={true} />);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should not call onClick when loading', () => {
    const handleClick = jest.fn();
    render(<SolveButton onClick={handleClick} loading={true} />);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should render SVG icon when not loading', () => {
    const { container } = render(<SolveButton onClick={() => {}} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should not render SVG icon when loading', () => {
    const { container } = render(<SolveButton onClick={() => {}} loading={true} />);

    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('should have proper button classes', () => {
    const { container } = render(<SolveButton onClick={() => {}} />);

    const button = container.querySelector('.solve-button');
    expect(button).toHaveClass('btn');
    expect(button).toHaveClass('btn-primary');
    expect(button).toHaveClass('btn-lg');
  });
});
