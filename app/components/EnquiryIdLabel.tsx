// =============================================================================
// app/components/EnquiryIdLabel.tsx   —  ENQUIRY ID PLATE
// =============================================================================
// Prints the Entry_ID the "Entries" tab holds, verbatim. Nothing is prefixed,
// padded, reformatted or substituted:
//
//     ENQ-00001     ENQP-00003     ENQPP-00008     ENQU-00042
//
// If the cell is empty the plate renders nothing at all. It never falls back to
// Serial_No, so an "S.No 125" style label can never appear where the entry id
// belongs.
// =============================================================================

import { getEnquiryId } from "../lib/enquiryId";

interface EnquiryIdLabelProps {
  entry: Record<string, unknown>;
  size?: "sm" | "md";
}

export default function EnquiryIdLabel({ entry, size = "md" }: EnquiryIdLabelProps) {
  const id = getEnquiryId(entry);

  if (!id) return null;

  return (
    <span
      className="inline-flex items-center rounded shrink-0 whitespace-nowrap"
      title="Entry ID as stored in the Entries sheet"
      style={{
        padding: size === "sm" ? "1px 5px" : "2px 7px",
        fontSize: size === "sm" ? 9.5 : 10.5,
        fontWeight: 700,
        letterSpacing: "0.02em",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        background: "var(--primary-bg)",
        color: "var(--primary)",
        border: "1px solid var(--primary)",
      }}
    >
      {id}
    </span>
  );
}
