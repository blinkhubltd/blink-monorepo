/**
 * Up to two letters, from a name if there is one and an email if not.
 *
 * The email fallback takes the part before the `@`: an initial of "c" for
 * charles@… is at least their initial, where the whole address would not fit
 * and "?" says nothing.
 *
 * Shared between Profile's header and Settings' identity card, which both
 * need the same avatar fallback for the same signed-in person.
 */
export function initialsOf(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0]?.trim() || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
