module.exports = {
    preset: '@shelf/jest-mongodb',
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    collectCoverage: true,
    coverageDirectory: '<rootDir>/.coverage',
    coverageProvider: 'v8',
    coverageReporters: ['text', 'lcov'],
    coveragePathIgnorePatterns: [
        'node_modules/',
        'tests/',
        'dist/',
    ],
};
