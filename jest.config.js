module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chai)/)'
  ],
  testTimeout: 30000,
  setupFilesAfterEnv: ['./test/setup.js']
};
