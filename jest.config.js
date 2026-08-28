module.exports = {
  projects: [
        // Integration tests in tests/ folder - run serially
        {
      displayName: 'DPI Integration Tests',
      testMatch: [
        '<rootDir>/tests/!(add|build)/**/*.test.js',
        '<rootDir>/tests/!(add|build)/**/*.spec.js',
      ],
      testTimeout: 40000,
      maxWorkers: 1, // Force serial execution for integration tests
      modulePathIgnorePatterns: [
        '<rootDir>/tests/incidents-mgmt/build',
        '<rootDir>/tests/bookshop-app/app/router',
        '<rootDir>/tests/incidents-mgmt/app/router',
        '<rootDir>/tests/add',
        '<rootDir>/tests/build',
            ],
        },
        // CDS ADD tests
        {
      displayName: 'CDS ADD',
      testMatch: ['<rootDir>/tests/add/*.test.js', '<rootDir>/tests/add/**/*.spec.js'
            ],
      testTimeout: 60000,
      maxWorkers: 1,
      testEnvironment: 'node',
      modulePathIgnorePatterns: [
        '<rootDir>/tests/incidents-mgmt/build',
        '<rootDir>/tests/bookshop-app/app/router',
        '<rootDir>/tests/incidents-mgmt/app/router',
        '<rootDir>/tests/incidents-mgmt/mtx',
      ],
        },
        // CDS BUILD tests - increased timeout, no module resets (preserves cds.build)
        {
      displayName: 'CDS BUILD',
      testMatch: ['<rootDir>/tests/build/*.test.js'],
      testTimeout: 100000,
      maxWorkers: 5,
      testEnvironment: 'node',
      modulePathIgnorePatterns: [
        '<rootDir>/tests/incidents-mgmt/build',
        '<rootDir>/tests/bookshop-app/app/router',
        '<rootDir>/tests/incidents-mgmt/app/router',
        '<rootDir>/tests/incidents-mgmt/mtx',
      ],
    }
  ],
};