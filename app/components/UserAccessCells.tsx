"use client";

// =============================================================================
// app/components/UserAccessCells.tsx   (NEW FILE)
// =============================================================================
// Drop-in cells for the ADMIN "All Users" table.
//
// WHY THIS FILE EXISTS
//  - Alignment bug: the old table rendered `String(user.officeAccess)` directly.
//    Because the backend was reading officeAccess from the View_Steps column,
//    step numbers like "1,2,3" appeared inside the "Office Access" column.
//    <OfficeAccessCell> now runs every value through normalizeOfficeAccess(),
//    so ONLY Mumbai / Boisar / Mumbai & Boisar can ever be rendered there, and
//    anything else falls back to "All".
//  - The old table also had no reliable way to show which steps a user can
//    edit vs only view, because getAdminData never returned viewSteps.
//    <StepAccessCell> renders both lists with fixed-width badges so every row
//    lines up, regardless of how many steps a user has.
//
// USAGE inside app/admin/page.tsx (replace the two <td> bodies):
//
//   import { StepAccessCell, OfficeAccessCell, AccessFlagsCell } from "../components/UserAccessCells";
//   ...
//   <td className="py-2 px-2 align-middle"><StepAccessCell user={user} /></td>
//   <td className="py-2 px-2 align-middle"><OfficeAccessCell user={user} /></td>
//   <td className="py-2 px-2 align-middle"><AccessFlagsCell user={user} /></td>
// =============================================================================

import {
  readUserAccess,
  officeAccessLabel,
  getVisibleSteps,
  ALL_STEPS,
} from "../lib/accessControl";

interface CellProps {
  user: Record<string, unknown>;
}

/** Fixed 20px square badge => all rows keep the same height and alignment */
function StepBadge({
  step,
  tone,
}: {
  step: number;
  tone: "edit" | "view" | "hidden";
}) {
  const palette = {
    edit: { bg: "var(--primary)", color: "#ffffff", border: "var(--primary)" },
    view: { bg: "rgba(124,58,237,0.12)", color: "#7c3aed", border: "#7c3aed" },
    hidden: { bg: "var(--surface-2)", color: "var(--text-faint)", border: "var(--border)" },
  }[tone];

  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold shrink-0 leading-none"
      style={{ background: palette.bg, color: palette.color, border: `1px solid ${palette.border}` }}
      title={`Step ${step}: ${tone === "edit" ? "Can Edit" : tone === "view" ? "View Only" : "Hidden"}`}
    >
      {step}
    </span>
  );
}

/**
 * Shows all 10 steps in one aligned strip:
 *   filled blue  = can edit/submit
 *   purple ring  = view only
 *   grey         = hidden for this user
 */
export function StepAccessCell({ user }: CellProps) {
  const access = readUserAccess(user);
  const visible = getVisibleSteps(access);

  const editList = access.assignedSteps;
  const viewList = visible.filter((s) => editList.indexOf(s) === -1);

  return (
    <div className="flex flex-col gap-1.5 min-w-[190px]">
      <div className="flex flex-wrap gap-1">
        {ALL_STEPS.map((s) => {
          const tone = editList.includes(s) ? "edit" : visible.includes(s) ? "view" : "hidden";
          return <StepBadge key={s} step={s} tone={tone} />;
        })}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] leading-tight" style={{ color: "var(--text-muted)" }}>
          Edit: <strong style={{ color: "var(--primary)" }}>{editList.length ? editList.join(", ") : "None"}</strong>
        </span>
        <span className="text-[9px] leading-tight" style={{ color: "var(--text-muted)" }}>
          View: <strong style={{ color: "#7c3aed" }}>{viewList.length ? viewList.join(", ") : "None"}</strong>
        </span>
      </div>
    </div>
  );
}

/**
 * Office Access cell. Never prints step numbers again — any non-office value is
 * normalized away and shown as "All".
 */
export function OfficeAccessCell({ user }: CellProps) {
  const access = readUserAccess(user);
  const label = officeAccessLabel(access.officeAccess);
  const restricted = access.officeAccess !== "";

  return (
    <span
      className="inline-flex items-center justify-center whitespace-nowrap text-[10px] font-bold px-2 py-1 rounded min-w-[92px]"
      style={{
        background: restricted ? "rgba(124,58,237,0.10)" : "var(--surface-2)",
        color: restricted ? "#7c3aed" : "var(--text-faint)",
        border: `1px solid ${restricted ? "#7c3aed" : "var(--border)"}`,
      }}
    >
      {label}
    </span>
  );
}

/** Form / View+Edit / Active flags, each with a fixed width so columns align */
export function AccessFlagsCell({ user }: CellProps) {
  const access = readUserAccess(user);
  const isActive = user.isActive === true || String(user.isActive).toLowerCase() === "true";
  const isAdmin = user.isAdmin === true || String(user.isAdmin).toLowerCase() === "true";

  const flag = (label: string, on: boolean, onColor: string, onBg: string) => (
    <span
      key={label}
      className="inline-flex items-center justify-center whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded min-w-[78px]"
      style={{
        background: on ? onBg : "rgba(100,100,100,0.08)",
        color: on ? onColor : "var(--text-faint)",
        border: `1px solid ${on ? onColor : "var(--border)"}`,
      }}
    >
      {label}
    </span>
  );

  return (
    <div className="flex flex-col gap-1 min-w-[92px]">
      {flag(access.canFillForm ? "Form: Yes" : "Form: No", access.canFillForm, "var(--success)", "rgba(5,150,105,0.10)")}
      {flag(access.canViewAllSteps ? "View All" : "Scoped", access.canViewAllSteps, "var(--primary)", "rgba(37,99,235,0.10)")}
      {flag(isActive ? "Active" : "Inactive", isActive, "var(--success)", "rgba(5,150,105,0.10)")}
      {isAdmin && flag("Admin", true, "#b45309", "rgba(180,83,9,0.10)")}
    </div>
  );
}