import type { Config } from "jest";

const config: Config = {
  rootDir: "src",
  moduleFileExtensions: ["js", "json", "ts"],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  testEnvironment: "node",
  setupFiles: ["<rootDir>/../test/jest-setup.ts"],
  collectCoverageFrom: ["**/*.ts", "!**/*.spec.ts"],
  coverageDirectory: "../coverage",
  coveragePathIgnorePatterns: ["/node_modules/", "/generated/"],
};

export default config;
