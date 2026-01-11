/** @type {import('jest').Config} */
export default {
  projects: [
    // Backend tests
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: ['**/tests/backend/**/*.test.js'],
      transform: {},
      moduleFileExtensions: ['js', 'jsx', 'json'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      testTimeout: 30000,
    },
    // Frontend tests
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/frontend/**/*.test.{js,jsx}'],
      transform: {
        '^.+\\.(js|jsx)$': ['babel-jest', { configFile: './babel.config.cjs' }]
      },
      transformIgnorePatterns: [
        'node_modules/(?!(.*\\.mjs$|@testing-library|react-markdown|remark-.*|unified|bail|is-plain-obj|trough|vfile|unist-.*|mdast-util-.*|micromark.*|decode-named-character-reference|character-entities|property-information|hast-util-.*|space-separated-tokens|comma-separated-tokens|html-url-attributes|devlop|ccount|escape-string-regexp|markdown-table))'
      ],
      moduleFileExtensions: ['js', 'jsx', 'json'],
      setupFilesAfterEnv: [
        '<rootDir>/tests/setupFrontend.cjs'
      ],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      },
      testTimeout: 10000,
    }
  ],
  collectCoverageFrom: [
    'server/**/*.js',
    'src/**/*.{js,jsx}',
    '!server/index.js',
    '!src/main.jsx',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  verbose: true,
};
