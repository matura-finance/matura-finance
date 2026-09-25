import config from "@matura/eslint-config/base";

/**
 * API ESLint config: re-exports the shared type-aware base, then bans raw-SQL
 * escape hatches (`$queryRawUnsafe`/`$executeRawUnsafe`) via `no-restricted-syntax`.
 *
 * `test/**` is ignored here: e2e specs live outside `tsconfig.json`'s program
 * (it excludes `test`), so type-aware linting can't resolve them, and supertest's
 * `getHttpServer(): any` would trip `no-unsafe-*`. Unit specs under `src/` remain
 * fully linted.
 */
export default [
  {
    ignores: ["test/**"],
  },
  ...config,
  {
    files: ["src/**/*.ts"],
    rules: {
      // NestJS modules are empty classes decorated with @Module — idiomatic and required.
      "@typescript-eslint/no-extraneous-class": "off",
      // The exception filter maps Nest's numeric HttpStatus enum; comparisons are intentional.
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='$queryRawUnsafe']",
          message:
            "$queryRawUnsafe is banned — use parameterized Prisma queries to prevent SQL injection.",
        },
        {
          selector: "CallExpression[callee.property.name='$executeRawUnsafe']",
          message:
            "$executeRawUnsafe is banned — use parameterized Prisma queries to prevent SQL injection.",
        },
      ],
    },
  },
];
