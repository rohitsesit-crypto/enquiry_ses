// =============================================================================
// app/components/EnquiryIdLabel.tsx   —  ENQUIRY ID PLATE (NEW COMPONENT)
// =============================================================================
// Prints the Entry_ID exactly as it appears in the sheet's "Enquiry_ID" column.
// Nothing is prefixed, padded or reformatted, so every existing ID style keeps
// looking the way the team already recognises it.
//
// Renders nothing when the cell is empty — no placeholder, no made-up value, and
// no dangling "·" next to the company name.
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
      title="Entry_ID as stored in the Entries sheet"
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
