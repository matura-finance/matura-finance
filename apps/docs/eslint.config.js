import { nextJsConfig } from "@matura/eslint-config/next";

/**
 * Docs app lint config.
 *
 * The documentation site must stay wallet-free and secret-free: it is a static, read-only site that
 * depends only on @matura/ui + Fumadocs, and must never reach for chain tooling or server secrets.
 * Contract addresses are generated from the manifest at build time (Node `fs`, never bundled), so
 * the app code never imports @matura/chain. These rules make those invariants enforceable.
 */
export default [
  {
    ignores: [".next/**", ".source/**", "content/docs/reference/**"],
  },
  ...nextJsConfig,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "wagmi", message: "docs must stay wallet-free" },
            { name: "viem", message: "docs must stay wallet-free" },
            { name: "@matura/chain", message: "docs must stay wallet-free" },
            {
              name: "@tanstack/react-query",
              message: "docs is statically optimizable and needs no query client",
            },
          ],
          patterns: [
            {
              group: ["@matura/chain/*", "viem", "viem/*", "wagmi", "wagmi/*", "@tanstack/*"],
              message:
                "docs must stay wallet-free: no chain/wallet/query tooling, including subpath imports",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='DEPLOYER_PRIVATE_KEY']",
          message: "Server secrets must never be referenced from the docs site.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='ISSUER_PRIVATE_KEY']",
          message: "Server secrets must never be referenced from the docs site.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='DATABASE_URL']",
          message: "Server secrets must never be referenced from the docs site.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='BSC_TESTNET_RPC_URL']",
          message: "Server secrets must never be referenced from the docs site.",
        },
      ],
    },
  },
];
