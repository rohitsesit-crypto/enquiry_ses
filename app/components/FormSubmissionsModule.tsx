// =============================================================================
// app/components/FormSubmissionsModule.tsx   (NEW FILE — create it)
// =============================================================================
// CHANGE F — a dedicated "Form" module that lists EVERY form submission with
// all details, exactly like the primary information view modal.
// Latest submission is shown on TOP, oldest at the BOTTOM.
// =============================================================================
"use client";

import React, { useMemo, useState } from "react";
import { formatSheetDateOnly, parseDateString } from "../lib/utils";
import { formatSubmittedOn, getGatePassNo, getPurchaseOrderDetails, getDispatchDetails } from "../lib/workflow";
import { getRequirements } from "../lib/partialSubmission";

interface FormSubmissionsModuleProps {
  entries: Record<string, unknown>[];
}

export default function FormSubmissionsModule({ entries }: FormSubmissionsModuleProps) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  /** Newest first — sorted by submission timestamp, Serial_No as tie breaker */
  const sorted = useMemo(() => {
    const list = [...entries];
    list.sort((a, b) => {
      const ta = parseDateString(String(a.Timestamp || "")).getTime();
      const tb = parseDateString(String(b.Timestamp || "")).getTime();
      const va = isNaN(ta) ? 0 : ta;
      const vb = isNaN(tb) ? 0 : tb;
      if (vb !== va) return vb - va;
      return (Number(b.Serial_No) || 0) - (Number(a.Serial_No) || 0);
    });
    return list;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((entry) =>
      Object.keys(entry).some((key) => String(entry[key] ?? "").toLowerCase().includes(q))
    );
  }, [sorted, search]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            Form Submissions
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--primary)" }}>
              {filtered.length}
            </span>
          </h3>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Latest submission on top</span>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company, enquirer, entry id, mobile, location, sales person..."
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          <p className="text-xs">No form submissions found.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((entry, idx) => {
          const entryId = String(entry.Entry_ID || idx);
          const isOpen = openId === entryId;
          return (
            <FormSubmissionCard
              key={entryId}
              entry={entry}
              isOpen={isOpen}
              onToggle={() => setOpenId(isOpen ? null : entryId)}
            />
          );
        })}
      </div>
    </div>
  );
}

function FormSubmissionCard({
  entry,
  isOpen,
  onToggle,
}: {
  entry: Record<string, unknown>;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const requirements = getRequirements(entry);
  const po = getPurchaseOrderDetails(entry);
  const dispatch = getDispatchDetails(entry);
  const gatePassNo = getGatePassNo(entry);

  const isCompleted = entry.Is_Completed === true || entry.Is_Completed === "TRUE" || entry.Is_Completed === "true";
  const isStopped = entry.Is_Stopped === true || entry.Is_Stopped === "TRUE" || entry.Is_Stopped === "true";
  const statusLabel = isCompleted ? "Completed" : isStopped ? "Stopped" : "In Progress";
  const statusColor = isCompleted ? "var(--success)" : isStopped ? "var(--danger)" : "var(--primary)";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${statusColor}` }}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 cursor-pointer"
        style={{ background: "transparent" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold" style={{ color: "var(--primary)" }}>
                {String(entry.Entry_ID || "")}
              </span>
              <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                {String(entry.Company_Name || "")}
              </span>
              {!!entry.Location && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,58,237,0.08)", color: "#7c3aed" }}>
                  {String(entry.Location)}
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {String(entry.Name_of_Enquirer || "")}
              {!!entry.Timestamp && ` · Submitted on ${formatSubmittedOn(entry.Timestamp)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "var(--surface-2)", color: statusColor, border: "1px solid var(--border)" }}>
              {statusLabel}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{isOpen ? "Hide" : "View"}</span>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid var(--border)" }}>
          {/* PRIMARY INFORMATION — same layout as the view modal */}
          <Section title="Primary Information">
            <Row label="Entry ID" value={String(entry.Entry_ID || "")} />
            <Row label="Serial No" value={String(entry.Serial_No || "")} />
            <Row label="Submitted On" value={formatSubmittedOn(entry.Timestamp)} />
            <Row label="Submitted By" value={String(entry.Submitted_By || "")} />
            <Row label="Location" value={String(entry.Location || "")} />
            <Row label="Company Name" value={String(entry.Company_Name || "")} />
            <Row label="Name of Enquirer" value={String(entry.Name_of_Enquirer || "")} />
            <Row label="Mobile Number" value={String(entry.Mobile_Number || "")} />
            <Row label="Email Id" value={String(entry.Email_Id || "")} />
            <Row label="Sales Person Accountable" value={String(entry.Sales_Person_Accountable || "")} />
            <Row label="Sales Close Date" value={formatSheetDateOnly(entry.Sales_Close_Date)} />
            <Row label="Type of Enquiry" value={String(entry.Type_of_Enquiry || "")} />
            <Row label="Challan Number" value={String(entry.Challan_Number || "")} />
            <Row label="Gate Pass No" value={gatePassNo} />
            <Row label="Remark" value={String(entry.Remark || "")} />
          </Section>

          {/* REQUIREMENTS */}
          {requirements.length > 0 && (
            <Section title="Requirements">
              <div className="col-span-2 space-y-1">
                {requirements.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-2.5 py-1.5 rounded" style={{ background: "var(--surface-2)", border: "1px solid var(--border-light)" }}>
                    <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{r.itemName}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Qty: {r.quantity} {r.unit}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* PURCHASE ORDER — change E */}
          {po && (
            <Section title="Purchase Order Details">
              <Row label="Po Number" value={po.poNumber} />
              <Row label="Location" value={po.location} />
              <Row label="Q.No." value={po.qNo} />
              <Row label="Delivery Date" value={formatSheetDateOnly(po.deliveryDate)} />
              <Row label="Payterms" value={po.payTerms ? `${po.payTerms} days` : ""} />
            </Section>
          )}

          {/* DISPATCH — change E */}
          {dispatch && (
            <Section title="Dispatch Details">
              <Row label="Mode" value={dispatch.mode} />
              <Row label="Name" value={dispatch.name} />
              <Row label="Mob No" value={dispatch.mobNo} />
              <Row label="Invoice/Challan No" value={dispatch.invoiceChallanNo} />
              <Row label="Get Pass No" value={dispatch.gatePassNo} />
              <Row label="LR No" value={dispatch.lrNo} />
              <Row label="Status of Dispatch" value={dispatch.status} />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-3">
      <h4 className="text-[11px] font-bold mb-2" style={{ color: "var(--text-secondary)" }}>{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[10px] font-semibold min-w-[130px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[11px] font-medium" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}