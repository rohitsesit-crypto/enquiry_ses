"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getUserDashboardData, verifyUser, submitNewEntry, submitStep, updateEntry } from "../lib/api";
import { STEP_NAMES } from "../lib/types";
import { formatDate, isOverdue, isToday, cn, parseDateString } from "../lib/utils";
import EnquiryForm from "../components/EnquiryForm";
import StepWorkflow from "../components/StepWorkflow";

function UserDashboardContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [dashboardData, setDashboardData] = useState<Record<string, unknown> | null>(null);
  const [currentSection, setCurrentSection] = useState<"pending" | "completed">("pending");
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState<{ entryId: string; stepNum: number } | null>(null);
  const [showStepSubmit, setShowStepSubmit] = useState<{ entryId: string; stepNum: number; entry: Record<string, unknown> } | null>(null);
  const [showEditForm, setShowEditForm] = useState<{ entryId: string; entry: Record<string, unknown> } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [sheetAttachmentUrl, setSheetAttachmentUrl] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [submittingStep, setSubmittingStep] = useState(false);

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
      }
    } catch {
      console.error("Failed to load data");
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

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!verified) return;
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [verified, loadData]);

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
    setSubmittingStep(true);
    try {
      const result = await submitStep(entryId, stepNum, email, data);
      if (result.success) {
        showToast(result.message || "Step completed!", "success");
        setShowStepSubmit(null);
        setShowTaskDetail(null);
        await loadData();
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    } finally {
      setSubmittingStep(false);
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

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-5" style={{ background: "var(--bg)" }}>
        <div className="text-center p-10 rounded-xl max-w-md" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--danger)" }}>Access Denied</h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!verified) return null;

  const entries = (dashboardData?.entries as Record<string, unknown>[]) || [];
  const assignedSteps = (() => {
    const raw = dashboardData?.assignedSteps;
    if (Array.isArray(raw)) return raw.map((s) => Number(s)).filter((n) => !isNaN(n));
    if (typeof raw === "string" && raw.trim()) return raw.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    return [];
  })();
  const canFillForm = dashboardData?.canFillForm as boolean;
  const canViewAllSteps = dashboardData?.canViewAllSteps === true || dashboardData?.canViewAllSteps === "TRUE" || dashboardData?.canViewAllSteps === "true";
  const salesPersons = (dashboardData?.salesPersons as string[]) || [];
  const companies = (dashboardData?.companies as Record<string, unknown>[]) || [];

  // Categorize tasks - ONLY show tasks for assigned steps
  const pendingTasks: { entry: Record<string, unknown>; stepNum: number; plannedDate: string | null }[] = [];
  const completedTasks: { entry: Record<string, unknown>; stepNum: number; actualDate: string | null }[] = [];

entries.forEach((entry) => {
  for (let s = 1; s <= 10; s++) {
    // If canViewAllSteps is true, show ALL steps
    // If canViewAllSteps is false, show ONLY assigned steps
    if (!canViewAllSteps && !assignedSteps.includes(s)) continue;
    
    const status = entry[`Step_${s}_Status`] as string;
    if (status === "Pending") {
      pendingTasks.push({
        entry,
        stepNum: s,
        plannedDate: entry[`Step_${s}_Planned_Date`] as string | null,
      });
    } else if (status === "Completed") {
      completedTasks.push({
        entry,
        stepNum: s,
        actualDate: entry[`Step_${s}_Actual_Date`] as string | null,
      });
    }
  }
});
// Group completed tasks by Entry_ID
const completedByEntry: Record<string, { entry: Record<string, unknown>; steps: { stepNum: number; actualDate: string | null }[] }> = {};

completedTasks.forEach((task) => {
  const entryId = String(task.entry.Entry_ID);
  if (!completedByEntry[entryId]) {
    completedByEntry[entryId] = { entry: task.entry, steps: [] };
  }
  completedByEntry[entryId].steps.push({ stepNum: task.stepNum, actualDate: task.actualDate });
});

// Sort steps within each entry
Object.values(completedByEntry).forEach((group) => {
  group.steps.sort((a, b) => a.stepNum - b.stepNum);
});

const completedEntries = Object.values(completedByEntry);


  // Group pending tasks by date
  const pendingByDate: Record<string, typeof pendingTasks> = {};
  pendingTasks.forEach((task) => {
    const dateKey = task.plannedDate ? parseDateString(task.plannedDate).toDateString() : "No Date";
    if (!pendingByDate[dateKey]) pendingByDate[dateKey] = [];
    pendingByDate[dateKey].push(task);
  });

  const sortedDateKeys = Object.keys(pendingByDate).sort((a, b) => {
    if (a === "No Date") return 1;
    if (b === "No Date") return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  });

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="flex items-center gap-3.5 px-6 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg object-contain" />
        <div>
          <h1 className="text-sm font-bold" style={{ color: "var(--text)" }}>Flowchart Monitoring System</h1>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Saraswat Engineering Services</p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md" style={{ color: "var(--text-faint)", background: "var(--surface-2)", border: "1px solid var(--border-light)" }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--success)" }} />
            <span>Live</span>
          </div>
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Welcome Bar */}
      <div className="px-7 py-4 text-white flex items-center justify-between flex-wrap gap-3" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #2563eb 100%)" }}>
        <div>
          <h2 className="text-lg font-bold">Enquiry Capture O2D</h2>
          <p className="text-xs opacity-80">Welcome, <strong>{userName}</strong></p>
        </div>
        <div className="flex items-center gap-2">
          {canFillForm && (
            <button
              onClick={() => setShowNewEntry(true)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white cursor-pointer"
              style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              + New Entry
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", opacity: refreshing ? 0.7 : 1 }}
          >
            {refreshing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Assigned Steps Info */}
      <div className="px-7 py-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Your authorized steps: {assignedSteps.length > 0 ? assignedSteps.map(s => `${s}. ${STEP_NAMES[s]}`).join(", ") : "None assigned"}
          {canViewAllSteps && <span className="ml-2 font-semibold" style={{ color: "var(--primary)" }}>• View + Edit Access</span>}
        </p>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 min-w-60 hidden md:flex flex-col overflow-y-auto" style={{ background: "var(--sidebar-bg)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider px-5 pt-5 pb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
            Navigation
          </div>
          <button
            onClick={() => setCurrentSection("pending")}
            className={cn(
              "flex items-center gap-2.5 px-4 py-2.5 mx-2 rounded-md text-[13px] font-medium transition-all cursor-pointer",
              currentSection === "pending" ? "font-semibold" : ""
            )}
            style={{
              color: currentSection === "pending" ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
              background: currentSection === "pending" ? "var(--sidebar-active-bg)" : "transparent",
            }}
          >
            <span>⏱️</span>
            <span>Pending Tasks</span>
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--primary)" }}>
              {pendingTasks.length}
            </span>
          </button>
          <button
            onClick={() => setCurrentSection("completed")}
            className={cn(
              "flex items-center gap-2.5 px-4 py-2.5 mx-2 rounded-md text-[13px] font-medium transition-all cursor-pointer",
              currentSection === "completed" ? "font-semibold" : ""
            )}
            style={{
              color: currentSection === "completed" ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
              background: currentSection === "completed" ? "var(--sidebar-active-bg)" : "transparent",
            }}
          >
            <span>✅</span>
            <span>Completed</span>
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--success)" }}>
              {completedTasks.length}
            </span>
          </button>

        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
          <div className="p-6 max-w-[1400px]">
            {currentSection === "pending" && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
                    Pending Tasks
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--primary)" }}>
                      {pendingTasks.length}
                    </span>
                  </h3>
                </div>

                {pendingTasks.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <div className="text-4xl mb-3">🎉</div>
                    <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>All Caught Up!</h3>
                    <p className="text-xs">No pending tasks for your assigned steps.</p>
                  </div>
                ) : (
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {sortedDateKeys.map((dateKey) => {
                      const tasks = pendingByDate[dateKey];
                      const dateObj = dateKey !== "No Date" ? new Date(dateKey) : null;
                      const isTodayDate = dateObj ? isToday(dateObj.toISOString()) : false;
                      const isOverdueDate = dateObj ? isOverdue(dateObj.toISOString()) : false;

                      return (
                        <div key={dateKey} className="min-w-[320px] max-w-[380px] flex-1 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                          <div className="px-4 py-3.5" style={{ borderBottom: `2px solid ${isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : "var(--primary)"}` }}>
                            <div className="flex items-center gap-2.5">
                              <div className="text-lg">{isOverdueDate ? "🔴" : isTodayDate ? "🟡" : "📅"}</div>
                              <div className="flex-1">
                                <h3 className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                                  {dateObj ? formatDate(dateObj) : "No Date"}
                                  {isTodayDate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white uppercase">TODAY</span>}
                                  {isOverdueDate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white uppercase">OVERDUE</span>}
                                </h3>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{tasks.length} task(s)</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-2.5 flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                            {tasks.map((task, idx) => {
                              const entryLabel = `${String(task.entry.Company_Name || "")} · ${String(task.entry.Name_of_Enquirer || "")}`;

                              return (
                                <div
                                  key={`${String(task.entry.Entry_ID)}-${task.stepNum}-${idx}`}
                                  onClick={() => setShowTaskDetail({ entryId: String(task.entry.Entry_ID), stepNum: task.stepNum })}
                                  className="p-3 rounded-lg cursor-pointer transition-all hover:shadow-md"
                                  style={{
                                    background: "var(--surface-2)",
                                    border: "1px solid var(--border-light)",
                                    borderLeft: `3px solid ${isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : "var(--primary)"}`,
                                  }}
                                >
                                  <div className="flex items-center gap-2.5 mb-2">
                                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white" style={{ background: isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : "var(--primary)" }}>
                                      {task.stepNum}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>{entryLabel}</h4>
                                    </div>
                                  </div>
                                 <div className="text-[11px] flex flex-wrap gap-1.5" style={{ color: "var(--text-muted)" }}>
  <span>{STEP_NAMES[task.stepNum]}</span>
  {assignedSteps.includes(task.stepNum) ? (
    <span className="font-semibold" style={{ color: "var(--primary)" }}>• Assigned to you</span>
  ) : (
    <span className="font-semibold" style={{ color: "var(--text-faint)" }}>• View Only</span>
  )}
</div>

                                  {(typeof task.entry.Challan_Number === "string" ||
  typeof task.entry.Challan_Number === "number") && (
  <div
    className="text-[10px] mt-1 font-semibold"
    style={{ color: "var(--primary)" }}
  >
    Challan: {String(task.entry.Challan_Number)}
  </div>
)}
                                  {assignedSteps.includes(task.stepNum) && (
  <div className="flex justify-end mt-2.5">
    <button
      onClick={(e) => {
        e.stopPropagation();
        setShowStepSubmit({ entryId: String(task.entry.Entry_ID), stepNum: task.stepNum, entry: task.entry });
      }}
      className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white cursor-pointer"
      style={{ background: "var(--success)" }}
    >
      Submit
    </button>
  </div>
)}

                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {currentSection === "completed" && (
  <div>
    <div className="flex items-center justify-between mb-5">
      <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
        Completed Entries
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--success)" }}>
          {completedEntries.length}
        </span>
      </h3>
    </div>

    {completedEntries.length === 0 ? (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>No Completed Entries</h3>
        <p className="text-xs">Completed entries will appear here.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {completedEntries.map((group, idx) => {
const entryLabel = String(group.entry.Company_Name || "") + " · " + String(group.entry.Name_of_Enquirer || "");
          const latestDate = group.steps[group.steps.length - 1]?.actualDate;
          return (
            <div
              key={idx}
              onClick={() => setShowTaskDetail({ entryId: String(group.entry.Entry_ID), stepNum: group.steps[0].stepNum })}
              className="p-4 rounded-xl cursor-pointer transition-all hover:shadow-md"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid var(--success)" }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "var(--success)" }}>✓</div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-bold truncate" style={{ color: "var(--text)" }}>{entryLabel}</h4>
                  {(typeof group.entry.Challan_Number === "string" ||
  typeof group.entry.Challan_Number === "number") && (
  <span
    className="text-[10px] font-bold"
    style={{ color: "var(--primary)" }}
  >
    Challan: {String(group.entry.Challan_Number)}
  </span>
)}
                </div>
              </div>
              
              {/* Show completed steps as badges */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {group.steps.map((step) => (
                  <span key={step.stepNum} className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: "rgba(5,150,105,0.08)", color: "var(--success)" }}>
                    {step.stepNum}. {STEP_NAMES[step.stepNum]}
                  </span>
                ))}
              </div>

              {/* Last completed date */}
              {latestDate && (
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Last completed: {formatDate(latestDate)}
                </div>
              )}

              <div className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
                {group.steps.length} step(s) completed
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}


          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{ background: "var(--sidebar-bg)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex justify-around items-center py-2">
          <button onClick={() => setCurrentSection("pending")} className={cn("flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-md text-[10px] font-semibold cursor-pointer", currentSection === "pending" ? "text-white" : "")} style={{ color: currentSection === "pending" ? "#fff" : "var(--sidebar-text)", background: currentSection === "pending" ? "var(--sidebar-active-bg)" : "transparent" }}>
            <span>⏱️</span>
            <span>Pending</span>
          </button>
          <button onClick={() => setCurrentSection("completed")} className={cn("flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-md text-[10px] font-semibold cursor-pointer", currentSection === "completed" ? "text-white" : "")} style={{ color: currentSection === "completed" ? "#fff" : "var(--sidebar-text)", background: currentSection === "completed" ? "var(--sidebar-active-bg)" : "transparent" }}>
            <span>✅</span>
            <span>Completed</span>
          </button>

        </div>
      </div>

      {/* New Entry Modal */}
      {showNewEntry && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowNewEntry(false); }}>
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold pb-3.5 mb-4" style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}>Submit New Entry</h2>
            <EnquiryForm
              salesPersons={salesPersons}
              companies={companies}
              onSubmit={handleNewEntrySubmit}
              onCancel={() => setShowNewEntry(false)}
            />
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {showTaskDetail && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowTaskDetail(null); }}>
          <div className="w-full max-w-[660px] max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <TaskDetailModal
              entries={entries}
              entryId={showTaskDetail.entryId}
              focusStep={showTaskDetail.stepNum}
              assignedSteps={assignedSteps}
              canViewAllSteps={canViewAllSteps}
              onClose={() => setShowTaskDetail(null)}
              onSubmitStep={(entryId, stepNum, entry) => { setShowTaskDetail(null); setShowStepSubmit({ entryId, stepNum, entry }); }}
              onEditEntry={(entryId, entry) => { setShowTaskDetail(null); setShowEditForm({ entryId, entry }); }}
              email={email}
              onViewAttachment={(url) => { setSheetAttachmentUrl(url); setShowAttachmentSheet(true); }}
            />
          </div>
        </div>
      )}

      {/* Step Submit Modal */}
      {showStepSubmit && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowStepSubmit(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <StepWorkflow
              entry={showStepSubmit.entry}
              stepNum={showStepSubmit.stepNum}
              onSubmit={(data) => handleStepSubmit(showStepSubmit.entryId, showStepSubmit.stepNum, data)}
              onCancel={() => setShowStepSubmit(null)}
              isSubmitting={submittingStep}
            />
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
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
            />
          </div>
        </div>
      )}

      {/* Attachment Sheet/Modal */}
      {showAttachmentSheet && sheetAttachmentUrl && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-5"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAttachmentSheet(false); }}
        >
          <div className="w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl overflow-hidden" style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>📎 Attachment Preview</h3>
              <button
                onClick={() => setShowAttachmentSheet(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm cursor-pointer"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>
            <div className="p-5 flex flex-col items-center gap-4">
              {sheetAttachmentUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ? (
                <img src={sheetAttachmentUrl} alt="Attachment" className="max-w-full max-h-[60vh] rounded-lg object-contain" />
              ) : sheetAttachmentUrl.match(/\.(pdf)$/i) ? (
                <iframe src={sheetAttachmentUrl} className="w-full h-[60vh] rounded-lg" title="PDF Preview" />
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>File preview not available for this type</p>
                </div>
              )}
              <a
                href={sheetAttachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-md text-xs font-semibold text-white cursor-pointer"
                style={{ background: "var(--primary)" }}
              >
                🔗 Open in New Tab
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white z-[10000] shadow-lg" style={{ background: toast.type === "success" ? "var(--success)" : "var(--danger)" }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}



// Task Detail Modal Component
function TaskDetailModal({
  entries,
  entryId,
  focusStep,
  assignedSteps,
  canViewAllSteps,
  onClose,
  onSubmitStep,
  onEditEntry,
  email,
  onViewAttachment,
}: {
  entries: Record<string, unknown>[];
  entryId: string;
  focusStep: number;
  assignedSteps: number[];
  canViewAllSteps: boolean;
  onClose: () => void;
  onSubmitStep: (entryId: string, stepNum: number, entry: Record<string, unknown>) => void;
  onEditEntry: (entryId: string, entry: Record<string, unknown>) => void;
  email: string;
  onViewAttachment: (url: string) => void;
}) {
  const entry = entries.find((e) => e.Entry_ID === entryId);
  if (!entry) return <p>Entry not found</p>;

  const entryLabel = `${String(entry.Company_Name || "")} · ${String(entry.Name_of_Enquirer || "")}`;
  const isSubmitter = String(entry.Submitted_By || "").toLowerCase() === email.toLowerCase();

  // Parse requirements
  let requirements: { itemName: string; quantity: number; unit: string }[] = [];
  try {
    const reqStr = entry.Requirements_JSON as string;
    if (reqStr) requirements = JSON.parse(reqStr);
  } catch { /* ignore */ }

  // Parse PO form data
  let poData: { poNumber?: string; poLocation?: string; qNo?: string; deliveryDate?: string; payTerms?: number } | null = null;
  try {
    const poStr = entry.Step_4_PO_JSON as string;
    if (poStr) poData = JSON.parse(poStr);
  } catch { /* ignore */ }

  // Parse Dispatch form data
  let dispatchData: { dispatchMode?: string; dispatchName?: string; dispatchMobNo?: string; invoiceChallanNo?: string; lrNo?: string; gatePassNo?: string } | null = null;
  try {
    const dispStr = entry.Step_8_Dispatch_JSON as string;
    if (dispStr) dispatchData = JSON.parse(dispStr);
  } catch { /* ignore */ }

  // Determine which steps to show:
  // - If canViewAllSteps is true: show ALL steps (user can view all + edit their assigned ones)
  // - If canViewAllSteps is false: show ONLY the user's assigned steps
  const stepsToShow = canViewAllSteps
    ? Array.from({ length: 10 }, (_, i) => i + 1)
    : assignedSteps.sort((a, b) => a - b);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{entryLabel}</h2>
          {typeof entry.Challan_Number === "string" && entry.Challan_Number && (
  <span
    className="text-[11px] font-bold px-2 py-0.5 rounded mt-1 inline-block"
    style={{
      background: "var(--primary-bg)",
      color: "var(--primary)",
    }}
  >
    Challan: {entry.Challan_Number}
  </span>
)}
        </div>
        <div className="flex items-center gap-2">
          {isSubmitter && (
            <button
              onClick={() => onEditEntry(entryId, entry)}
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer"
              style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid var(--primary)" }}
            >
              ✏️ Edit
            </button>
          )}
          <button onClick={onClose} className="text-lg cursor-pointer" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
      </div>

      {/* Entry Info */}
      <div className="space-y-2 mb-6 p-4 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        {!!entry.Location && <InfoRow label="Location" value={String(entry.Location)} />}
        {!!entry.Company_Name && <InfoRow label="Company" value={String(entry.Company_Name)} />}
        {!!entry.Name_of_Enquirer && <InfoRow label="Enquirer" value={String(entry.Name_of_Enquirer)} />}
        {!!entry.Mobile_Number && <InfoRow label="Mobile" value={String(entry.Mobile_Number)} />}
        {!!entry.Email_Id && <InfoRow label="Email" value={String(entry.Email_Id)} />}
        {requirements.length > 0 && (
          <div className="py-2">
            <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>Requirements:</span>
            <div className="mt-1 space-y-1">
              {requirements.map((r, i) => (
                <div key={i} className="text-xs" style={{ color: "var(--text)" }}>
                  {r.itemName} - Qty: {r.quantity} {r.unit}
                </div>
              ))}
            </div>
          </div>
        )}
        {!!entry.Sales_Person_Accountable && <InfoRow label="Sales Person" value={String(entry.Sales_Person_Accountable)} />}
        {!!entry.Type_of_Enquiry && <InfoRow label="Type" value={String(entry.Type_of_Enquiry)} />}
        {!!entry.Remark && <InfoRow label="Remark" value={String(entry.Remark)} />}
      </div>

      {/* PO Form Details in History */}
      {poData && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
          <h5 className="text-[11px] font-bold mb-2 flex items-center gap-1.5" style={{ color: "var(--primary)" }}>
            📋 Purchase Order Details
          </h5>
          <div className="grid grid-cols-2 gap-2">
            {poData.poNumber && <InfoRow label="PO Number" value={poData.poNumber} />}
            {poData.poLocation && <InfoRow label="Location" value={poData.poLocation} />}
            {poData.qNo && <InfoRow label="Q.No." value={poData.qNo} />}
            {poData.deliveryDate && <InfoRow label="Delivery Date" value={formatDate(poData.deliveryDate)} />}
            {poData.payTerms && <InfoRow label="Pay Terms" value={poData.payTerms + " days"} />}
          </div>
        </div>
      )}

      {/* Dispatch Form Details in History */}
      {dispatchData && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(5,150,105,0.04)", border: "1px solid rgba(5,150,105,0.12)" }}>
          <h5 className="text-[11px] font-bold mb-2 flex items-center gap-1.5" style={{ color: "var(--success)" }}>
            🚚 Dispatch Details
          </h5>
          <div className="grid grid-cols-2 gap-2">
            {dispatchData.dispatchMode && <InfoRow label="Mode" value={dispatchData.dispatchMode} />}
            {dispatchData.dispatchName && <InfoRow label="Name" value={dispatchData.dispatchName} />}
            {dispatchData.dispatchMobNo && <InfoRow label="Mobile" value={dispatchData.dispatchMobNo} />}
            {dispatchData.invoiceChallanNo && <InfoRow label="Invoice/Challan" value={dispatchData.invoiceChallanNo} />}
            {dispatchData.gatePassNo && <InfoRow label="Gate Pass" value={dispatchData.gatePassNo} />}
            {dispatchData.lrNo && <InfoRow label="LR No" value={dispatchData.lrNo} />}
          </div>
        </div>
      )}

      {/* Step Progress */}
      <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>
        {canViewAllSteps ? "Step Progress (View + Edit Access)" : "Step Progress (Your Authorized Steps)"}
      </h3>
      <div className="space-y-0">
        {stepsToShow.map((s, stepIdx) => {
          const status = (entry[`Step_${s}_Status`] as string) || "Locked";
          const pd = entry[`Step_${s}_Planned_Date`] as string | null;
          const ad = entry[`Step_${s}_Actual_Date`] as string | null;
          const delay = entry[`Step_${s}_Delay_Days`] as number | null;
          const completedBy = entry[`Step_${s}_Completed_By`] as string | null;
          const condAnswer = entry[`Step_${s}_Condition_Answer`] as string | null;
          const stepAttachment = entry[`Step_${s}_Attachment`] as string | null;
          const isAssigned = assignedSteps.includes(s);
          const isFocus = s === focusStep;
          const isLastStep = stepIdx === stepsToShow.length - 1;

          return (
            <div key={s} className="flex gap-3.5 relative pb-5 last:pb-0">
              {!isLastStep && <div className="absolute left-[15px] top-[38px] bottom-0 w-0.5" style={{ background: "var(--border)" }} />}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 z-10"
                style={{
                  background: status === "Completed" ? "var(--success)" : status === "Pending" ? "var(--primary)" : "var(--surface-3)",
                  color: status === "Completed" || status === "Pending" ? "white" : "var(--text-faint)",
                  border: status === "Locked" ? "2px solid var(--border)" : "none",
                }}
              >
                {status === "Completed" ? "✓" : status === "Stopped" ? "🛑" : s}
              </div>
              <div
                className="flex-1 rounded-xl p-3.5"
                style={{
                  background: isFocus ? "var(--primary-bg)" : "var(--surface-2)",
                  border: `1px solid ${isFocus ? "var(--primary)" : isAssigned ? "var(--primary)" : "var(--border)"}`,
                  opacity: isAssigned ? 1 : 0.6,
                }}
              >
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                  <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                    {STEP_NAMES[s]}
                    {isAssigned && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>Your Step</span>}
                    {!isAssigned && canViewAllSteps && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--surface-3)", color: "var(--text-faint)" }}>View Only</span>}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{
                    background: status === "Completed" ? "rgba(5,150,105,0.08)" : status === "Pending" ? "rgba(217,119,6,0.08)" : status === "Stopped" ? "rgba(220,38,38,0.08)" : "var(--surface-3)",
                    color: status === "Completed" ? "var(--success)" : status === "Pending" ? "#b45309" : status === "Stopped" ? "var(--danger)" : "var(--text-faint)",
                  }}>
                    {status}
                  </span>
                </div>
                <div className="text-[11px] space-y-1" style={{ color: "var(--text-muted)" }}>
                  {status === "Completed" && (
                    <>
                      {pd && <div><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Planned:</span> {formatDate(pd)}</div>}
                      {ad && <div><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Actual:</span> {formatDate(ad)}</div>}
                      {completedBy && <div><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>By:</span> {completedBy}</div>}
                      {delay !== null && delay > 0 && <div style={{ color: "var(--danger)", fontWeight: 700 }}>{delay} days delayed</div>}
                      {condAnswer && <div><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Answer:</span> {condAnswer}</div>}
                      {stepAttachment && (
                        <button
                          type="button"
                          onClick={() => onViewAttachment(stepAttachment)}
                          className="mt-1 text-[10px] px-2 py-1 rounded cursor-pointer font-semibold inline-flex items-center gap-1"
                          style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
                        >
                          📎 View Attachment
                        </button>
                      )}
                    </>
                  )}
                  {status === "Pending" && (
                    <>
                      {pd && <div><span className="font-semibold" style={{ color: "var(--primary)" }}>Planned:</span> {formatDate(pd)}</div>}
                      {isAssigned && (
                        <button
                          onClick={() => onSubmitStep(entryId, s, entry)}
                          className="mt-2 px-3 py-1.5 rounded-md text-[11px] font-semibold text-white cursor-pointer"
                          style={{ background: "var(--success)" }}
                        >
                          Submit Step
                        </button>
                      )}
                    </>
                  )}
                  {status === "Stopped" && (
                    <div className="p-2.5 rounded-md" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
                      <span className="text-xs font-bold" style={{ color: "var(--danger)" }}>🛑 Process Stopped</span>
                    </div>
                  )}
                  {status === "Locked" && s > 1 && (
                    <div style={{ color: "var(--text-faint)" }}>Waiting for {STEP_NAMES[s - 1]} to complete</div>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="text-[11px] font-semibold min-w-[100px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

export default function UserPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "var(--bg)" }}>
        <div className="w-9 h-9 border-3 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    }>
      <UserDashboardContent />
    </Suspense>
  );
}
