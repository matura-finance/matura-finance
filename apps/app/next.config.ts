import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @matura/chain ships raw TypeScript (transpile REQUIRED); @matura/ui is a JIT
  // Tailwind package; @matura/shared is built but transpiling is harmless.
  transpilePackages: ["@matura/ui", "@matura/chain", "@matura/shared"],
};

export default nextConfig;
