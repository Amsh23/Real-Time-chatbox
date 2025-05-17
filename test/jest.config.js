module.exports = {
    testEnvironment: 'node',
    testTimeout: 10000,
    setupFilesAfterEnv: ['<rootDir>/setup.js'],
    verbose: true,
    collectCoverage: true,
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/test/',
        '/scripts/'
    ],
    testPathIgnorePatterns: [
        '/node_modules/'
    ]
};
