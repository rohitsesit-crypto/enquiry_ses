// =============================================================================
// app/lib/enquiryId.ts   —  ONLY the Entry_ID column
// =============================================================================
// Displays exactly what the "Entries" tab holds in its Entry_ID column, and
// nothing else:
//
//     ENQP-00003   ENQPP-00008   ENQ-00001   ENQU-00048
//
// Hard rules:
//   • Only the Entry_ID column is read. No other column is ever scanned, so a
//     PO number, Q.No, challan, gate pass, LR number, invoice number, serial
//     number, mobile, GST or office value can never be shown as an enquiry id.
//   • No guessing, no prefixing, no padding, no generated fallback.
//   • An empty cell returns '' and the UI renders no id at all.
// =============================================================================

/** 'Entry_ID' / 'entry_id' / 'Entry ID' / 'EntryId'  ->  'entryid' */
export function entryIdKey(key: string): string {
  return String(key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Reads one sheet cell as clean text.
 *
 * Cells pasted from Excel often carry zero-width spaces, non-breaking spaces or
 * soft hyphens. Those are invisible, so such a cell looks empty and the stored
 * id would be lost — they are stripped, nothing else is changed.
 */
function readCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") return "";
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

/**
 * The Entry_ID cell for one row.
 *
 * Looks up the Entry_ID column only. The column may be written as "Entry_ID",
 * "Entry ID" or "EntryId", which all normalise to the same key; no other
 * column is ever consulted.
 *
 * Returns '' when the cell is genuinely empty.
 */
export function getEnquiryId(entry: Record<string, unknown> | null | undefined): string {
  if (!entry) return "";

  for (const key of Object.keys(entry)) {
    if (entryIdKey(key) !== "entryid") continue;
    return readCell(entry[key]);
  }

  return "";
}

/** True when the sheet's Entry_ID cell holds a value for this row. */
export function hasEnquiryId(entry: Record<string, unknown>): boolean {
  return getEnquiryId(entry) !== "";
}

/**
 * INTERNAL React list key only — never rendered.
 *
 * Rows without an Entry_ID still need a stable unique key. This value must
 * never be sent to the backend and must never be displayed.
 */
export function getEntryRef(entry: Record<string, unknown>, rowIndex = 0): string {
  const id = getEnquiryId(entry);
  if (id) return id;

  const serial = readCell(entry?.Serial_No);
  if (serial && serial !== "0") return `SERIAL:${serial}`;

  return `ROW:${rowIndex}`;
}
