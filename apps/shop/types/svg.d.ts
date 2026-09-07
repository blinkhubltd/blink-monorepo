/**
 * `.svg` files are React components here, not image assets.
 *
 * metro.config.js moves `svg` from `assetExts` to `sourceExts` and runs it
 * through react-native-svg-transformer, so an import yields a component taking
 * `SvgProps`. TypeScript knows nothing about that on its own, hence this file.
 *
 * ── Why this lives in types/ and not expo-env.d.ts ────────────────────────
 *
 * `expo-env.d.ts` is the obvious-looking home and is the wrong one: Expo
 * generates that file, `apps/shop/.gitignore` now ignores it, and a hand-added
 * declaration there is silently overwritten on the next `expo start`. Anything
 * matching `**\/*.ts` is already in tsconfig's `include`, so `types/` needs no
 * configuration.
 */
declare module "*.svg" {
  import type * as React from "react";
  import type { SvgProps } from "react-native-svg";

  const content: React.FC<SvgProps>;
  export default content;
}
