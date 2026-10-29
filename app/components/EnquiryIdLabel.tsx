// =============================================================================
// app/components/EnquiryIdLabel.tsx   —  ENQUIRY ID PLATE (NEW COMPONENT)
// =============================================================================
// The single place the dashboard prints an enquiry ID, so it looks the same on
// pending cards, completed cards and the detail modal.
//
// Props match the row shape used everywhere else (Record<string, unknown>), so
// this can be dropped into any screen that already has a sheet row.
// =============================================================================

import { resolveEnquiryId } from "../lib/enquiryId";

interface EnquiryIdLabelProps {
  entry: Record<string, unknown>;
  /** 0 based sheet position, used only when Entry_ID and Serial_No are blank */
  rowIndex?: number;
  size?: "sm" | "md";
  /** Hide the "AUTO" chip on dense rows (still exposed via title) */
  showDerivedMarker?: boolean;
}

export default function EnquiryIdLabel({
  entry,
  rowIndex = 0,
  size = "md",
  showDerivedMarker = true,
}: EnquiryIdLabelProps) {
  const resolved = resolveEnquiryId(entry, rowIndex);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded shrink-0 whitespace-nowrap"
      title={
        resolved.derived
          ? "The Entry_ID cell is empty in the sheet, so this ID was recovered from the serial number."
          : "Enquiry ID stored in the Entries sheet"
      }
      style={{
        padding: size === "sm" ? "1px 5px" : "2px 7px",
        fontSize: size === "sm" ? 9.5 : 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        background: "var(--primary-bg)",
        color: "var(--primary)",
        border: "1px solid var(--primary)",
      }}
    >
      {resolved.id}
      {resolved.derived && showDerivedMarker && (
        <span
          className="rounded"
          style={{
            padding: "0 3px",
            fontSize: 8,
            fontWeight: 800,
            background: "rgba(217,119,6,0.16)",
            color: "#b45309",
          }}
        >
          AUTO
        </span>
      )}
    </span>
  );
}
