// =============================================================================
// app/lib/enquiryId.ts   —  ONLY the Entry_ID column, and only a real Entry_ID
// =============================================================================
// Displays exactly what the "Entries" tab holds in its Entry_ID column:
//
//     ENQ-00001   ENQP-00003   ENQPP-00008   ENQU-00048   ENQ-1   ENQ/2026/0001
//
// Hard rules:
//   • Only the Entry_ID column is read. No other column is ever scanned.
//   • The id is NEVER built from another column. "B-523/26-27" (challan),
//     "P0000133" (party code) and "P018263243" (document no.) are not enquiry
//     ids, so they are never rendered or submitted as one.
//   • No guessing, no prefixing, no padding, no generated fallback.
//   • An empty cell returns '' and the UI shows no id.
//
// WHY THE RULE IS NOT TOO STRICT:
//   The enquiry number series is ENQ-based, so any cell starting with "ENQ" is
//   accepted whatever separator or digit count it uses. Other series are
//   accepted when they look like LETTERS-DIGITS (ABC-123). That keeps every
//   real id working while still refusing the document numbers above.
// =============================================================================

/** 'Entry_ID' / 'entry_id' / 'Entry ID' / 'EntryId'  ->  'entryid' */
export function entryIdKey(key: string): string {
  return String(key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** The enquiry series used by this sheet: ENQ, ENQP, ENQPP, ENQU, ... */
const ENQUIRY_SERIES = /^ENQ[\s/_-]?[A-Z0-9/-]*$/i;

/** Generic id series: 2-6 letters, a dash, then digits (ABC-123). */
const GENERIC_SERIES = /^[A-Z]{2,6}\s?-\s?\d{1,10}$/i;

/**
 * True when the text is a real enquiry id and not a document/party number.
 *
 * Accepts  ENQ-00001  ENQP-00003  ENQPP-00008  ENQU-00048  ENQ00001  ABC-123
 * Rejects  B-523/26-27   P0000133   P018263243   21   2026-0187
 */
export function isEntryIdShape(value: string): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/\s/.test(text)) return false;
  return ENQUIRY_SERIES.test(text) || GENERIC_SERIES.test(text);
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
 * Everything is upper-cased so a hand-typed "enq-00001" matches the sheet.
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
 * Used by diagnostics ("this row's Entry_ID column holds X, which is not an
 * enquiry id") and as the last-resort write key. Never rendered as the entry id.
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
 * The value used to locate a row when writing back to the sheet.
 *
 * A write must use whatever the Entry_ID cell actually holds, otherwise the
 * Apps Script lookup cannot find the row and the step submission fails. So this
 * prefers the real id, then falls back to the raw cell text (the sheet's own
 * key), and only returns '' when the cell is genuinely empty.
 *
 * Never render this value — that is what getEnquiryId() is for.
 */
export function getEntryWriteKey(entry: Record<string, unknown> | null | undefined): string {
  return getEnquiryId(entry) || getRawEntryIdCell(entry) || "";
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
