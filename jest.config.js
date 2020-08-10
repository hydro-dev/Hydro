module.exports = {
    globals: {
        'ts-jest': {
            diagnostics: {
                warnOnly: true,
            },
        },
    },
    preset: 'ts-jest',
    testEnvironment: 'node',
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
