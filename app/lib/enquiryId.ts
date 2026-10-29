// =============================================================================
// app/lib/enquiryId.ts   —  ENQUIRY ID RESOLUTION (NEW FILE)
// =============================================================================
// WHY THIS FILE EXISTS
//
// The user dashboard rendered:   {Entry_ID}  ·  {Company_Name}
// When the Entries sheet had an empty Entry_ID cell (legacy rows, manual rows,
// or a row appended before the ID was written) the card showed a dangling "·"
// and there was NO way to tell which enquiry the task belonged to.
//
// Worse, the Task Detail modal looks an entry up with
//      entries.find(e => String(e.Entry_ID) === String(entryId))
// so a blank Entry_ID made the detail modal open an empty panel.
//
// The ID is now resolved in three tiers, the same order the backend uses:
//
//   1. Entry_ID as stored in the sheet            (source: "sheet")
//   2. Serial_No formatted as ENQU-00024          (source: "serial")
//   3. Row position formatted as ENQU-TMP003      (source: "row")
//
// Tier 2/3 results are flagged `derived` so the UI can mark them and nobody
// mistakes a recovered ID for a value that exists in the spreadsheet.
// =============================================================================

/** Serial -> ENQU-00042. Padded to five digits, like submitNewEntry(). */
export function formatEnquiryId(serial: number): string {
  const value = Number.isFinite(serial) ? Math.max(0, Math.trunc(serial)) : 0;
  return "ENQU-" + String(value).padStart(5, "0");
}

export interface ResolvedEnquiryId {
  /** Always non-empty: this is what the UI prints. */
  id: string;
  /** true => the sheet cell was blank and the ID was recovered. */
  derived: boolean;
  source: "sheet" | "serial" | "row";
  serial: number | null;
}

/**
 * Reads a usable enquiry ID out of one Entries row.
 *
 * @param entry     raw row coming from the sheet
 * @param rowIndex  0 based position, only used by the last fallback
 */
export function resolveEnquiryId(entry: Record<string, unknown>, rowIndex: number): ResolvedEnquiryId {
  const stored = String(entry?.Entry_ID ?? "").trim();
  if (stored) {
    const digits = Number(stored.replace(/\D+/g, ""));
    return {
      id: stored,
      derived: false,
      source: "sheet",
      serial: Number.isFinite(digits) && digits > 0 ? digits : null,
    };
  }

  const serial = Number(entry?.Serial_No);
  if (Number.isFinite(serial) && serial > 0) {
    return { id: formatEnquiryId(serial), derived: true, source: "serial", serial };
  }

  return {
    id: "ENQU-TMP" + String(rowIndex + 1).padStart(3, "0"),
    derived: true,
    source: "row",
    serial: null,
  };
}

/** Convenience wrapper for the places that only need the printed string. */
export function getEnquiryId(entry: Record<string, unknown>, rowIndex = 0): string {
  return resolveEnquiryId(entry, rowIndex).id;
}

/**
 * Backfills Entry_ID on every row so the rest of the app keeps working with
 * its existing `String(entry.Entry_ID)` keys and lookups.
 *
 * Rows are filtered BEFORE backfilling: otherwise a completely empty sheet row
 * would receive an ID and survive the empty-row filter in normalizeEntries().
 *
 * @param rows     rows that already passed the empty-row filter
 * @param offset   first row's position, so ENQU-TMP numbering matches the sheet
 */
export function withResolvedEntryIds(
  rows: Record<string, unknown>[],
  offset = 0
): Record<string, unknown>[] {
  return rows.map((entry, index) => {
    const resolved = resolveEnquiryId(entry, offset + index);
    if (!resolved.derived) return entry;

    return {
      ...entry,
      Entry_ID: resolved.id,
      // Kept in the payload so a card can show the "auto" marker without
      // re-running the resolver.
      Entry_ID_Derived: true,
      Entry_ID_Source: resolved.source,
    };
  });
}

/** Highest serial already used, so a new enquiry never collides. */
export function nextEntrySerial(entries: Record<string, unknown>[]): number {
  let max = 0;
  entries.forEach((entry, index) => {
    const resolved = resolveEnquiryId(entry, index);
    const candidate = resolved.serial ?? index + 1;
    if (candidate > max) max = candidate;
  });
  return max + 1;
}
