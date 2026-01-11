/** @type {import('jest').Config} */
module.exports = {
  displayName: 'frontend',
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/frontend/**/*.test.js'],
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', { configFile: './babel.config.cjs' }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@testing-library))'
  ],
  moduleFileExtensions: ['js', 'jsx', 'json'],
  setupFilesAfterEnv: [
    '<rootDir>/tests/setupFrontend.cjs'
  ],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  testTimeout: 10000,
  verbose: true
};
