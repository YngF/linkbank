/**
 * A bookmark whose URL is literally "note" or "memo" (case-insensitive) is a
 * note card, not a link: clicking it shows its notes instead of navigating, and
 * it's exempt from link-rot checking. Shared by client and server so the rule
 * lives in exactly one place.
 */
export function isNoteUrl(url: string | null | undefined): boolean {
  return /^(note|memo)$/i.test((url ?? '').trim());
}
