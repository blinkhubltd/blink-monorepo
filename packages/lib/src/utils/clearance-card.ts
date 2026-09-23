/**
 * The clearance entry card on the shop's home screen — the doorway into
 * `/clearance`, not a clearance product itself.
 *
 * Its image, title and detail sentence are `platform_settings` rows, editable
 * from the admin dashboard's Settings page. All three are optional: with no
 * image, the card falls back to the plain bordered/icon treatment it always
 * had, using these same defaults for its text.
 *
 * The three keys are centralised here, rather than as string literals in the
 * admin settings page, the admin image-upload card and the shop screen
 * separately, because those three places have to agree on exactly the same
 * strings — a typo in any one of them silently decouples that place from the
 * setting it means to read or write.
 */
export const CLEARANCE_CARD_IMAGE_KEY = "clearance_card_image";
export const CLEARANCE_CARD_TITLE_KEY = "clearance_card_title";
export const CLEARANCE_CARD_DETAIL_KEY = "clearance_card_detail";

export const CLEARANCE_CARD_DEFAULT_TITLE = "Clearance deals";
export const CLEARANCE_CARD_DEFAULT_DETAIL =
  "Short-dated stock at a discount";

/** What the card shows, once blank settings have fallen back to the defaults. */
export function clearanceCardTitle(stored: string | null | undefined): string {
  const trimmed = (stored ?? "").trim();
  return trimmed || CLEARANCE_CARD_DEFAULT_TITLE;
}

export function clearanceCardDetail(stored: string | null | undefined): string {
  const trimmed = (stored ?? "").trim();
  return trimmed || CLEARANCE_CARD_DEFAULT_DETAIL;
}
