/**
 * Jest Setup File for Frontend Tests
 */
require('@testing-library/jest-dom');

// Mock react-markdown to avoid ESM issues in tests
jest.mock('react-markdown', () => {
  const React = require('react');
  return function MockReactMarkdown({ children }) {
    return React.createElement('div', { 'data-testid': 'markdown' }, children);
  };
});

jest.mock('remark-gfm', () => () => {});
