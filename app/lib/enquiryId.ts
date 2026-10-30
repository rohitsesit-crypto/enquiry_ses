// =============================================================================
// app/lib/enquiryId.ts   —  ENQUIRY ID, READ STRAIGHT FROM THE SHEET
// =============================================================================
// The Entries sheet is the single source of truth. Whatever ID the sheet holds
// is what the UI prints, in whatever format it already uses:
//
//     SES/26/0187      A-2291      2026-0187      Q-2026-118      ENQU-00042
//
// No prefix, no padding, no reformatting. The sheet carries several ID styles,
// so the app must never invent one of its own.
//
// WHICH COLUMN HOLDS IT
// Code.gs writes "Entry_ID", but tabs renamed by hand often use "Enquiry_ID",
// "Enquiry No", "ID" and similar. The resolver checks the known names first and
// then any header that looks like an enquiry id, so a renamed column is never
// silently ignored (that is what made only "ENQU-..." rows appear before).
//
// WHEN THE CELL IS EMPTY
// The row's own Serial_No is shown as a plain number, so a card is never
// anonymous — and never carries a fabricated "ENQU-..." style id.
// =============================================================================

/** Header names seen in this workbook, highest priority first. */
const ID_COLUMNS = [
  "Entry_ID",
  "Enquiry_ID",
  "EnquiryId",
  "Enquiry ID",
  "Enquiry_No",
  "EnquiryNo",
  "Enquiry Number",
  "Entry ID",
  "EntryId",
];

/** "Entry_ID" -> "entryid", so spacing / case / punctuation never matter. */
function normalizeKey(key: string): string {
  return String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const KNOWN_ID_KEYS = new Set(ID_COLUMNS.map(normalizeKey));

/**
 * Columns that end in "id"/"no" but are NOT the enquiry id, so the loose
 * matcher below cannot pick them up by accident.
 */
const NOT_ID_KEYS = new Set([
  "emailid",
  "mobile",
  "mobileno",
  "mobilenumber",
  "gstno",
  "gstin",
  "pono",
  "ponumber",
  "qno",
  "challanno",
  "challannumber",
  "gatpassno",
  "gatepassno",
  "lrno",
  "invoiceno",
  "invoicenumber",
  "serialno",
  "sno",
  "srno",
]);

function looksLikeIdColumn(key: string): boolean {
  const normalized = normalizeKey(key);
  if (!normalized || NOT_ID_KEYS.has(normalized)) return false;
  if (KNOWN_ID_KEYS.has(normalized)) return true;
  // entryid / enquiryid / enquiryno / enquirycode / enqid / refno / id / ref
  return /^(entry|enquiry|inquiry|enq|ref)?(id|no|number|code|ref|reference)$/.test(normalized);
}

/**
 * The enquiry id as stored in the sheet, trimmed. '' when no id column carries a
 * value.
 */
export function getEnquiryId(entry: Record<string, unknown>): string {
  if (!entry) return "";

  // 1. the headers this workbook actually uses, in order
  for (const column of ID_COLUMNS) {
    const value = String(entry[column] ?? "").trim();
    if (value) return value;
  }

  // 2. any other header that looks like an id column (renamed tabs)
  for (const key of Object.keys(entry)) {
    if (!looksLikeIdColumn(key)) continue;
    const value = String(entry[key] ?? "").trim();
    if (value) return value;
  }

  return "";
}

/** True when the sheet itself holds an id for this row. */
export function hasEnquiryId(entry: Record<string, unknown>): boolean {
  return getEnquiryId(entry) !== "";
}

/**
 * Plain serial number, used only when the id column is blank.
 * Printed as-is ("24"), never wrapped in a prefix.
 */
export function getEnquirySerialLabel(entry: Record<string, unknown>): string {
  const serial = String(entry?.Serial_No ?? "").trim();
  if (!serial || serial === "0") return "";
  return serial;
}

/**
 * INTERNAL navigation key only — never rendered.
 *
 * The Task Detail modal looks its row up by this key, so rows whose id column is
 * blank still open instead of showing "Entry not found".
 */
export function getEntryRef(entry: Record<string, unknown>, rowIndex = 0): string {
  const id = getEnquiryId(entry);
  if (id) return id;

  const serial = String(entry?.Serial_No ?? "").trim();
  if (serial && serial !== "0") return `SERIAL:${serial}`;

  return `ROW:${rowIndex}`;
}
