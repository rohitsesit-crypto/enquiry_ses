"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getUserDashboardData, verifyUser, submitNewEntry, submitStep, updateEntry } from "../lib/api";
import {
  formatDate,
  formatDateOnly,
  formatSheetDateOnly,
  formatStorageDate,
  isOverdue,
  isToday,
  cn,
  parseDateString,
} from "../lib/utils";
import EnquiryForm from "../components/EnquiryForm";
import StepWorkflow from "../components/StepWorkflow";
import FormSubmissionsModule from "../components/FormSubmissionsModule";
import HistoryModule from "../components/HistoryModule";
import { getOverallStepStatus, getStepPartSummary, isPartialStep } from "../lib/partialSubmission";
import {
  STEP_TITLES,
  formatSubmittedOn,
  getDispatchDetails,
  getGatePassNo,
  getPurchaseOrderDetails,
} from "../lib/workflow";
import {
  readUserAccess,
  getVisibleSteps,
  getReadOnlySteps,
  canEditStep,
  matchesOffice,
  officeAccessLabel,
  type UserAccess,
} from "../lib/accessControl";

interface TaskItem {
  entry: Record<string, unknown>;
  stepNum: number;
  partNumber: number;
  label: string;
  plannedDate: string | null;
  actualDate: string | null;
  canSubmit: boolean;
  statusText: string;
  pendingQty: number;
  totalQty: number;
}

/** Reads a boolean coming from the sheet in any of its shapes. */
function sheetBool(value: unknown): boolean {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

function UserDashboardContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [dashboardData, setDashboardData] = useState<Record<string, unknown> | null>(null);
  const [currentSection, setCurrentSection] = useState<"pending" | "completed" | "history" | "forms">("pending");
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState<{ entryId: string; stepNum: number } | null>(null);
  const [showStepSubmit, setShowStepSubmit] = useState<{ entryId: string; stepNum: number; entry: Record<string, unknown> } | null>(null);
  const [showEditForm, setShowEditForm] = useState<{ entryId: string; entry: Record<string, unknown> } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [sheetAttachmentUrl, setSheetAttachmentUrl] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const todayColumnRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    if (!email) return;
    try {
      const result = await getUserDashboardData(email);
      if (result.success) {
        setDashboardData(result as unknown as Record<string, unknown>);
        setLastSync(new Date());
      } else if (result.message) {
        setError(result.message);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  }, [email]);

  useEffect(() => {
    if (!email) {
      setLoading(false);
      setError("No email provided. Use the link from your administrator.");
      return;
    }

    async function init() {
      try {
        const result = await verifyUser(email);
        if (result.success && result.verified) {
          setVerified(true);
          setUserName(result.name);
          await loadData();
        } else {
          setError(result.message || "Access denied");
        }
      } catch {
        setError("Connection error. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [email, loadData]);

  // Faster polling + refresh on focus so manual sheet edits appear quickly
  useEffect(() => {
    if (!verified) return;
    const interval = setInterval(loadData, 15000);

    const onFocus = () => loadData();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [verified, loadData]);

  useEffect(() => {
    if (!dashboardData || currentSection !== "pending") return;
    const timeout = setTimeout(() => {
      if (todayColumnRef.current && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const todayEl = todayColumnRef.current;
        container.scrollTo({ left: todayEl.offsetLeft - container.offsetLeft - 16, behavior: "smooth" });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [dashboardData, currentSection]);

  useEffect(() => {
    const saved = localStorage.getItem("fms-theme");
    if (saved === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("fms-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("fms-theme", "light");
    }
  };

  // ===========================================================================
  // ACCESS  (read from nested `user` first, then the flat fallback fields)
  // ===========================================================================
  const access: UserAccess = useMemo(() => {
    const nested = (dashboardData?.user as Record<string, unknown>) || {};
    return readUserAccess({
      assignedSteps: nested.assignedSteps ?? dashboardData?.assignedSteps,
      assignedStepsList: nested.assignedStepsList,
      viewSteps: nested.viewSteps ?? dashboardData?.viewSteps,
      viewStepsList: nested.viewStepsList,
      canViewAllSteps: nested.canViewAllSteps ?? dashboardData?.canViewAllSteps,
      canFillForm: nested.canFillForm ?? dashboardData?.canFillForm,
      officeAccess: nested.officeAccess ?? dashboardData?.officeAccess,
    });
  }, [dashboardData]);

  const assignedSteps = access.assignedSteps;
  const visibleSteps = useMemo(() => getVisibleSteps(access), [access]);
  const viewOnlySteps = useMemo(() => getReadOnlySteps(access), [access]);
  const canFillForm = access.canFillForm;
  const officeLabel = officeAccessLabel(access.officeAccess);

  /** HARD GUARD: an unassigned step can never open the submit modal. */
  const openStepSubmit = useCallback(
    (entryId: string, stepNum: number, entry: Record<string, unknown>) => {
      if (!canEditStep(access, stepNum)) {
        showToast(`You are not authorized to submit Step ${stepNum}`, "error");
        return;
      }
      if (sheetBool(entry.Is_Stopped)) {
        showToast("This process has been stopped", "error");
        return;
      }
      setShowStepSubmit({ entryId, stepNum, entry });
    },
    [access]
  );

  const handleNewEntrySubmit = async (formData: Record<string, unknown>) => {
    try {
      const result = await submitNewEntry(email, formData);
      if (result.success) {
        showToast("Entry submitted successfully!", "success");
        setShowNewEntry(false);
        await loadData();
      } else {
        showToast(result.message || "Error submitting entry", "error");
      }
    } catch {
      showToast("Connection error", "error");
    }
  };

  const handleStepSubmit = async (entryId: string, stepNum: number, data: Record<string, unknown>) => {
    try {
      const result = await submitStep(entryId, stepNum, email, data);
      if (result.success) {
        showToast(result.message || "Step submitted!", "success");
        setShowStepSubmit(null);
        setShowTaskDetail(null);
        await loadData();
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    }
  };

  const handleEditEntry = async (entryId: string, formData: Record<string, unknown>) => {
    try {
      const result = await updateEntry(email, entryId, formData);
      if (result.success) {
        showToast("Entry updated!", "success");
        setShowEditForm(null);
        await loadData();
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "var(--bg)" }}>
        <div className="w-9 h-9 border-3 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading your tasks...</p>
      </div>
    );
  }

  if (error && !verified) {
    return (
      <div className="flex items-center justify-center min-h-screen p-5" style={{ background: "var(--bg)" }}>
        <div className="text-center p-10 rounded-xl max-w-md" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-4xl mb-3">&#x26A0;&#xFE0F;</div>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--danger)" }}>Access Denied</h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!verified) return null;

  // ===========================================================================
  // ENTRY LIST  (office filter)
  // ===========================================================================
  const entries = (dashboardData?.entries as Record<string, unknown>[]) || [];
  const salesPersons = (dashboardData?.salesPersons as string[]) || [];
  const companies = (dashboardData?.companies as Record<string, unknown>[]) || [];
  const filteredEntries = entries.filter((entry) => matchesOffice(access, entry));

  // ===========================================================================
  // TASK BUILDING  (every actionable part becomes its own card)
  // ===========================================================================
  const pendingTasks: TaskItem[] = [];
  const completedTasks: TaskItem[] = [];

  filteredEntries.forEach((entry) => {
    const isStopped = sheetBool(entry.Is_Stopped);

    visibleSteps.forEach((s) => {
      const rawStatus = String(entry[`Step_${s}_Status`] || "Locked");
      if (rawStatus === "Locked" || rawStatus === "Skipped" || rawStatus === "Stopped") return;

      const plannedDate = (entry[`Step_${s}_Planned_Date`] as string | null) || null;
      const actualDate = (entry[`Step_${s}_Actual_Date`] as string | null) || null;
      const mayEdit = canEditStep(access, s) && !isStopped;

      // ---------- PARTIAL STEPS (7, 8, 9, 10) ----------
      if (isPartialStep(s)) {
        const summary = getStepPartSummary(entry, s);

        summary.parts.forEach((part) => {
          completedTasks.push({
            entry,
            stepNum: s,
            partNumber: part.partNumber,
            label: `Step ${s} Part ${part.partNumber}`,
            plannedDate,
            actualDate: part.submittedAt || actualDate,
            canSubmit: false,
            statusText: "Completed",
            pendingQty: 0,
            totalQty: part.totalQuantity,
          });
        });

        if (summary.pendingPart) {
          pendingTasks.push({
            entry,
            stepNum: s,
            partNumber: summary.pendingPart.partNumber,
            label: `Step ${s} Part ${summary.pendingPart.partNumber}`,
            plannedDate,
            actualDate: null,
            canSubmit: mayEdit && summary.isActionable,
            statusText: summary.parts.length > 0 ? "Partially Submitted" : "Pending",
            pendingQty: summary.remainingQuantity,
            totalQty: summary.totalQuantity,
          });
        }
        return;
      }

      // ---------- NORMAL STEPS (1..6) ----------
      if (rawStatus === "Pending") {
        pendingTasks.push({
          entry,
          stepNum: s,
          partNumber: 1,
          label: `Step ${s}`,
          plannedDate,
          actualDate: null,
          canSubmit: mayEdit,
          statusText: "Pending",
          pendingQty: 0,
          totalQty: 0,
        });
      } else if (rawStatus === "Completed") {
        completedTasks.push({
          entry,
          stepNum: s,
          partNumber: 1,
          label: `Step ${s}`,
          plannedDate,
          actualDate,
          canSubmit: false,
          statusText: "Completed",
          pendingQty: 0,
          totalQty: 0,
        });
      }
    });
  });

  const filterBySearch = (task: TaskItem) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    for (const key of Object.keys(task.entry)) {
      if (String(task.entry[key] || "").toLowerCase().includes(query)) return true;
    }
    if ((STEP_TITLES[task.stepNum] || "").toLowerCase().includes(query)) return true;
    if (task.label.toLowerCase().includes(query)) return true;
    return false;
  };

  const filteredPendingTasks = pendingTasks.filter(filterBySearch);
  const filteredCompletedTasks = completedTasks.filter(filterBySearch);

  const completedByEntry: Record<string, { entry: Record<string, unknown>; steps: TaskItem[] }> = {};
  filteredCompletedTasks.forEach((task) => {
    const entryId = String(task.entry.Entry_ID);
    if (!completedByEntry[entryId]) completedByEntry[entryId] = { entry: task.entry, steps: [] };
    completedByEntry[entryId].steps.push(task);
  });
  Object.values(completedByEntry).forEach((group) => {
    group.steps.sort((a, b) => a.stepNum - b.stepNum || a.partNumber - b.partNumber);
  });
  const completedEntries = Object.values(completedByEntry);

  const getDateLabel = (dateKey: string): string => {
    if (dateKey === "No Date") return "No Date";
    const dateObj = parseDateString(dateKey);
    if (isNaN(dateObj.getTime())) return dateKey;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateObj);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays === 2) return "Day After Tomorrow";
    if (diffDays === -2) return "2 Days Ago";
    if (diffDays > 2 && diffDays <= 7) return `In ${diffDays} Days`;
    if (diffDays < -2 && diffDays >= -7) return `${Math.abs(diffDays)} Days Ago`;
    return formatDateOnly(dateObj);
  };

  const pendingByDate: Record<string, TaskItem[]> = {};
  filteredPendingTasks.forEach((task) => {
    const dateKey = task.plannedDate ? formatStorageDate(task.plannedDate) || "No Date" : "No Date";
    if (!pendingByDate[dateKey]) pendingByDate[dateKey] = [];
    pendingByDate[dateKey].push(task);
  });

  const sortedDateKeys = Object.keys(pendingByDate).sort((a, b) => {
    if (a === "No Date") return 1;
    if (b === "No Date") return -1;
    return parseDateString(b).getTime() - parseDateString(a).getTime();
  });

  // ===========================================================================
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      {/* ============================ HEADER ============================ */}
      <header className="flex items-center gap-3.5 px-6 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg object-contain shrink-0" />
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>Flowchart Monitoring System</h1>
          <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>Saraswat Engineering Services</p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md whitespace-nowrap" style={{ color: "var(--text-faint)", background: "var(--surface-2)", border: "1px solid var(--border-light)" }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
            <span>{lastSync ? `Synced ${formatDate(lastSync).split(" ").slice(-2).join(" ")}` : "Live"}</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap" style={{ background: "rgba(124,58,237,0.10)", color: "#7c3aed", border: "1px solid #7c3aed" }}>
            {officeLabel === "All" ? "All Offices" : officeLabel}
          </span>
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            {darkMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
          </button>
        </div>
      </header>

      {/* ============================ HERO ============================ */}
      <div className="px-7 py-4 text-white flex items-center justify-between flex-wrap gap-3" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #2563eb 100%)" }}>
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Enquiry Capture O2D</h2>
          <p className="text-xs opacity-80 truncate">Welcome, <strong>{userName || email}</strong></p>
        </div>
        <div className="flex items-center gap-2">
          {canFillForm && (
            <button onClick={() => setShowNewEntry(true)} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white cursor-pointer whitespace-nowrap" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
              + New Entry
            </button>
          )}
          <button onClick={handleRefresh} disabled={refreshing} className="px-3 py-1.5 rounded-md text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5 whitespace-nowrap" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", opacity: refreshing ? 0.7 : 1 }}>
            {refreshing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ================= MY ACCESS BAR (fixes "can't see assigned steps") ==== */}
      <MyAccessBar
        assignedSteps={assignedSteps}
        viewOnlySteps={viewOnlySteps}
        officeLabel={officeLabel}
        canFillForm={canFillForm}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ============================ SIDEBAR ============================ */}
        <aside className="w-60 min-w-60 hidden md:flex flex-col overflow-y-auto" style={{ background: "var(--sidebar-bg)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider px-5 pt-5 pb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Navigation</div>

          {([
            { key: "pending", icon: "\u23F1\uFE0F", label: "Pending Tasks", count: pendingTasks.length, color: "var(--primary)" },
            { key: "completed", icon: "\u2705", label: "Completed", count: completedTasks.length, color: "var(--success)" },
            { key: "forms", icon: "\uD83D\uDCCB", label: "Form", count: filteredEntries.length, color: "#7c3aed" },
          ] as const).map((item) => (
            <button
              key={item.key}
              onClick={() => setCurrentSection(item.key)}
              className={cn(
                "flex items-center gap-2.5 px-4 py-2.5 mx-2 rounded-md text-[13px] font-medium transition-all cursor-pointer",
                currentSection === item.key && "font-semibold"
              )}
              style={{
                color: currentSection === item.key ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
                background: currentSection === item.key ? "var(--sidebar-active-bg)" : "transparent",
              }}
            >
              <span className="w-4 text-center shrink-0">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.count !== null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: item.color }}>
                  {item.count}
                </span>
              )}
            </button>
          ))}

          {/* Step legend so the colours in the cards are self-explanatory */}
          <div className="mt-auto px-5 py-4 space-y-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>Legend</div>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--sidebar-text)" }}>
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "var(--primary)" }} /> You can submit
            </div>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--sidebar-text)" }}>
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "#7c3aed" }} /> View only
            </div>
          </div>
        </aside>

        {/* ============================ MAIN ============================ */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
          <div className="p-6 pb-20 md:pb-6 max-w-[1400px]">
            {/* Search */}
            <div className="mb-5">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">&#x1F50D;</span>
                <input
                  type="text"
                  placeholder="Search by invoice no, company, enquirer, entry ID, part, location, step..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-xs cursor-pointer" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    &#x2715;
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-[11px] mt-1.5 ml-1" style={{ color: "var(--text-muted)" }}>
                  Showing results for &quot;<strong>{searchQuery}</strong>&quot; &#x2014; {filteredPendingTasks.length} pending, {filteredCompletedTasks.length} completed
                </p>
              )}
            </div>

            {/* ================= PENDING ================= */}
            {currentSection === "pending" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
                    Pending Tasks
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--primary)" }}>{filteredPendingTasks.length}</span>
                  </h3>
                </div>
                
                {visibleSteps.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <div className="text-4xl mb-3">&#x1F512;</div>
                    <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>No Steps Assigned</h3>
                    <p className="text-xs">Ask your administrator to give you step access in the Admin panel.</p>
                  </div>
                ) : filteredPendingTasks.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <div className="text-4xl mb-3">&#x1F389;</div>
                    <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>All Caught Up!</h3>
                    <p className="text-xs">No pending tasks for your visible steps.</p>
                  </div>
                ) : (
                     <div className="scroll-top-wrapper">
                      <div ref={scrollContainerRef} className="scroll-top-content flex gap-4 overflow-x-auto pt-2 pb-4">
                        {sortedDateKeys.map((dateKey) => {
                        const tasks = pendingByDate[dateKey];
                        const dateObj = dateKey !== "No Date" ? parseDateString(dateKey) : null;
                        const isTodayDate = dateObj ? isToday(dateObj.toISOString()) : false;
                        const isOverdueDate = dateObj ? isOverdue(dateObj.toISOString()) : false;

                        return (
                          <div
                            key={dateKey}
                            ref={isTodayDate ? todayColumnRef : undefined}
                            className={cn("min-w-[320px] max-w-[380px] flex-1 rounded-xl overflow-hidden", isTodayDate && "shadow-lg")}
                            style={{ border: isTodayDate ? "1.5px solid #f59e0b" : "1px solid var(--border)", background: "var(--surface)" }}
                          >
                            <div className="px-4 py-3.5" style={{ borderBottom: `2px solid ${isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : "var(--primary)"}`, background: isTodayDate ? "rgba(245,158,11,0.06)" : "transparent" }}>
                              <div className="flex items-center gap-2.5">
                                <div className="text-lg shrink-0">{isOverdueDate ? "\uD83D\uDD34" : isTodayDate ? "\uD83D\uDFE1" : "\uD83D\uDFE2"}</div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-[13px] font-bold flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text)" }}>
                                    {getDateLabel(dateKey)}
                                    {dateObj && dateKey !== "No Date" && (
                                      <span className="text-[10px] font-normal whitespace-nowrap" style={{ color: "var(--text-muted)" }}>({formatDateOnly(dateObj)})</span>
                                    )}
                                    {isTodayDate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white uppercase" style={{ background: "#f59e0b" }}>TODAY</span>}
                                    {isOverdueDate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white uppercase" style={{ background: "#dc2626" }}>OVERDUE</span>}
                                  </h3>
                                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{tasks.length} task(s)</p>
                                </div>
                              </div>
                            </div>

                            <div className="p-2.5 flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                              {tasks.map((task, idx) => {
                                const taskLocation = String(task.entry.Location || "").toLowerCase();
                                const isMumbai = taskLocation === "mumbai";
                                const isBoisar = taskLocation === "boisar";
                                const locationColor = isMumbai ? "#0891b2" : isBoisar ? "#7c3aed" : "var(--primary)";
                                const locationBg = isMumbai ? "rgba(8,145,178,0.06)" : isBoisar ? "rgba(124,58,237,0.06)" : "var(--surface-2)";
                                const editable = canEditStep(access, task.stepNum);
                                const badgeColor = isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : editable ? "var(--primary)" : "#7c3aed";

                                return (
                                  <div
                                    key={`${String(task.entry.Entry_ID)}-${task.stepNum}-${task.partNumber}-${idx}`}
                                    onClick={() => setShowTaskDetail({ entryId: String(task.entry.Entry_ID), stepNum: task.stepNum })}
                                    className="p-3 rounded-lg cursor-pointer transition-all hover:shadow-md"
                                    style={{
                                      background: isTodayDate ? "rgba(245,158,11,0.04)" : locationBg,
                                      border: `1px solid ${isTodayDate ? "rgba(245,158,11,0.25)" : "var(--border-light)"}`,
                                      borderLeft: `3px solid ${isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : locationColor}`,
                                    }}
                                  >
                                    {/* Row 1: step badge + entry label */}
                                    <div className="flex items-center gap-2.5 mb-2">
                                      <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: badgeColor }}>
                                        {task.stepNum}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>
                                          {String(task.entry.Entry_ID || "")} &#183; {String(task.entry.Company_Name || "")}
                                        </h4>
                                        <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                                          {String(task.entry.Name_of_Enquirer || "")}
                                        </p>
                                      </div>
                                      {(isMumbai || isBoisar) && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white shrink-0 whitespace-nowrap" style={{ background: locationColor }}>
                                          {isMumbai ? "Mumbai" : "Boisar"}
                                        </span>
                                      )}
                                    </div>

                                    {/* Row 2: aligned meta strip */}
                                    <div className="text-[11px] flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: "var(--text-muted)" }}>
                                      <span className="font-bold whitespace-nowrap" style={{ color: "var(--text)" }}>{task.label}</span>
                                      <span className="whitespace-nowrap">{STEP_TITLES[task.stepNum]}</span>
                                      {task.statusText === "Partially Submitted" && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: "rgba(217,119,6,0.14)", color: "#b45309" }}>Partially Submitted</span>
                                      )}
                                      {task.totalQty > 0 && (
                                        <span className="font-semibold whitespace-nowrap" style={{ color: "#d97706" }}>{task.pendingQty} of {task.totalQty} pending</span>
                                      )}
                                      <span
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ml-auto"
                                        style={{
                                          background: editable ? "rgba(37,99,235,0.10)" : "rgba(124,58,237,0.10)",
                                          color: editable ? "var(--primary)" : "#7c3aed",
                                          border: `1px solid ${editable ? "var(--primary)" : "#7c3aed"}`,
                                        }}
                                      >
                                        {editable ? "ASSIGNED TO YOU" : "VIEW ONLY"}
                                      </span>
                                    </div>

                                    {task.canSubmit && (
                                      <div className="flex justify-end mt-2.5">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openStepSubmit(String(task.entry.Entry_ID), task.stepNum, task.entry); }}
                                          className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white cursor-pointer whitespace-nowrap"
                                          style={{ background: "var(--success)" }}
                                        >
                                          Submit {task.label}
                                        </button>
                                      </div>
                                    )}

                                    {!task.canSubmit && editable && task.totalQty > 0 && (
                                      <p className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                                        Waiting for Step {task.stepNum - 1} to release quantity.
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                        })}
                       </div>
                  </div>
                )}
              </div>
            )}

            {/* ================= COMPLETED ================= */}
            {currentSection === "completed" && (
              <div>
                <h3 className="text-base font-bold flex items-center gap-2 mb-5" style={{ color: "var(--text)" }}>
                  Completed Entries
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--success)" }}>{completedEntries.length}</span>
                </h3>
                {completedEntries.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>No Completed Steps</h3>
                    <p className="text-xs">Completed steps and parts will appear here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {completedEntries.map((group, idx) => {
                      const latestDate = group.steps[group.steps.length - 1]?.actualDate;
                      return (
                        <div
                          key={idx}
                          onClick={() => setShowTaskDetail({ entryId: String(group.entry.Entry_ID), stepNum: group.steps[0].stepNum })}
                          className="p-4 rounded-xl cursor-pointer transition-all hover:shadow-md flex flex-col"
                          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid var(--success)" }}
                        >
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "var(--success)" }}>&#x2713;</div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-bold truncate" style={{ color: "var(--text)" }}>{String(group.entry.Company_Name || "")}</h4>
                              <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                                {String(group.entry.Entry_ID || "")} &#183; {String(group.entry.Name_of_Enquirer || "")}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {group.steps.map((step, si) => (
                              <span key={`${step.stepNum}-${step.partNumber}-${si}`} className="text-[9px] font-bold px-2 py-0.5 rounded whitespace-nowrap" style={{ background: "rgba(5,150,105,0.08)", color: "var(--success)" }}>
                                {step.label} &#183; {STEP_TITLES[step.stepNum]}
                              </span>
                            ))}
                          </div>
                          {latestDate && (
                            <div className="text-[10px] mt-auto" style={{ color: "var(--text-muted)" }}>Last completed: {formatDate(latestDate)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ================= HISTORY ================= */}
            

            {/* ================= FORM MODULE ================= */}
            {currentSection === "forms" && <FormSubmissionsModule entries={filteredEntries} />}
          </div>
        </main>
      </div>

      {/* ============================ MOBILE NAV ============================ */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{ background: "var(--sidebar-bg)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex justify-around items-center py-2">
          {([
            { key: "pending", icon: "\u23F1\uFE0F", label: "Pending" },
            { key: "completed", icon: "\u2705", label: "Done" },
            
            { key: "forms", icon: "\uD83D\uDCCB", label: "Form" },
          ] as const).map((item) => (
            <button
              key={item.key}
              onClick={() => setCurrentSection(item.key)}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-[10px] font-semibold cursor-pointer min-w-[64px]"
              style={{ color: currentSection === item.key ? "#fff" : "var(--sidebar-text)", background: currentSection === item.key ? "var(--sidebar-active-bg)" : "transparent" }}
            >
              <span>{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ============================ MODALS ============================ */}
      {showNewEntry && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowNewEntry(false); }}>
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold pb-3.5 mb-4" style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}>Submit New Entry</h2>
            <EnquiryForm
              salesPersons={salesPersons}
              companies={companies}
              onSubmit={handleNewEntrySubmit}
              onCancel={() => setShowNewEntry(false)}
              officeAccess={access.officeAccess}
            />
          </div>
        </div>
      )}

      {showTaskDetail && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowTaskDetail(null); }}>
          <div className="w-full max-w-[660px] max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <TaskDetailModal
              entries={filteredEntries}
              entryId={showTaskDetail.entryId}
              focusStep={showTaskDetail.stepNum}
              access={access}
              visibleSteps={visibleSteps}
              onClose={() => setShowTaskDetail(null)}
              onSubmitStep={(entryId, stepNum, entry) => { setShowTaskDetail(null); openStepSubmit(entryId, stepNum, entry); }}
              onEditEntry={(entryId, entry) => { setShowTaskDetail(null); setShowEditForm({ entryId, entry }); }}
              email={email}
              onViewAttachment={(url) => { setSheetAttachmentUrl(url); setShowAttachmentSheet(true); }}
            />
          </div>
        </div>
      )}

      {showStepSubmit && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowStepSubmit(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <StepWorkflow
              entry={showStepSubmit.entry}
              stepNum={showStepSubmit.stepNum}
              onSubmit={(data) => handleStepSubmit(showStepSubmit.entryId, showStepSubmit.stepNum, data)}
              onCancel={() => setShowStepSubmit(null)}
            />
          </div>
        </div>
      )}

      {showEditForm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowEditForm(null); }}>
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold pb-3.5 mb-4" style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}>Edit Entry</h2>
            <EnquiryForm
              salesPersons={salesPersons}
              companies={companies}
              initialData={showEditForm.entry}
              onSubmit={(formData) => handleEditEntry(showEditForm.entryId, formData)}
              onCancel={() => setShowEditForm(null)}
              officeAccess={access.officeAccess}
            />
          </div>
        </div>
      )}

      {showAttachmentSheet && sheetAttachmentUrl && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowAttachmentSheet(false); }}>
          <div className="w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl overflow-hidden" style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Attachment Preview</h3>
              <button onClick={() => setShowAttachmentSheet(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm cursor-pointer" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>&#x2715;</button>
            </div>
            <div className="p-5 flex flex-col items-center gap-4">
              {sheetAttachmentUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ? (
                <img src={sheetAttachmentUrl} alt="Attachment" className="max-w-full max-h-[60vh] rounded-lg object-contain" />
              ) : sheetAttachmentUrl.match(/\.pdf$/i) ? (
                <iframe src={sheetAttachmentUrl} className="w-full h-[60vh] rounded-lg" title="PDF Preview" />
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>File preview not available for this type</p>
                </div>
              )}
              <a href={sheetAttachmentUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-md text-xs font-semibold text-white cursor-pointer" style={{ background: "var(--primary)" }}>Open in New Tab</a>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white z-[10000] shadow-lg max-w-[90vw] text-center" style={{ background: toast.type === "success" ? "var(--success)" : "var(--danger)" }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MY ACCESS BAR — the fix for "user can't see which step they are assigned"
// Aligned grid: fixed 96px label column, so all three rows line up perfectly.
// =============================================================================
function MyAccessBar({
  assignedSteps,
  viewOnlySteps,
  officeLabel,
  canFillForm,
}: {
  assignedSteps: number[];
  viewOnlySteps: number[];
  officeLabel: string;
  canFillForm: boolean;
}) {
  const nothingAssigned = assignedSteps.length === 0 && viewOnlySteps.length === 0;

  const StepChips = ({ steps, tone }: { steps: number[]; tone: "edit" | "view" }) => {
    if (steps.length === 0) {
      return <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>None</span>;
    }
    const color = tone === "edit" ? "var(--primary)" : "#7c3aed";
    const bg = tone === "edit" ? "rgba(37,99,235,0.08)" : "rgba(124,58,237,0.08)";
    return (
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded whitespace-nowrap"
            style={{ background: bg, border: `1px solid ${color}` }}
          >
            <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold shrink-0" style={{ background: color, color: "#ffffff" }}>
              {s}
            </span>
            <span className="text-[10px] font-semibold" style={{ color }}>{STEP_TITLES[s]}</span>
            <span className="text-[8px] font-bold" style={{ color, opacity: 0.75 }}>{tone === "edit" ? "EDIT" : "VIEW"}</span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="px-7 py-3" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>My Access</h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap" style={{ background: "rgba(124,58,237,0.10)", color: "#7c3aed", border: "1px solid #7c3aed" }}>
            Office: {officeLabel === "All" ? "All Offices" : officeLabel}
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
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

      
      {nothingAssigned && (
        <p className="text-[11px] mt-2 font-semibold" style={{ color: "var(--danger)" }}>
          No steps assigned yet. Ask your administrator to set your step access in the Admin panel (Users &#8594; Access).
        </p>
      )}
    </div>
  );
}

// =============================================================================
// TASK DETAIL MODAL
// =============================================================================
function TaskDetailModal({
  entries,
  entryId,
  focusStep,
  access,
  visibleSteps,
  onClose,
  onSubmitStep,
  onEditEntry,
  email,
  onViewAttachment,
}: {
  entries: Record<string, unknown>[];
  entryId: string;
  focusStep: number;
  access: UserAccess;
  visibleSteps: number[];
  onClose: () => void;
  onSubmitStep: (entryId: string, stepNum: number, entry: Record<string, unknown>) => void;
  onEditEntry: (entryId: string, entry: Record<string, unknown>) => void;
  email: string;
  onViewAttachment: (url: string) => void;
}) {
  const entry = entries.find((e) => String(e.Entry_ID) === String(entryId));
  if (!entry) return <p className="text-xs" style={{ color: "var(--text-muted)" }}>Entry not found</p>;

  const isSubmitter = String(entry.Submitted_By || "").toLowerCase() === email.toLowerCase();
  const isStopped = sheetBool(entry.Is_Stopped);

  let requirements: { itemName: string; quantity: number; unit: string }[] = [];
  try {
    const reqStr = entry.Requirements_JSON as string;
    if (reqStr) {
      const parsed = JSON.parse(reqStr);
      if (Array.isArray(parsed)) requirements = parsed;
    }
  } catch { /* ignore malformed JSON typed manually into the sheet */ }

  const po = getPurchaseOrderDetails(entry);
  const dispatch = getDispatchDetails(entry);
  const gatePassNo = getGatePassNo(entry);

  const cleanAttachmentUrl = (raw: string) => {
    const match = String(raw || "").match(/https?:\/\/(res\.cloudinary\.com|drive\.google\.com)[^\s[\],]+/);
    return match ? match[0] : String(raw || "");
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold truncate" style={{ color: "var(--text)" }}>{String(entry.Company_Name || "")}</h2>
          <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
            {String(entry.Entry_ID || "")} &#183; {String(entry.Name_of_Enquirer || "")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSubmitter && (
            <button onClick={() => onEditEntry(entryId, entry)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap" style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid var(--primary)" }}>
              Edit
            </button>
          )}
          <button onClick={onClose} className="text-lg cursor-pointer leading-none" style={{ color: "var(--text-muted)" }}>&#x2715;</button>
        </div>
      </div>

      {isStopped && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <p className="text-[11px] font-bold" style={{ color: "var(--danger)" }}>This process has been STOPPED.</p>
        </div>
      )}

      {/* PRIMARY INFORMATION */}
      <div className="space-y-0.5 mb-5 p-4 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <InfoRow label="Entry ID" value={String(entry.Entry_ID || "")} />
        <InfoRow label="Submitted on" value={formatSubmittedOn(entry.Timestamp)} />
        <InfoRow label="Submitted By" value={String(entry.Submitted_By || "")} />
        <InfoRow label="Location" value={String(entry.Location || "")} />
        <InfoRow label="Company" value={String(entry.Company_Name || "")} />
        <InfoRow label="Enquirer" value={String(entry.Name_of_Enquirer || "")} />
        <InfoRow label="Mobile" value={String(entry.Mobile_Number || "")} />
        <InfoRow label="Email" value={String(entry.Email_Id || "")} />
        {requirements.length > 0 && (
          <div className="flex items-start gap-2.5 py-1.5">
            <span className="text-[11px] font-semibold shrink-0" style={{ color: "var(--text-muted)", width: "118px" }}>Requirements</span>
            <div className="flex-1 min-w-0 space-y-0.5">
              {requirements.map((r, i) => (
                <div key={i} className="text-xs" style={{ color: "var(--text)" }}>
                  {r.itemName} &#8212; Qty: {r.quantity} {r.unit}
                </div>
              ))}
            </div>
          </div>
        )}
        <InfoRow label="Sales Person" value={String(entry.Sales_Person_Accountable || "")} />
        <InfoRow label="Sales Close Date" value={formatSheetDateOnly(entry.Sales_Close_Date)} />
        <InfoRow label="Type of Enquiry" value={String(entry.Type_of_Enquiry || "")} />
        <InfoRow label="Gate Pass No" value={gatePassNo} />
        <InfoRow label="Remark" value={String(entry.Remark || "")} />
      </div>

      {/* PURCHASE ORDER */}
      {po && (
        <div className="space-y-0.5 mb-5 p-4 rounded-lg" style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.18)" }}>
          <h3 className="text-[12px] font-bold mb-1.5" style={{ color: "var(--primary)" }}>Purchase Order Details</h3>
          <InfoRow label="PO Number" value={po.poNumber} />
          <InfoRow label="Location" value={po.location} />
          <InfoRow label="Q. No." value={po.qNo} />
          <InfoRow label="Delivery Date" value={formatSheetDateOnly(po.deliveryDate)} />
          <InfoRow label="Pay Terms" value={po.payTerms ? `${po.payTerms} days` : ""} />
        </div>
      )}

      {/* DISPATCH */}
      {dispatch && (
        <div className="space-y-0.5 mb-5 p-4 rounded-lg" style={{ background: "rgba(5,150,105,0.05)", border: "1px solid rgba(5,150,105,0.18)" }}>
          <h3 className="text-[12px] font-bold mb-1.5" style={{ color: "var(--success)" }}>Dispatch Details</h3>
          <InfoRow label="Mode" value={dispatch.mode} />
          <InfoRow label="Name" value={dispatch.name} />
          <InfoRow label="Mob No" value={dispatch.mobNo} />
          <InfoRow label="Invoice/Challan No" value={dispatch.invoiceChallanNo} />
          <InfoRow label="Gate Pass No" value={dispatch.gatePassNo} />
          <InfoRow label="LR No" value={dispatch.lrNo} />
        </div>
      )}

      {/* STEP PROGRESS */}
      <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>Step Progress</h3>

      {visibleSteps.length === 0 && (
        <p className="text-xs mb-4" style={{ color: "var(--danger)" }}>
          You have no visible steps. Contact your administrator.
        </p>
      )}

      <div className="space-y-0">
        {visibleSteps.map((s, stepIdx) => {
          const rawStatus = (entry[`Step_${s}_Status`] as string) || "Locked";
          const overall = getOverallStepStatus(entry, s);
          const pd = entry[`Step_${s}_Planned_Date`] as string | null;
          const ad = entry[`Step_${s}_Actual_Date`] as string | null;
          const completedBy = entry[`Step_${s}_Completed_By`] as string | null;
          const condAnswer = entry[`Step_${s}_Condition_Answer`] as string | null;
          const stepRemark = entry[`Step_${s}_Remark`] as string | null;
          const stepAttachment = entry[`Step_${s}_Attachment`] as string | null;
          const editable = canEditStep(access, s);
          const isFocus = s === focusStep;
          const isLastStep = stepIdx === visibleSteps.length - 1;
          const partial = isPartialStep(s);
          const summary = partial ? getStepPartSummary(entry, s) : null;

          const done = overall === "Completed";
          const active = overall === "Pending" || overall === "Partially Submitted";
          const canSubmitNow = editable && !isStopped && (partial ? !!summary?.isActionable : rawStatus === "Pending");

          return (
            <div key={s} className="flex gap-3.5 relative pb-5 last:pb-0">
              {!isLastStep && <div className="absolute left-[15px] top-[38px] bottom-0 w-0.5" style={{ background: "var(--border)" }} />}

              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10"
                style={{
                  background: done ? "var(--success)" : active ? "var(--primary)" : "var(--surface-3)",
                  color: done || active ? "#ffffff" : "var(--text-faint)",
                  border: rawStatus === "Locked" ? "2px solid var(--border)" : "none",
                }}
              >
                {done ? "\u2713" : s}
              </div>

              <div
                className="flex-1 min-w-0 rounded-xl p-3.5"
                style={{
                  background: isFocus ? "var(--primary-bg)" : "var(--surface-2)",
                  border: `1px solid ${isFocus ? "var(--primary)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>Step {s}: {STEP_TITLES[s]}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                      style={{
                        background: editable ? "rgba(37,99,235,0.10)" : "rgba(124,58,237,0.10)",
                        color: editable ? "var(--primary)" : "#7c3aed",
                        border: `1px solid ${editable ? "var(--primary)" : "#7c3aed"}`,
                      }}
                    >
                      {editable ? "EDIT" : "VIEW ONLY"}
                    </span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
                      style={{
                        background: done ? "rgba(5,150,105,0.08)" : active ? "rgba(217,119,6,0.1)" : "var(--surface-3)",
                        color: done ? "var(--success)" : active ? "#b45309" : "var(--text-faint)",
                      }}
                    >
                      {overall}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] space-y-1" style={{ color: "var(--text-muted)" }}>
                  {pd && <div><span className="font-semibold">Planned:</span> {formatDate(pd)}</div>}
                  {ad && <div><span className="font-semibold">Actual:</span> {formatDate(ad)}</div>}
                  {completedBy && <div className="truncate"><span className="font-semibold">By:</span> {completedBy}</div>}
                  {condAnswer && <div><span className="font-semibold">Status:</span> {condAnswer}</div>}
                  {stepRemark && <div><span className="font-semibold">Remark:</span> {stepRemark}</div>}

                  {stepAttachment && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {String(stepAttachment)
                        .split(/\s*,\s*/)
                        .filter((u) => u.trim())
                        .map((url, ai) => (
                          <button
                            key={ai}
                            type="button"
                            onClick={() => onViewAttachment(cleanAttachmentUrl(url))}
                            className="text-[10px] px-2 py-1 rounded cursor-pointer font-semibold whitespace-nowrap"
                            style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
                          >
                            View Attachment {ai + 1}
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Part wise breakdown for steps 7..10 */}
                  {summary && summary.allParts.length > 0 && (
                    <div className="mt-2 p-2 rounded-lg space-y-1" style={{ background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.14)" }}>
                      <div className="text-[10px] font-bold" style={{ color: "#b45309" }}>
                        {summary.submittedQuantity} of {summary.totalQuantity} submitted
                      </div>
                      {summary.allParts.map((part, pi) => (
                        <div key={pi} className="flex items-center justify-between flex-wrap gap-1.5 p-1.5 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                          <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: "var(--text)" }}>
                            Step {part.stepNumber} Part {part.partNumber}
                          </span>
                          <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                            Qty {part.status === "Pending" ? part.remainingQuantity : part.submittedQuantity} / {part.totalQuantity}
                          </span>
                          {part.reference && (
                            <span className="text-[9px] font-bold whitespace-nowrap" style={{ color: "var(--primary)" }}>Ref# {part.reference}</span>
                          )}
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                            style={{
                              background: part.status === "Completed" ? "rgba(5,150,105,0.1)" : "rgba(217,119,6,0.14)",
                              color: part.status === "Completed" ? "var(--success)" : "#b45309",
                            }}
                          >
                            {part.status}
                          </span>
                          {part.attachment && (
                            <button
                              type="button"
                              onClick={() => onViewAttachment(cleanAttachmentUrl(part.attachment))}
                              className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer font-semibold"
                              style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
                            >
                              View
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {canSubmitNow && (
                    <button
                      onClick={() => onSubmitStep(entryId, s, entry)}
                      className="mt-2 px-3 py-1.5 rounded-md text-[11px] font-semibold text-white cursor-pointer whitespace-nowrap"
                      style={{ background: "var(--success)" }}
                    >
                      {summary ? `Submit Step ${s} Part ${summary.nextPartNumber}` : "Submit Step"}
                    </button>
                  )}

                  {!editable && active && (
                    <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      This step is assigned to another user. You have read only access.
                    </p>
                  )}

                  {editable && partial && summary && !summary.isActionable && !summary.isFullySubmitted && (
                    <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      Waiting for Step {s - 1} to release quantity.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 text-right">
        <button onClick={onClose} className="px-4 py-2 rounded-md text-xs font-semibold cursor-pointer" style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
          Close
        </button>
      </div>
    </div>
  );
}

/** Fixed 118px label column so every detail row stays aligned. */
function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="text-[11px] font-semibold shrink-0" style={{ color: "var(--text-muted)", width: "118px" }}>{label}</span>
      <span className="text-xs font-medium flex-1 min-w-0 break-words" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

export default function UserPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "var(--bg)" }}>
          <div className="w-9 h-9 border-3 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
        </div>
      }
    >
      <UserDashboardContent />
    </Suspense>
  );
}
