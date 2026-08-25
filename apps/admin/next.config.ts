import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Workspace packages ship raw TypeScript with no build step, so Next has to
   * compile them itself. Without this the build fails on the first `radix-ui`
   * import inside @repo/ui with a bare "Ecmascript file had an error" — which
   * names the import line and not the actual cause.
   *
   * @repo/backend is listed for the same reason: it is consumed as source.
   */
  transpilePackages: ["@repo/ui", "@repo/lib", "@repo/backend"],

  images: {
    remotePatterns: [
      /**
       * Wildcarded rather than naming one deployment.
       *
       * The ported config hardcoded `adventurous-hound-19.convex.cloud`, so
       * every product image 404s the moment the app points anywhere else —
       * including the isolated dev deployment this monorepo actually uses.
       */
      {
        protocol: "https",
        hostname: "**.convex.cloud",
        pathname: "/api/storage/**",
      },
      {
        protocol: "https",
        hostname: "**.convex.site",
        pathname: "/api/storage/**",
      },
      // Clerk-hosted avatars, shown in the account menu.
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default nextConfig;
