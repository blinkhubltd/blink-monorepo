/**
 * Money formatting.
 *
 * KES has no practical sub-unit in retail here, so prices render without
 * decimals — "KES 1,250", not "KES 1,250.00". Grouping is explicit rather than
 * relying on the device locale, because a device set to a locale that groups
 * with "." would render 1.250 and read as one and a quarter shillings.
 */
export function formatKES(amount: number): string {
  if (!Number.isFinite(amount)) return "KES —";
  const rounded = Math.round(amount);
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded < 0 ? "-" : ""}KES ${grouped}`;
}

/**
 * Distance for a vendor chip.
 *
 * Metres below a kilometre, one decimal above it. Anything more precise implies
 * an accuracy the coverage calculation does not have.
 */
export function formatDistance(metres: number | null): string | null {
  if (metres === null || !Number.isFinite(metres)) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
