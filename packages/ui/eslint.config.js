import { config } from "@matura/eslint-config/react-internal";

/**
 * Shared UI primitives lint config.
 *
 * `@matura/ui` must stay wallet-free and framework-light so the marketing site
 * (`apps/landing`) can import primitives without pulling chain/wallet tooling
 * into its bundle. Enforce that invariant HERE — at the layer that must hold it —
 * rather than relying on the downstream landing lint or the bundle-leak grep.
 */
export default [
  ...config,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "wagmi", message: "@matura/ui must stay wallet-free" },
            { name: "viem", message: "@matura/ui must stay wallet-free" },
            { name: "@matura/chain", message: "@matura/ui must stay wallet-free" },
            { name: "@tanstack/react-query", message: "@matura/ui must stay query-free" },
          ],
          patterns: [
            {
              group: ["@matura/chain/*", "viem", "viem/*", "wagmi", "wagmi/*", "@tanstack/*"],
              message:
                "@matura/ui must stay wallet-free: no chain/wallet/query tooling, including subpath imports",
            },
          ],
        },
      ],
    },
  },
];
