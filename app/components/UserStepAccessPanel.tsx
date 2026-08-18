"use client";

// =============================================================================
// app/components/UserStepAccessPanel.tsx   (NEW FILE)
// =============================================================================
// This is the piece that fixes "user can't see which step they have been
// assigned" on the USER page.
//
// ROOT CAUSE RECAP
//  - The backend read View_Steps from the wrong column, so viewSteps was always
//    empty and the user saw nothing beyond hardcoded defaults.
//  - getVisibleSteps() ignored viewSteps unless canViewAllSteps was ON.
//
// WHAT THIS COMPONENT DOES
//  1. <MyAccessBanner> — always visible summary at the top of the user page:
//     "You can submit Step 2, 7. You can view Step 1, 4." So the user can never
//     be in doubt about what they were assigned.
//  2. <StepAccessList> — the 10-step strip with Edit / View / Hidden state.
//  3. useStepAccess() — one hook that turns the dashboard payload into the
//     access object plus ready-to-use helpers, so the page does not repeat the
//     parsing logic.
//
// USAGE inside app/user/page.tsx:
//
//   import { useStepAccess, MyAccessBanner, StepAccessList } from "../components/UserStepAccessPanel";
//   ...
//   const access = useStepAccess(dashboardData);   // dashboardData = getUserDashboardData result
//   ...
//   <MyAccessBanner access={access} />
//   <StepAccessList access={access} currentStep={Number(entry.Current_Step)} />
//
//   // gating a step card / submit button:
//   if (!access.canView(stepNum)) return null;                 // completely hidden
//   <button disabled={!access.canEdit(stepNum)}>Submit</button> // read-only step
// =============================================================================

import { useMemo } from "react";
import {
  readUserAccess,
  getVisibleSteps,
  getReadOnlySteps,
  canEditStep,
  canViewStep,
  officeAccessLabel,
  matchesOffice,
  ALL_STEPS,
  type UserAccess,
} from "../lib/accessControl";
import { STEP_NAMES } from "../lib/types";

export interface StepAccess {
  raw: UserAccess;
  editSteps: number[];
  viewOnlySteps: number[];
  visibleSteps: number[];
  officeLabel: string;
  canFillForm: boolean;
  canEdit: (step: number) => boolean;
  canView: (step: number) => boolean;
  /** office filter for the entry list */
  filterEntries: (entries: Record<string, unknown>[]) => Record<string, unknown>[];
}

/**
 * Accepts the whole getUserDashboardData() result. It reads from `user` first
 * and falls back to the flat top-level fields, so it works with both the new
 * and the old backend payload.
 */
export function useStepAccess(payload: Record<string, unknown> | null | undefined): StepAccess {
  return useMemo(() => {
    const source: Record<string, unknown> = {
      ...(payload || {}),
      ...((payload?.user as Record<string, unknown>) || {}),
    };

    const raw = readUserAccess(source);
    const visibleSteps = getVisibleSteps(raw);
    const viewOnlySteps = getReadOnlySteps(raw);

    return {
      raw,
      editSteps: raw.assignedSteps,
      viewOnlySteps,
      visibleSteps,
      officeLabel: officeAccessLabel(raw.officeAccess),
      canFillForm: raw.canFillForm,
      canEdit: (step: number) => canEditStep(raw, step),
      canView: (step: number) => canViewStep(raw, step),
      filterEntries: (entries: Record<string, unknown>[]) =>
        (entries || []).filter((entry) => matchesOffice(raw, entry)),
    };
  }, [payload]);
}

/** Always-on summary so the user immediately knows their assignment */
export function MyAccessBanner({ access }: { access: StepAccess }) {
  const { editSteps, viewOnlySteps, officeLabel, canFillForm } = access;

  const line = (label: string, steps: number[], color: string) => (
    <div className="flex items-start gap-2">
      <span className="text-[10px] font-bold shrink-0 w-[74px] pt-0.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {steps.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {steps.map((s) => (
            <span
              key={s}
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ background: "var(--surface-2)", color, border: `1px solid ${color}` }}
            >
              {s}. {STEP_NAMES[s]}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          None
        </span>
      )}
    </div>
  );

  return (
    <div
      className="p-3.5 rounded-xl mb-4 space-y-2"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-xs font-bold" style={{ color: "var(--text)" }}>
          My Access
        </h3>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: "rgba(124,58,237,0.10)", color: "#7c3aed", border: "1px solid #7c3aed" }}
          >
            Office: {officeLabel}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{
              background: canFillForm ? "rgba(5,150,105,0.10)" : "rgba(100,100,100,0.08)",
              color: canFillForm ? "var(--success)" : "var(--text-faint)",
              border: `1px solid ${canFillForm ? "var(--success)" : "var(--border)"}`,
            }}
          >
            New Entry: {canFillForm ? "Allowed" : "Not Allowed"}
          </span>
        </div>
      </div>

      {line("Can submit", editSteps, "var(--primary)")}
      {line("View only", viewOnlySteps, "#7c3aed")}

      {editSteps.length === 0 && viewOnlySteps.length === 0 && (
        <p className="text-[10px] pt-1" style={{ color: "var(--danger)" }}>
          No steps assigned yet. Ask your administrator to set your step access in the Admin panel.
        </p>
      )}
    </div>
  );
}

/** The 10-step strip with the current step highlighted */
export function StepAccessList({
  access,
  currentStep,
}: {
  access: StepAccess;
  currentStep?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_STEPS.map((s) => {
        const editable = access.canEdit(s);
        const viewable = access.canView(s);
        const isCurrent = Number(currentStep) === s;

        const bg = editable ? "var(--primary)" : viewable ? "rgba(124,58,237,0.12)" : "var(--surface-2)";
        const fg = editable ? "#ffffff" : viewable ? "#7c3aed" : "var(--text-faint)";
        const border = editable ? "var(--primary)" : viewable ? "#7c3aed" : "var(--border)";

        return (
          <div
            key={s}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{
              background: bg,
              border: `1px solid ${border}`,
              outline: isCurrent ? "2px solid var(--warning)" : "none",
              outlineOffset: "1px",
            }}
            title={
              editable
                ? `Step ${s}: you can submit this step`
                : viewable
                ? `Step ${s}: read only`
                : `Step ${s}: hidden for you`
            }
          >
            <span className="text-[10px] font-bold leading-none" style={{ color: fg }}>
              {s}
            </span>
            <span className="text-[10px] font-medium leading-none whitespace-nowrap" style={{ color: fg }}>
              {STEP_NAMES[s]}
            </span>
            <span className="text-[8px] font-bold leading-none" style={{ color: fg, opacity: 0.85 }}>
              {editable ? "EDIT" : viewable ? "VIEW" : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}