"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getUserDashboardData, verifyUser, submitNewEntry, submitStep, updateEntry } from "../lib/api";
import { STEP_NAMES } from "../lib/types";
import { formatDate, formatDateOnly, formatStorageDate, isOverdue, isToday, cn, parseDateString } from "../lib/utils";
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
  const [currentSection, setCurrentSection] = useState<"pending" | "completed" | "all">("pending");
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
  const [editingEntry, setEditingEntry] = useState(false);
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

  // Auto-scroll to today's column when data loads
  useEffect(() => {
    if (!dashboardData || currentSection !== "pending") return;
    // Small delay to ensure DOM is rendered
    const timeout = setTimeout(() => {
      if (todayColumnRef.current && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const todayEl = todayColumnRef.current;
        // Scroll so that today's column is near the left of the container
        const scrollLeft = todayEl.offsetLeft - container.offsetLeft - 16;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
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
    setEditingEntry(true);
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
    } finally {
      setEditingEntry(false);
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

  // Categorize tasks - Show ALL entries in pending, not just those with "Pending" status
const pendingTasks: { entry: Record<string, unknown>; stepNum: number; plannedDate: string | null }[] = [];
const completedTasks: { entry: Record<string, unknown>; stepNum: number; actualDate: string | null }[] = [];

entries.forEach((entry) => {
  const isCompleted = entry.Is_Completed === true || entry.Is_Completed === "true" || entry.Is_Completed === "TRUE";
  const isStopped = entry.Is_Stopped === true || entry.Is_Stopped === "true" || entry.Is_Stopped === "TRUE";
  
  let hasShownInPending = false;
  
  for (let s = 1; s <= 10; s++) {
    if (!canViewAllSteps && !assignedSteps.includes(s)) continue;
    
    const status = entry[`Step_${s}_Status`] as string;
    if (status === "Pending") {
      pendingTasks.push({
        entry,
        stepNum: s,
        plannedDate: entry[`Step_${s}_Planned_Date`] as string | null,
      });
      hasShownInPending = true;
    } else if (status === "Completed") {
      completedTasks.push({
        entry,
        stepNum: s,
        actualDate: entry[`Step_${s}_Actual_Date`] as string | null,
      });
    }
  }
  
  // If entry has no "Pending" step shown but is NOT completed/stopped, 
  // still show it in pending tasks at its current step
  if (!hasShownInPending && !isCompleted && !isStopped) {
    const currentStep = Number(entry.Current_Step) || 1;
    // Show at current step if user has access, otherwise show at first assigned step
    const stepToShow = (canViewAllSteps || assignedSteps.includes(currentStep)) 
      ? currentStep 
      : (assignedSteps.length > 0 ? assignedSteps[0] : currentStep);
    
    pendingTasks.push({
      entry,
      stepNum: stepToShow,
      plannedDate: entry[`Step_${stepToShow}_Planned_Date`] as string | null,
    });
  }
});


  // Search filter function
  const filterBySearch = (task: { entry: Record<string, unknown>; stepNum: number }) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const entryId = String(task.entry.Entry_ID || "").toLowerCase();
    const companyName = String(task.entry.Company_Name || "").toLowerCase();
    const enquirerName = String(task.entry.Name_of_Enquirer || "").toLowerCase();
    const challanNumber = String(task.entry.Challan_Number || "").toLowerCase();
    const location = String(task.entry.Location || "").toLowerCase();
    const salesPerson = String(task.entry.Sales_Person_Accountable || "").toLowerCase();
    const mobile = String(task.entry.Mobile_Number || "").toLowerCase();
    const emailId = String(task.entry.Email_Id || "").toLowerCase();
    const typeOfEnquiry = String(task.entry.Type_of_Enquiry || "").toLowerCase();
    const remark = String(task.entry.Remark || "").toLowerCase();
    const stepName = STEP_NAMES[task.stepNum]?.toLowerCase() || "";

    return (
      entryId.includes(query) ||
      companyName.includes(query) ||
      enquirerName.includes(query) ||
      challanNumber.includes(query) ||
      location.includes(query) ||
      salesPerson.includes(query) ||
      mobile.includes(query) ||
      emailId.includes(query) ||
      typeOfEnquiry.includes(query) ||
      remark.includes(query) ||
      stepName.includes(query)
    );
  };

  // Apply search filter
  const filteredPendingTasks = pendingTasks.filter(filterBySearch);
  const filteredCompletedTasks = completedTasks.filter(filterBySearch);

  // Group completed tasks by Entry_ID
  const completedByEntry: Record<string, { entry: Record<string, unknown>; steps: { stepNum: number; actualDate: string | null }[] }> = {};

  filteredCompletedTasks.forEach((task) => {
    const entryId = String(task.entry.Entry_ID);
    if (!completedByEntry[entryId]) {
      completedByEntry[entryId] = { entry: task.entry, steps: [] };
    }
    completedByEntry[entryId].steps.push({ stepNum: task.stepNum, actualDate: task.actualDate });
  });

  Object.values(completedByEntry).forEach((group) => {
    group.steps.sort((a, b) => a.stepNum - b.stepNum);
  });

  const completedEntries = Object.values(completedByEntry);

  // Helper to get relative date label
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

  // Group pending tasks by date
  const pendingByDate: Record<string, typeof filteredPendingTasks> = {};
  filteredPendingTasks.forEach((task) => {
    const dateKey = task.plannedDate ? formatStorageDate(task.plannedDate) || "No Date" : "No Date";
    if (!pendingByDate[dateKey]) pendingByDate[dateKey] = [];
    pendingByDate[dateKey].push(task);
  });

  // Sort: Latest first (future dates first → today → yesterday → older), No Date at end
  const sortedDateKeys = Object.keys(pendingByDate).sort((a, b) => {
    if (a === "No Date") return 1;
    if (b === "No Date") return -1;
    return parseDateString(b).getTime() - parseDateString(a).getTime();
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
            {/* Search Bar */}
            <div className="mb-5">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🔍</span>
                <input
                  type="text"
                  placeholder="Search by company, enquirer, entry ID, challan, location, step..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-xs cursor-pointer"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-[11px] mt-1.5 ml-1" style={{ color: "var(--text-muted)" }}>
                  Showing results for &quot;<strong>{searchQuery}</strong>&quot; — {filteredPendingTasks.length} pending, {filteredCompletedTasks.length} completed
                </p>
              )}
            </div>

            {currentSection === "pending" && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
                    Pending Tasks
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "var(--primary)" }}>
                      {filteredPendingTasks.length}
                    </span>
                  </h3>
                </div>

                {filteredPendingTasks.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <div className="text-4xl mb-3">🎉</div>
                    <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>All Caught Up!</h3>
                    <p className="text-xs">No pending tasks for your assigned steps.</p>
                  </div>
                ) : (
                  <div ref={scrollContainerRef} className="flex gap-4 overflow-x-auto pb-4">
                    {sortedDateKeys.map((dateKey) => {
                      const tasks = pendingByDate[dateKey];
                      const dateObj = dateKey !== "No Date" ? parseDateString(dateKey) : null;
                      const isTodayDate = dateObj ? isToday(dateObj.toISOString()) : false;
                      const isOverdueDate = dateObj ? isOverdue(dateObj.toISOString()) : false;

                      return (
                        <div key={dateKey} ref={isTodayDate ? todayColumnRef : undefined} className={cn("min-w-[320px] max-w-[380px] flex-1 rounded-xl overflow-hidden", isTodayDate && "ring-2 ring-amber-400 shadow-lg shadow-amber-100/50")} style={{ border: isTodayDate ? "1.5px solid #f59e0b" : "1px solid var(--border)", background: "var(--surface)" }}>
                          <div className="px-4 py-3.5" style={{ borderBottom: `2px solid ${isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : "var(--primary)"}`, background: isTodayDate ? "rgba(245, 158, 11, 0.06)" : "transparent" }}>
                            <div className="flex items-center gap-2.5">
                              <div className="text-lg">{isOverdueDate ? "🔴" : isTodayDate ? "🟡" : dateObj && !isOverdue(dateObj.toISOString()) ? "🟢" : "📅"}</div>
                              <div className="flex-1">
                                <h3 className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                                  {getDateLabel(dateKey)}
                                  {dateObj && dateKey !== "No Date" && (
                                    <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
                                      ({formatDateOnly(dateObj)})
                                    </span>
                                  )}
                                  {isTodayDate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white uppercase">TODAY</span>}
                                  {isOverdueDate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white uppercase">OVERDUE</span>}
                                </h3>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{tasks.length} task(s)</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-2.5 flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                            {tasks.map((task, idx) => {
                              const entryLabel = `${String(task.entry.Entry_ID || "")} - ${String(task.entry.Company_Name || "")} · ${String(task.entry.Name_of_Enquirer || "")}`;
                              const taskLocation = String(task.entry.Location || "").toLowerCase();
                              const isMumbai = taskLocation === "mumbai";
                              const isBoisar = taskLocation === "boisar";

                              // Location-based colors
                              const locationColor = isMumbai ? "#0891b2" : isBoisar ? "#7c3aed" : "var(--primary)";
                              const locationBg = isMumbai ? "rgba(8, 145, 178, 0.06)" : isBoisar ? "rgba(124, 58, 237, 0.06)" : "var(--surface-2)";
                              const locationBorder = isMumbai ? "rgba(8, 145, 178, 0.25)" : isBoisar ? "rgba(124, 58, 237, 0.25)" : "1px solid var(--border-light)";

                              // Determine card colors: overdue/today take priority, otherwise use location color
                              const cardBorderLeft = isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : locationColor;
                              const cardBg = isTodayDate ? "rgba(245, 158, 11, 0.04)" : locationBg;
                              const cardBorder = isTodayDate ? "1px solid rgba(245, 158, 11, 0.25)" : `1px solid ${locationBorder}`;
                              const badgeColor = isOverdueDate ? "var(--danger)" : isTodayDate ? "var(--warning)" : locationColor;

                              return (
                                <div
                                  key={`${String(task.entry.Entry_ID)}-${task.stepNum}-${idx}`}
                                  onClick={() => setShowTaskDetail({ entryId: String(task.entry.Entry_ID), stepNum: task.stepNum })}
                                  className={cn("p-3 rounded-lg cursor-pointer transition-all hover:shadow-md", isTodayDate && "ring-1 ring-amber-300/60")}
                                  style={{
                                    background: cardBg,
                                    border: cardBorder,
                                    borderLeft: `3px solid ${cardBorderLeft}`,
                                  }}
                                >
                                  <div className="flex items-center gap-2.5 mb-2">
                                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white" style={{ background: badgeColor }}>
                                      {task.stepNum}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>{entryLabel}</h4>
                                    </div>
                                    {(isMumbai || isBoisar) && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0" style={{ background: locationColor }}>
                                        {isMumbai ? "Mumbai" : "Boisar"}
                                      </span>
                                    )}
                                  </div>
                                  {!!task.entry.Timestamp && (
                                    <div className="text-[10px] mb-1" style={{ color: "var(--text-faint)" }}>
                                      🕐 Submitted: {formatDate(String(task.entry.Timestamp))}
                                    </div>
                                  )}
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
                      const formTimestamp = group.entry.Timestamp ? String(group.entry.Timestamp) : "";
                      const compLocation = String(group.entry.Location || "").toLowerCase();
                      const compIsMumbai = compLocation === "mumbai";
                      const compIsBoisar = compLocation === "boisar";
                      const compLocationColor = compIsMumbai ? "#0891b2" : compIsBoisar ? "#7c3aed" : "var(--success)";

                      return (
                        <div
                          key={idx}
                          onClick={() => setShowTaskDetail({ entryId: String(group.entry.Entry_ID), stepNum: group.steps[0].stepNum })}
                          className="p-4 rounded-xl cursor-pointer transition-all hover:shadow-md"
                          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${compLocationColor}` }}
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
                            {(compIsMumbai || compIsBoisar) && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0" style={{ background: compLocationColor }}>
                                {compIsMumbai ? "Mumbai" : "Boisar"}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {group.steps.map((step) => (
                              <span key={step.stepNum} className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: "rgba(5,150,105,0.08)", color: "var(--success)" }}>
                                {step.stepNum}. {STEP_NAMES[step.stepNum]}
                              </span>
                            ))}
                          </div>

                          {formTimestamp && (
                            <div className="text-[10px] mb-1" style={{ color: "var(--text-faint)" }}>
                              🕐 Submitted: {formatDate(formTimestamp)}
                            </div>
                          )}

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

            {currentSection === "all" && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
                    All Entries
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: "#6366f1" }}>
                      {entries.length}
                    </span>
                  </h3>
                </div>

                {entries.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                    <h3 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>No Entries</h3>
                    <p className="text-xs">No entries found in the system.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries.map((entry, idx) => {
                      const entryLabel = `${String(entry.Entry_ID || "")} - ${String(entry.Company_Name || "")} · ${String(entry.Name_of_Enquirer || "")}`;
                      const currentStep = Number(entry.Current_Step) || 1;
                      const isCompleted = entry.Is_Completed === true || entry.Is_Completed === "true" || entry.Is_Completed === "TRUE";
                      const isStopped = entry.Is_Stopped === true || entry.Is_Stopped === "true" || entry.Is_Stopped === "TRUE";

                      return (
                        <div
                          key={idx}
                          onClick={() => setShowTaskDetail({ entryId: String(entry.Entry_ID), stepNum: currentStep })}
                          className="p-4 rounded-xl cursor-pointer transition-all hover:shadow-md"
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderLeft: `4px solid ${isCompleted ? "var(--success)" : isStopped ? "var(--danger)" : "var(--primary)"}`,
                          }}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ background: isCompleted ? "var(--success)" : isStopped ? "var(--danger)" : "var(--primary)" }}
                            >
                              {isCompleted ? "✓" : isStopped ? "✕" : currentStep}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-bold truncate" style={{ color: "var(--text)" }}>{entryLabel}</h4>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                                  background: isCompleted ? "rgba(5,150,105,0.08)" : isStopped ? "rgba(220,38,38,0.08)" : "rgba(37,99,235,0.06)",
                                  color: isCompleted ? "var(--success)" : isStopped ? "var(--danger)" : "var(--primary)",
                                }}>
                                  {isCompleted ? "Completed" : isStopped ? "Stopped" : `Step ${currentStep}: ${STEP_NAMES[currentStep] || ""}`}
                                </span>
                                {(typeof entry.Challan_Number === "string" || typeof entry.Challan_Number === "number") && String(entry.Challan_Number).trim() && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
                                    Challan: {String(entry.Challan_Number)}
                                  </span>
                                )}
                                {!!entry.Type_of_Enquiry && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                                    {String(entry.Type_of_Enquiry)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Entry Details Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 mt-3 pl-11">
                            {!!entry.Location && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Location:</span> {String(entry.Location)}
                              </div>
                            )}
                            {!!entry.Mobile_Number && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Mobile:</span> {String(entry.Mobile_Number)}
                              </div>
                            )}
                            {!!entry.Email_Id && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Email:</span> {String(entry.Email_Id)}
                              </div>
                            )}
                            {!!entry.Sales_Person_Accountable && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Sales Person:</span> {String(entry.Sales_Person_Accountable)}
                              </div>
                            )}
                            {!!entry.Sales_Close_Date && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Close Date:</span> {formatDateOnly(String(entry.Sales_Close_Date))}
                              </div>
                            )}
                            {!!entry.Remark && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Remark:</span> {String(entry.Remark)}
                              </div>
                            )}
                            {!!entry.Submitted_By && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Submitted By:</span> {String(entry.Submitted_By)}
                              </div>
                            )}
                            {!!entry.Timestamp && (
                              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Submitted:</span> {formatDate(String(entry.Timestamp))}
                              </div>
                            )}
                          </div>

                          {/* Step Progress Summary */}
                          <div className="flex flex-wrap gap-1 mt-3 pl-11">
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => {
                              const stepStatus = entry[`Step_${s}_Status`] as string;
                              if (!stepStatus || stepStatus === "Locked" || stepStatus === "Skipped") return null;
                              return (
                                <span
                                  key={s}
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                  style={{
                                    background: stepStatus === "Completed" ? "rgba(5,150,105,0.08)" : stepStatus === "Pending" ? "rgba(217,119,6,0.08)" : "rgba(220,38,38,0.08)",
                                    color: stepStatus === "Completed" ? "var(--success)" : stepStatus === "Pending" ? "#b45309" : "var(--danger)",
                                  }}
                                >
                                  {s}. {STEP_NAMES[s]} ({stepStatus})
                                </span>
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
          <button onClick={() => setCurrentSection("all")} className={cn("flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-md text-[10px] font-semibold cursor-pointer", currentSection === "all" ? "text-white" : "")} style={{ color: currentSection === "all" ? "#fff" : "var(--sidebar-text)", background: currentSection === "all" ? "var(--sidebar-active-bg)" : "transparent" }}>
            <span>📋</span>
            <span>All</span>
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
  if (!poData) {
    const poNumber = entry.Step_4_PO_Number as string;
    const poLocation = entry.Step_4_PO_Location as string;
    const qNo = entry.Step_4_PO_QNo as string;
    const deliveryDate = entry.Step_4_PO_Delivery_Date as string;
    const payTerms = entry.Step_4_PO_PayTerms;
    if (poNumber || poLocation || qNo || deliveryDate || payTerms) {
      poData = {
        poNumber: poNumber || undefined,
        poLocation: poLocation || undefined,
        qNo: qNo || undefined,
        deliveryDate: deliveryDate || undefined,
        payTerms: payTerms ? Number(payTerms) : undefined,
      };
    }
  }

  // Parse Dispatch form data
  let dispatchData: { dispatchMode?: string; dispatchName?: string; dispatchMobNo?: string; invoiceChallanNo?: string; lrNo?: string; gatePassNo?: string } | null = null;
  try {
    const dispStr = entry.Step_8_Dispatch_JSON as string;
    if (dispStr) dispatchData = JSON.parse(dispStr);
  } catch { /* ignore */ }
  if (!dispatchData) {
    const dispatchMode = entry.Step_8_Dispatch_Mode as string;
    const dispatchName = entry.Step_8_Dispatch_Name as string;
    const dispatchMobNo = entry.Step_8_Dispatch_MobNo as string;
    const invoiceChallanNo = entry.Step_8_Dispatch_InvoiceChallanNo as string;
    const gatePassNo = entry.Step_8_Dispatch_GatePassNo as string;
    const lrNo = entry.Step_8_Dispatch_LRNo as string;
    if (dispatchMode || dispatchName || dispatchMobNo || invoiceChallanNo || gatePassNo || lrNo) {
      dispatchData = {
        dispatchMode: dispatchMode || undefined,
        dispatchName: dispatchName || undefined,
        dispatchMobNo: dispatchMobNo || undefined,
        invoiceChallanNo: invoiceChallanNo || undefined,
        gatePassNo: gatePassNo || undefined,
        lrNo: lrNo || undefined,
      };
    }
  }

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
        {!!entry.Timestamp && <InfoRow label="Submitted On" value={formatDate(String(entry.Timestamp))} />}
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
        {!!entry.Sales_Close_Date && <InfoRow label="Sales Close Date" value={formatDateOnly(String(entry.Sales_Close_Date))} />}
        {!!entry.Type_of_Enquiry && <InfoRow label="Type" value={String(entry.Type_of_Enquiry)} />}
        {!!entry.Remark && <InfoRow label="Remark" value={String(entry.Remark)} />}
        {!!entry.Submitted_By && <InfoRow label="Submitted By" value={String(entry.Submitted_By)} />}
      </div>

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
                          onClick={() => {
                            let cleanUrl = stepAttachment;
                            const urlMatch = stepAttachment.match(/https?:\/\/(res\.cloudinary\.com|drive\.google\.com|lh3\.googleusercontent\.com)[^\s\[\]]+/);
                            if (urlMatch) {
                              cleanUrl = urlMatch[0];
                            }
                            onViewAttachment(cleanUrl);
                          }}
                          className="mt-1 text-[10px] px-2 py-1 rounded cursor-pointer font-semibold inline-flex items-center gap-1"
                          style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
                        >
                          📎 View Attachment
                        </button>
                      )}

                      {/* Step 4: Show PO Form Details */}
                      {s === 4 && poData && (
                        <div className="mt-2 p-2.5 rounded-lg" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
                          <h6 className="text-[10px] font-bold mb-1.5" style={{ color: "var(--primary)" }}>📋 Purchase Order</h6>
                          <div className="grid grid-cols-2 gap-1">
                            {poData.poNumber && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>PO#:</span> {poData.poNumber}</div>}
                            {poData.poLocation && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Location:</span> {poData.poLocation}</div>}
                            {poData.qNo && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Q.No:</span> {poData.qNo}</div>}
                            {poData.deliveryDate && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Delivery:</span> {formatDate(poData.deliveryDate)}</div>}
                            {poData.payTerms && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Pay Terms:</span> {poData.payTerms} days</div>}
                          </div>
                        </div>
                      )}

                      {/* Step 7: Show Invoice & Attachments */}
                      {s === 7 && (() => {
                        let invoices: { batch: number; date: string; submittedBy: string; items: { itemName: string; quantityReceived: number; totalQuantity: number; attachment: string; uploadedAt?: string }[] }[] = [];
                        try {
                          const invStr = entry.Step_7_Invoices_JSON as string;
                          if (invStr) invoices = JSON.parse(invStr);
                        } catch { /* ignore */ }
                        if (invoices.length === 0) return null;
                        return (
                          <div className="mt-2 p-2.5 rounded-lg" style={{ background: "rgba(217,119,6,0.04)", border: "1px solid rgba(217,119,6,0.12)" }}>
                            <h6 className="text-[10px] font-bold mb-1.5" style={{ color: "#d97706" }}>📦 Invoice Submissions ({invoices.length} batch{invoices.length > 1 ? "es" : ""})</h6>
                            {invoices.map((batch, bIdx) => (
                              <div key={bIdx} className="mb-1.5 p-1.5 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                                <div className="text-[9px] font-semibold mb-1" style={{ color: "var(--text-faint)" }}>
                                  Batch {batch.batch} - <span style={{ color: "var(--text-secondary)" }}>{formatDate(batch.date)}</span>
                                  {batch.submittedBy && <span className="ml-1">by {batch.submittedBy}</span>}
                                </div>
                                {(batch.items || []).map((item, iIdx) => (
                                  <div key={iIdx} className="flex items-center flex-wrap gap-2 py-0.5">
                                    <span className="text-[10px]" style={{ color: "var(--text)" }}>
                                      {item.itemName}: {item.quantityReceived}/{item.totalQuantity || "?"} received
                                    </span>
                                    {item.attachment && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          let cleanUrl = item.attachment;
                                          const urlMatch = item.attachment.match(/https?:\/\/(res\.cloudinary\.com|drive\.google\.com|lh3\.googleusercontent\.com)[^\s\[\]]+/);
                                          if (urlMatch) {
                                            cleanUrl = urlMatch[0];
                                          }
                                          onViewAttachment(cleanUrl);
                                        }}
                                        className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer font-semibold"
                                        style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
                                      >
                                        📎 View
                                      </button>
                                    )}
                                    {item.uploadedAt && (
                                      <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                                        ⏱️ {formatDate(item.uploadedAt)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Step 8: Show Dispatch Details */}
                      {s === 8 && dispatchData && (
                        <div className="mt-2 p-2.5 rounded-lg" style={{ background: "rgba(5,150,105,0.04)", border: "1px solid rgba(5,150,105,0.12)" }}>
                          <h6 className="text-[10px] font-bold mb-1.5" style={{ color: "var(--success)" }}>🚚 Dispatch Details</h6>
                          <div className="grid grid-cols-2 gap-1">
                            {dispatchData.dispatchMode && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Mode:</span> {dispatchData.dispatchMode}</div>}
                            {dispatchData.dispatchName && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Name:</span> {dispatchData.dispatchName}</div>}
                            {dispatchData.dispatchMobNo && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Mobile:</span> {dispatchData.dispatchMobNo}</div>}
                            {dispatchData.invoiceChallanNo && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Invoice/Challan:</span> {dispatchData.invoiceChallanNo}</div>}
                            {dispatchData.gatePassNo && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Gate Pass:</span> {dispatchData.gatePassNo}</div>}
                            {dispatchData.lrNo && <div className="text-[10px]"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>LR No:</span> {dispatchData.lrNo}</div>}
                          </div>
                        </div>
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
