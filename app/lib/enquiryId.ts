// =============================================================================
// app/lib/enquiryId.ts   —  ENQUIRY ID, READ STRAIGHT FROM THE SHEET
// =============================================================================
// The Entries sheet is the single source of truth. Whatever is written in the
// "Entry_ID" column is exactly what the UI prints, in whatever format the sheet
// already uses:
//
//     SES/26/0187      A-2291      2026-0187      ENQU-00042      ...
//
// No prefix, no padding, no reformatting, no serial fallback. The sheet holds
// several ID styles, so the app must never invent one of its own.
//
// When the column is empty the UI shows nothing at all (rather than a made-up
// value), and navigation falls back to the row's Serial_No through getEntryRef()
// so the card can still be opened.
// =============================================================================

/**
 * Column names this app has seen for the enquiry id, in priority order.
 * Code.gs writes "Entry_ID"; sheets renamed by hand often use "Enquiry_ID".
 * Reading all of them keeps working whichever header the tab actually has.
 */
const ID_COLUMNS = ["Entry_ID", "EntryId", "Entry ID", "Enquiry_ID", "EnquiryId", "Enquiry ID", "Enquiry_No", "EnquiryNo"];

/** The enquiry id exactly as stored in the sheet, trimmed. '' when empty. */
export function getEnquiryId(entry: Record<string, unknown>): string {
  if (!entry) return "";
  for (const column of ID_COLUMNS) {
    const value = String(entry[column] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/** True when this row has a real Entry_ID that can be displayed. */
export function hasEnquiryId(entry: Record<string, unknown>): boolean {
  return getEnquiryId(entry) !== "";
}

/**
 * INTERNAL navigation key only — never rendered.
 *
 * The Task Detail modal looks its row up by this key. Rows whose Entry_ID cell
 * is still blank keep working, without the UI printing a fabricated ID.
 */
export function getEntryRef(entry: Record<string, unknown>, rowIndex = 0): string {
  const id = getEnquiryId(entry);
  if (id) return id;

  const serial = String(entry?.Serial_No ?? "").trim();
  if (serial) return `SERIAL:${serial}`;

  return `ROW:${rowIndex}`;
}
