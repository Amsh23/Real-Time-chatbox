module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chai|@socket.io)/)'
  ],
  moduleNameMapper: {
    '^chai$': require.resolve('chai')
  },
  testTimeout: 30000,
  setupFilesAfterEnv: [
    './test/setup.js'
  ],
  globals: {
    'babel-jest': {
      diagnostics: false
    }
  }
};
