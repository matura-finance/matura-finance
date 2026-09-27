import config from "@matura/eslint-config/base";

/**
 * ESLint for the cross-stack e2e harness — the shared type-aware base ("strictTypeChecked", which
 * is what actually enforces CLAUDE.md's no-`any` rule). `src/**` is the only TS; the base's
 * `projectService` resolves it against this package's tsconfig. `console` is intentionally allowed:
 * this is a CLI orchestrator whose stdout IS its UX.
 */
export default [...config];
