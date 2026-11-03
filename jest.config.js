module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  setupFiles: ["<rootDir>/tests/env.setup.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/jest.setupAfterEnv.ts"],
  testTimeout: 30000,
  maxWorkers: 1,
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tests/tsconfig.json",
      isolatedModules: true,
    },
  },
};
