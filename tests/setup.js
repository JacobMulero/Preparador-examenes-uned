/**
 * Jest Setup File
 * Runs before all tests
 */

// Mock console.log/error in tests to reduce noise
global.console = {
  ...console,
  log: () => {},
  error: () => {},
  warn: () => {},
  info: () => {}
};
