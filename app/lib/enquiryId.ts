// =============================================================================
// app/lib/enquiryId.ts   —  ENTRY ID, READ FROM THE SHEET'S Entry_ID COLUMN
// =============================================================================
// One job only: read the row's Entry_ID cell and return that text.
//
//     ENQU-00048      ENQ-00001      ENQP-00003      ENQPP-00008
//
// Nothing else is ever looked at. No other column is searched, no value is
// guessed, nothing is prefixed, padded or generated. If the Entry_ID cell is
// empty the result is '' and the UI shows no id at all — it never falls back to
// Serial_No, a PO number, a gate pass or any other cell.
// =============================================================================

/** 'Entry_ID' / 'entry id' / 'EntryId' / 'Entry ID '  ->  'entryid' */
function entryIdKey(key: string): string {
  return String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Reads one sheet cell as clean text.
 *
 * Cells pasted from Excel often carry zero-width spaces, non-breaking spaces or
 * soft hyphens. Those are invisible, so such a cell looks empty and the stored
 * id would be lost.
 */
function readCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (typeof raw === "object") return "";
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

/**
 * The row's Entry_ID exactly as the sheet holds it. '' when that cell is empty.
 */
export function getEnquiryId(entry: Record<string, unknown>): string {
  if (!entry) return "";

  const direct = readCell(entry.Entry_ID);
  if (direct) return direct;

  // Tolerate a header that differs only by spacing/case ("Entry ID", "entry_id").
  for (const key of Object.keys(entry)) {
    if (entryIdKey(key) !== "entryid") continue;
    const value = readCell(entry[key]);
    if (value) return value;
  }

  return "";
}

/** True when the sheet itself holds an Entry_ID for this row. */
export function hasEnquiryId(entry: Record<string, unknown>): boolean {
  return getEnquiryId(entry) !== "";
}

/**
 * INTERNAL navigation key only — never rendered.
 *
 * The task detail view is handed the row object directly, so this exists only to
 * give React list keys a stable unique value for rows without an Entry_ID.
 */
export function getEntryRef(entry: Record<string, unknown>, rowIndex = 0): string {
  const id = getEnquiryId(entry);
  if (id) return id;

  const serial = readCell(entry?.Serial_No);
  if (serial && serial !== "0") return `SERIAL:${serial}`;

  return `ROW:${rowIndex}`;
}
