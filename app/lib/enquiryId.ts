// =============================================================================
// app/lib/enquiryId.ts   —  ONLY the Entry_ID column, and only a real Entry_ID
// =============================================================================
// Displays exactly what the "Entries" tab holds in its Entry_ID column:
//
//     ENQP-00003    ENQPP-00008    ENQ-00001    ENQU-00048
//
// Shape: LETTERS + "-" + DIGITS   (e.g. ENQP-00003)
//
// Hard rules:
//   • Only the Entry_ID column is read. No other column is ever scanned.
//   • The value must match the canonical id shape. A challan number such as
//     "B-523/26-27", a party code such as "P0000133" or a document number such
//     as "P018263243" is NOT an enquiry id, so it is never rendered as one.
//   • No guessing, no prefixing, no padding, no generated fallback.
//   • An empty or non-conforming cell returns '' and the UI renders no id.
// =============================================================================

/** 'Entry_ID' / 'entry_id' / 'Entry ID' / 'EntryId'  ->  'entryid' */
export function entryIdKey(key: string): string {
  return String(key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Canonical enquiry id shape: 2-6 letters, a dash, then 3+ digits.
 *
 * Accepts  ENQ-00001  ENQP-00003  ENQPP-00008  ENQU-00048
 * Rejects  B-523/26-27   P0000133   P018263243   21   2026-0187
 */
const ENTRY_ID_SHAPE = /^[A-Z]{2,6}-\d{3,8}$/;

/** True when the text is a real enquiry id and not a document/party number. */
export function isEntryIdShape(value: string): boolean {
  return ENTRY_ID_SHAPE.test(String(value ?? "").trim().toUpperCase());
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
 * The column may be written as "Entry_ID", "Entry ID" or "EntryId"; all of them
 * normalise to the same key and no other column is ever consulted.
 *
 * Returns '' when the cell is empty OR when it does not hold a real enquiry id,
 * so a challan number or party code can never appear where the id belongs.
 */
export function getEnquiryId(entry: Record<string, unknown> | null | undefined): string {
  if (!entry) return "";

  for (const key of Object.keys(entry)) {
    if (entryIdKey(key) !== "entryid") continue;

    const raw = readCell(entry[key]);
    if (!raw) return "";

    // Present but holds something else (challan / party code / PO):
    // render nothing rather than the wrong value.
    if (!isEntryIdShape(raw)) return "";

    return raw.toUpperCase();
  }

  return "";
}

/** True when the sheet's Entry_ID cell holds a usable enquiry id. */
export function hasEnquiryId(entry: Record<string, unknown>): boolean {
  return getEnquiryId(entry) !== "";
}

/**
 * Raw Entry_ID cell contents, even when it is not a valid id.
 *
 * Used only by diagnostics ("this row's Entry_ID column holds X, which is not
 * an enquiry id"). Never render this as the entry id.
 */
export function getRawEntryIdCell(entry: Record<string, unknown> | null | undefined): string {
  if (!entry) return "";
  for (const key of Object.keys(entry)) {
    if (entryIdKey(key) !== "entryid") continue;
    return readCell(entry[key]);
  }
  return "";
}

/**
 * INTERNAL React list key only — never rendered and never sent to the backend.
 */
export function getEntryRef(entry: Record<string, unknown>, rowIndex = 0): string {
  const id = getEnquiryId(entry);
  if (id) return id;

  const serial = readCell(entry?.Serial_No);
  if (serial && serial !== "0") return `SERIAL:${serial}`;

  return `ROW:${rowIndex}`;
}
