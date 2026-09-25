import pluginNext from "@next/eslint-plugin-next";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

import { config as baseConfig } from "./base.js";

/** Flat config for Next.js App Router apps. */
export const nextJsConfig = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@next/next": pluginNext,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      ...pluginReactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },
];

export default nextJsConfig;
