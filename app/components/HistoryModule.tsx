// =============================================================================
// app/components/HistoryModule.tsx   (NEW FILE — create it)
// =============================================================================
// CHANGE C — history shows part wise rows:
//   Step 7 Part 1  Completed   25 / 50
//   Step 7 Part 2  Pending     25 remaining
//   Step 8 Part 1  Completed   25 / 50
// =============================================================================
"use client";

import React, { useMemo, useState } from "react";
import { formatDate } from "../lib/utils";
import { formatSubmittedOn, STEP_TITLES } from "../lib/workflow";
import { getEntryHistoryRows, type HistoryRow } from "../lib/partialSubmission";

interface HistoryModuleProps {
  entries: Record<string, unknown>[];
  /** Steps the current user is allowed to VIEW (change D) */
  visibleSteps: number[];
  onViewAttachment?: (url: string) => void;
}

function cleanUrl(raw: string): string {
  const match = String(raw || "").match(/https?:\/\/(res\.cloudinary\.com|drive\.google\.com)[^\s[\]]+/);
  return match ? match[0] : String(raw || "");
}

export default function HistoryModule({ entries, visibleSteps, onViewAttachment }: HistoryModuleProps) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    return entries.map((entry) => ({
      entry,
      rows: getEntryHistoryRows(entry, visibleSteps),
    }));
  }, [entries, visibleSteps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(({ entry, rows }) => {
      if (Object.keys(entry).some((k) => String(entry[k] ?? "").toLowerCase().includes(q))) return true;
      return rows.some((r) => r.label.toLowerCase().includes(q) || r.status.toLowerCase().includes(q));
    });
  }, [groups, search]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>
          History — part wise step details
        </h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entry, company, step or part..."
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          <p className="text-xs">No history available.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(({ entry, rows }, idx) => {
          const entryId = String(entry.Entry_ID || idx);
          const isOpen = openId === entryId;
          const completed = rows.filter((r) => r.status === "Completed").length;
          const pending = rows.filter((r) => r.status !== "Completed").length;

          return (
            <div key={entryId} className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <button onClick={() => setOpenId(isOpen ? null : entryId)} className="w-full text-left px-4 py-3 cursor-pointer">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold" style={{ color: "var(--primary)" }}>{String(entry.Entry_ID || "")}</span>
                      <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{String(entry.Company_Name || "")}</span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {String(entry.Name_of_Enquirer || "")}
                      {!!entry.Timestamp && ` · Submitted on ${formatSubmittedOn(entry.Timestamp)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(5,150,105,0.1)", color: "var(--success)" }}>{completed} completed</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(217,119,6,0.12)", color: "#b45309" }}>{pending} pending</span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{isOpen ? "Hide" : "View"}</span>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <Th>Step / Part</Th>
                          <Th>Name</Th>
                          <Th>Status</Th>
                          <Th>Qty</Th>
                          <Th>Submitted On</Th>
                          <Th>By</Th>
                          <Th>Reference</Th>
                          <Th>Remark</Th>
                          <Th>File</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => (
                          <HistoryTableRow key={ri} row={row} onViewAttachment={onViewAttachment} />
                        ))}
                      </tbody>
                    </table>
                    {rows.length === 0 && (
                      <p className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>
                        No visible step history for your access.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTableRow({ row, onViewAttachment }: { row: HistoryRow; onViewAttachment?: (url: string) => void }) {
  const completed = row.status === "Completed";
  const stopped = row.status === "Stopped";
  const color = completed ? "var(--success)" : stopped ? "var(--danger)" : "#b45309";
  const bg = completed ? "rgba(5,150,105,0.1)" : stopped ? "rgba(220,38,38,0.1)" : "rgba(217,119,6,0.12)";

  return (
    <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
      <td className="py-2 px-2 font-bold" style={{ color: "var(--text)" }}>{row.label}</td>
      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{STEP_TITLES[row.stepNumber]}</td>
      <td className="py-2 px-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: bg, color }}>{row.status}</span>
      </td>
      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>
        {row.isPartial
          ? completed
            ? `${row.submittedQuantity} / ${row.totalQuantity}`
            : `${row.remainingQuantity} remaining`
          : "-"}
      </td>
      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{row.submittedAt ? formatDate(row.submittedAt) : "-"}</td>
      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{row.submittedBy || "-"}</td>
      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{row.reference || "-"}</td>
      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{row.remark || "-"}</td>
      <td className="py-2 px-2">
        {row.attachment ? (
          <button
            type="button"
            onClick={() => onViewAttachment && onViewAttachment(cleanUrl(row.attachment))}
            className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer font-semibold"
            style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
          >
            View
          </button>
        ) : (
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>-</span>
        )}
      </td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>{children}</th>;
}