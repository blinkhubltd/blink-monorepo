/**
 * The palette mirrored into JS — now shared with apps/rider, and defined in
 * packages/mobile-ui/src/theme/token-colors.ts. Re-exported here so this app's
 * existing imports keep working; new code can import from either path.
 */
export {
  TOKEN_COLORS,
  tokenColors,
  useTokenColors,
  type TokenColor,
} from "@repo/mobile-ui/theme/token-colors";
