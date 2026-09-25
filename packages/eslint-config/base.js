import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import turbo from "eslint-plugin-turbo";

/**
 * Shared flat config. Type-aware ("strictTypeChecked") so implicit/leaked `any`
 * is caught, not just the `any` keyword — this is what enforces the no-`any` rule.
 * Consumers: `import { config } from "@matura/eslint-config/base"`.
 */
export const config = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/*.tsbuildinfo",
      "**/next-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: { turbo },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      "turbo/no-undeclared-env-vars": "error",
      // Stylistic only — allow both `type` and `interface` for object shapes.
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  },
  {
    // Config / build-tool files aren't part of a tsconfig program — disable
    // type-aware rules for them so they don't error on "not found in project".
    files: ["**/*.config.{js,ts,mjs,cjs}", "**/*.cjs", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);

export default config;
