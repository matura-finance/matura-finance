import { nextJsConfig } from "@matura/eslint-config/next";

/**
 * Secret-env boundary guard: secret env vars must never be read in the browser
 * app. Only `NEXT_PUBLIC_*` values are allowed to reach client code.
 */
export default [
  ...nextJsConfig,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^(DEPLOYER_PRIVATE_KEY|ISSUER_PRIVATE_KEY|DATABASE_URL|BSC_TESTNET_RPC_URL)$/]",
          message: "Secret env vars must never be read in the browser app.",
        },
      ],
    },
  },
];
