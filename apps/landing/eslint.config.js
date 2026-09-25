import { nextJsConfig } from "@matura/eslint-config/next";

/**
 * Landing app lint config.
 *
 * The marketing site must stay wallet-free and secret-free: it is statically
 * optimizable, depends only on @matura/ui, and must never reach for chain
 * tooling or server secrets. These rules make those invariants enforceable.
 */
export default [
  ...nextJsConfig,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "wagmi", message: "landing must stay wallet-free" },
            { name: "viem", message: "landing must stay wallet-free" },
            { name: "@matura/chain", message: "landing must stay wallet-free" },
            {
              name: "@tanstack/react-query",
              message: "landing is statically optimizable and needs no query client",
            },
          ],
          patterns: [
            {
              group: ["@matura/chain/*", "viem", "viem/*", "wagmi", "wagmi/*", "@tanstack/*"],
              message:
                "landing must stay wallet-free: no chain/wallet/query tooling, including subpath imports",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='DEPLOYER_PRIVATE_KEY']",
          message: "Server secrets must never be referenced from the landing site.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='ISSUER_PRIVATE_KEY']",
          message: "Server secrets must never be referenced from the landing site.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='DATABASE_URL']",
          message: "Server secrets must never be referenced from the landing site.",
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='BSC_TESTNET_RPC_URL']",
          message: "Server secrets must never be referenced from the landing site.",
        },
      ],
    },
  },
];
