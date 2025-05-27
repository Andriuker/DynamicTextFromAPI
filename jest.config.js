export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
  transform: {
    '^.+\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  moduleNameMapper: {
    '^@elgato/streamdeck$': '<rootDir>/src/tests/__mocks__/@elgato/streamdeck.ts',
    '^axios$': '<rootDir>/src/tests/__mocks__/axios.ts',
    '^lodash$': '<rootDir>/node_modules/lodash/lodash.js',
    '^xmldom$': '<rootDir>/node_modules/xmldom/lib/dom-parser.js',
    '^xpath$': '<rootDir>/node_modules/xpath/xpath.js'
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupTests.ts']
};
