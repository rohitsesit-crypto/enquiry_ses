// =============================================================================
// app/components/EnquiryIdLabel.tsx   —  ENQUIRY ID PLATE (NEW COMPONENT)
// =============================================================================
// Prints the enquiry id the sheet holds, verbatim. Nothing is prefixed, padded
// or reformatted, so every existing id style keeps looking the way the team
// already recognises it (SES/26/0187, A-2291, Q-2026-118, ENQU-00042 ...).
//
// If the id column is blank, the row's Serial_No is printed as a plain number in
// a muted plate, so a card is never anonymous and nothing is invented.
// =============================================================================

import { getEnquiryId, getEnquirySerialLabel } from "../lib/enquiryId";

interface EnquiryIdLabelProps {
  entry: Record<string, unknown>;
  size?: "sm" | "md";
}

export default function EnquiryIdLabel({ entry, size = "md" }: EnquiryIdLabelProps) {
  const id = getEnquiryId(entry);
  const serial = id ? "" : getEnquirySerialLabel(entry);

  if (!id && !serial) return null;

  const fromSheet = Boolean(id);
  const text = id || serial;

  return (
    <span
      className="inline-flex items-center rounded shrink-0 whitespace-nowrap"
      title={
        fromSheet
          ? "Enquiry ID as stored in the Entries sheet"
          : "The id column is empty for this row, so its Serial No is shown"
      }
      style={{
        padding: size === "sm" ? "1px 5px" : "2px 7px",
        fontSize: size === "sm" ? 9.5 : 10.5,
        fontWeight: 700,
        letterSpacing: "0.02em",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        background: fromSheet ? "var(--primary-bg)" : "var(--surface-2)",
        color: fromSheet ? "var(--primary)" : "var(--text-muted)",
        border: `1px solid ${fromSheet ? "var(--primary)" : "var(--border)"}`,
      }}
    >
      {fromSheet ? text : `S.No ${text}`}
    </span>
  );
}
