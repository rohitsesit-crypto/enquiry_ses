"use client";
import FormSubmissionsModule from "../components/FormSubmissionsModule";
import { parseStepList, ALL_STEPS, readUserAccess } from "../lib/accessControl";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getAdminData, addUser, bulkAddUsers, updateUserAccess, addSalesPerson, removeSalesPerson, generateUserLink, getHolidaysAndSundays } from "../lib/api";
import { STEP_NAMES } from "../lib/types";
import type { SyncState, SyncNotification, HolidayEntry } from "../lib/types";
import { createSyncManager, DataSyncManager } from "../lib/dataSync";
import { formatRelativeTime } from "../lib/utils";
import { StepAccessCell, OfficeAccessCell, AccessFlagsCell } from "../components/UserAccessCells";

// =============================================================================
// CHANGE 3
//  1) The per-user "Generate Link" button is BACK in the Actions column.
//  2) Step access now supports three real states, chosen independently:
//         Edit only  |  View only  |  Both (Edit + View)
//     The View checkbox is no longer disabled when Edit is ticked, so a step can
//     be Edit only, View only, or Both, and the saved View list keeps the
//     "Both" steps as well.
//  3) When the Access modal opens, Office Access and the raw View list are also
//     loaded from the user row (previously Office Access stayed empty).
// =============================================================================

type StepMode = "edit" | "view" | "both" | "hidden";

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailFromUrl);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adminData, setAdminData] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "sales" | "entries" | "forms" | "holidays">("users");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserMobile, setNewUserMobile] = useState("");

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [newSalesPerson, setNewSalesPerson] = useState("");

  const [editingUser, setEditingUser] = useState<Record<string, unknown> | null>(null);
  const [editSteps, setEditSteps] = useState<number[]>([]);
  const [editCanFillForm, setEditCanFillForm] = useState(false);
  const [editCanViewAllSteps, setEditCanViewAllSteps] = useState(false);
  const [editOfficeAccess, setEditOfficeAccess] = useState<string>("");
  const [editViewSteps, setEditViewSteps] = useState<number[]>([]);

  const [generatedLink, setGeneratedLink] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [addingSalesPerson, setAddingSalesPerson] = useState(false);
  const [removingSalesPerson, setRemovingSalesPerson] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);

  // Holidays & Sundays state
  const [holidaysData, setHolidaysData] = useState<{ holidays: HolidayEntry[]; sundays: string[] }>({ holidays: [], sundays: [] });
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  // Real-time sync state
  const [syncState, setSyncState] = useState<SyncState>({
    lastSyncTime: null,
    isSyncing: false,
    syncError: null,
    dataHash: null,
  });
  const [syncNotifications, setSyncNotifications] = useState<SyncNotification[]>([]);
  const syncManagerRef = useRef<DataSyncManager | null>(null);
  const [, setTick] = useState(0);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!authenticated || !email) return;

    const manager = createSyncManager({
      fetchFn: () => getAdminData(email) as Promise<Record<string, unknown>>,
      onData: (data) => {
        setAdminData(data);
      },
      onNotification: (notification) => {
        setSyncNotifications((prev) => [notification, ...prev].slice(0, 10));
        showToast("Sync: " + notification.message, "info");
      },
      onError: (error) => {
        console.error("Sync error:", error);
      },
      onStateChange: (state) => {
        setSyncState(state);
      },
      config: {
        pollInterval: 5000,
        showNotifications: true,
        maxNotifications: 10,
        enabled: true,
      },
    });

    syncManagerRef.current = manager;
    manager.start();

    return () => {
      manager.destroy();
      syncManagerRef.current = null;
    };
  }, [authenticated, email]);

  const loadAdminData = useCallback(async (adminEmail: string) => {
    if (!adminEmail) return;
    try {
      const result = await getAdminData(adminEmail);
      if (result.success) {
        setAdminData(result as unknown as Record<string, unknown>);
        setAuthenticated(true);
      } else {
        showToast(result.message || "Not authorized as admin", "error");
      }
    } catch {
      showToast("Connection error. Check your Apps Script URL.", "error");
    }
  }, []);

  useEffect(() => {
    if (emailFromUrl) {
      setEmail(emailFromUrl);
      setLoading(true);
      loadAdminData(emailFromUrl).finally(() => setLoading(false));
    }
  }, [emailFromUrl, loadAdminData]);

  const handleLogin = async () => {
    if (!email.trim()) return;
    setLoading(true);
    await loadAdminData(email.trim());
    setLoading(false);
  };

  const handleManualRefresh = async () => {
    if (syncManagerRef.current) {
      await syncManagerRef.current.forceSync();
      showToast("Data refreshed from Google Sheet", "success");
    }
  };

  const loadHolidaysData = useCallback(async () => {
    setLoadingHolidays(true);
    try {
      const result = await getHolidaysAndSundays();
      if (result.success) {
        setHolidaysData({
          holidays: result.holidays || [],
          sundays: result.sundays || [],
        });
      }
    } catch {
      console.error("Failed to load holidays data");
    } finally {
      setLoadingHolidays(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "holidays" && authenticated && holidaysData.holidays.length === 0 && holidaysData.sundays.length === 0) {
      loadHolidaysData();
    }
  }, [activeTab, authenticated, holidaysData.holidays.length, holidaysData.sundays.length, loadHolidaysData]);

  const handleAddUser = async () => {
    if (!newUserEmail.trim() || !newUserName.trim()) {
      showToast("Email and Name are required", "error");
      return;
    }
    setAddingUser(true);
    try {
      const result = await addUser(email, { email: newUserEmail.trim(), name: newUserName.trim(), mobile: newUserMobile.trim() });
      if (result.success) {
        showToast("User added!", "success");
        setNewUserEmail("");
        setNewUserName("");
        setNewUserMobile("");
        syncManagerRef.current?.forceSync();
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    } finally {
      setAddingUser(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    setBulkUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim());
        const users: { email: string; name: string; mobile: string }[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
          if (cols[0]) {
            users.push({ email: cols[0], name: cols[1] || "", mobile: cols[2] || "" });
          }
        }
        if (users.length === 0) {
          showToast("No valid users found in file", "error");
          setBulkUploading(false);
          return;
        }
        const result = await bulkAddUsers(email, users);
        if (result.success) {
          showToast(String(result.count) + " users added!", "success");
          setBulkFile(null);
          syncManagerRef.current?.forceSync();
        } else {
          showToast(result.message || "Error", "error");
        }
      } catch {
        showToast("Error parsing file", "error");
      } finally {
        setBulkUploading(false);
      }
    };
    reader.readAsText(bulkFile);
  };

  const handleUpdateAccess = async () => {
    if (!editingUser) return;
    setSavingAccess(true);
    try {
      const result = await updateUserAccess(email, editingUser.email as string, {
        assignedSteps: editSteps,
        // "Both" steps stay in the view list too, so Edit / View / Both are all
        // persisted exactly as selected
        viewSteps: editViewSteps,
        canFillForm: editCanFillForm,
        canViewAllSteps: editCanViewAllSteps,
        officeAccess: editOfficeAccess,
      });
      if (result.success) {
        showToast("Access updated!", "success");
        setEditingUser(null);
        syncManagerRef.current?.forceSync();
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    } finally {
      setSavingAccess(false);
    }
  };

  const handleAddSalesPerson = async () => {
    if (!newSalesPerson.trim()) return;
    setAddingSalesPerson(true);
    try {
      const result = await addSalesPerson(email, newSalesPerson.trim());
      if (result.success) {
        showToast("Sales person added!", "success");
        setNewSalesPerson("");
        syncManagerRef.current?.forceSync();
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    } finally {
      setAddingSalesPerson(false);
    }
  };

  const handleRemoveSalesPerson = async (name: string) => {
    setRemovingSalesPerson(name);
    try {
      const result = await removeSalesPerson(email, name);
      if (result.success) {
        showToast("Removed!", "success");
        syncManagerRef.current?.forceSync();
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    } finally {
      setRemovingSalesPerson(null);
    }
  };

  const handleGenerateLink = async (userEmail: string) => {
    setGeneratingLink(userEmail);
    try {
      const result = await generateUserLink(email, userEmail);
      if (result.success && result.link) {
        setGeneratedLink(result.link);
      } else {
        showToast(result.message || "Error", "error");
      }
    } catch {
      showToast("Connection error", "error");
    } finally {
      setGeneratingLink(null);
    }
  };

  /** Opens the Access modal with every current value of the user row */
  const openAccessModal = (user: Record<string, unknown>) => {
    const access = readUserAccess(user);
    const rawViewSteps = parseStepList(
      user.viewStepsList !== undefined ? user.viewStepsList : user.viewSteps
    );
    setEditingUser(user);
    setEditSteps(access.assignedSteps);
    setEditViewSteps(rawViewSteps);
    setEditCanFillForm(access.canFillForm);
    setEditCanViewAllSteps(access.canViewAllSteps);
    setEditOfficeAccess(access.officeAccess);
  };

  const handleSelectAllSteps = () => {
    setEditSteps(editSteps.length === 10 ? [] : [...ALL_STEPS]);
  };

  const handleSelectAllViewSteps = () => {
    setEditViewSteps(editViewSteps.length === 10 ? [] : [...ALL_STEPS]);
  };

  const handleSelectAllBoth = () => {
    const allBoth = editSteps.length === 10 && editViewSteps.length === 10;
    setEditSteps(allBoth ? [] : [...ALL_STEPS]);
    setEditViewSteps(allBoth ? [] : [...ALL_STEPS]);
  };

  /** Current mode of a step inside the modal */
  const getStepMode = (step: number): StepMode => {
    const canEdit = editSteps.includes(step);
    const canView = editViewSteps.includes(step);
    if (canEdit && canView) return "both";
    if (canEdit) return "edit";
    if (canView) return "view";
    return "hidden";
  };

  /** One-click state per step: Edit only / View only / Both / Hidden */
  const setStepMode = (step: number, mode: StepMode) => {
    const withoutEdit = editSteps.filter((x) => x !== step);
    const withoutView = editViewSteps.filter((x) => x !== step);
    if (mode === "edit") {
      setEditSteps([...withoutEdit, step]);
      setEditViewSteps(withoutView);
    } else if (mode === "view") {
      setEditSteps(withoutEdit);
      setEditViewSteps([...withoutView, step]);
    } else if (mode === "both") {
      setEditSteps([...withoutEdit, step]);
      setEditViewSteps([...withoutView, step]);
    } else {
      setEditSteps(withoutEdit);
      setEditViewSteps(withoutView);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-md p-8 rounded-xl shadow-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg object-contain" />
            <div>
              <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>Admin Dashboard</h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Enquiry Capture O2D</p>
            </div>
          </div>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Verifying admin access...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Admin Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter admin email"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "var(--primary)" }}
              >
                {loading ? "Verifying..." : "Access Admin Panel"}
              </button>
              <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                No password required. Your email must be registered as admin in the system.
              </p>
            </div>
          )}
        </div>
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white z-[10000] shadow-lg" style={{ background: toast.type === "success" ? "var(--success)" : toast.type === "info" ? "var(--primary)" : "var(--danger)" }}>
            {toast.message}
          </div>
        )}
      </div>
    );
  }

  const users = (adminData?.users as Record<string, unknown>[]) || [];
  const salesPersons = (adminData?.salesPersons as string[]) || [];
  const entries = (adminData?.entries as Record<string, unknown>[]) || [];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center gap-3.5 px-6 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg object-contain" />
        <div>
          <h1 className="text-sm font-bold" style={{ color: "var(--text)" }}>Admin Dashboard</h1>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Enquiry Capture O2D</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: syncState.syncError ? "var(--danger)" : syncState.isSyncing ? "var(--warning)" : "var(--success)",
                  animation: syncState.isSyncing ? "pulse 1s infinite" : "none",
                }}
              />
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                {syncState.isSyncing ? "Syncing..." : syncState.syncError ? "Error" : "Live"}
              </span>
            </div>
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
              {formatRelativeTime(syncState.lastSyncTime)}
            </span>
            <button
              onClick={handleManualRefresh}
              disabled={syncState.isSyncing}
              className="w-5 h-5 rounded flex items-center justify-center text-[10px] cursor-pointer transition-all hover:opacity-70"
              style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}
              title="Force refresh from Google Sheet"
            >
              R
            </button>
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{email}</div>
        </div>
      </header>

      <div className="flex gap-1 px-6 pt-4 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
        {(["users", "sales", "entries", "forms", "holidays"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all cursor-pointer"
            style={{
              background: activeTab === tab ? "var(--surface)" : "transparent",
              color: activeTab === tab ? "var(--primary)" : "var(--text-muted)",
              borderBottom: activeTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
            }}
          >
            {tab === "users"
              ? "Users (" + users.length + ")"
              : tab === "sales"
              ? "Sales Persons (" + salesPersons.length + ")"
              : tab === "entries"
              ? "Entries (" + entries.length + ")"
              : tab === "forms"
              ? "Form (" + entries.length + ")"
              : "Holidays & Sundays"}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>Add New User</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="Email *" className="px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <input type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Name *" className="px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <input type="tel" value={newUserMobile} onChange={(e) => setNewUserMobile(e.target.value)} placeholder="Mobile" className="px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
              <button onClick={handleAddUser} disabled={addingUser} className="mt-3 px-5 py-2.5 rounded-md text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] shadow-sm flex items-center gap-1.5" style={{ background: "var(--primary)", opacity: addingUser ? 0.7 : 1 }}>
                {addingUser && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {addingUser ? "Adding..." : "+ Add User"}
              </button>
            </div>

            <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>Bulk Add Users (CSV)</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                />
                <button
                  onClick={handleBulkUpload}
                  disabled={!bulkFile || bulkUploading}
                  className="px-4 py-2 rounded-md text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5"
                  style={{ background: "var(--primary)", opacity: !bulkFile || bulkUploading ? 0.6 : 1 }}
                >
                  {bulkUploading && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {bulkUploading ? "Uploading..." : "Upload CSV"}
                </button>
              </div>
              <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                CSV columns: Email, Name, Mobile (first row is treated as the header).
              </p>
            </div>

            <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>All Users ({users.length})</h3>
              <p className="text-[11px] mb-3 p-2 rounded" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                Use &quot;Access&quot; to set each step as <strong>Edit</strong>, <strong>View</strong> or <strong>Both</strong>.
                Use &quot;Generate Link&quot; to create the personal dashboard link of that user.
                &quot;Office Access&quot; controls which office location tasks the user can see.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Email</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Name</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Mobile</th>
                      <th className="text-left py-2 px-2 font-semibold whitespace-nowrap" style={{ color: "var(--text-muted)" }}>Step Access</th>
                      <th className="text-left py-2 px-2 font-semibold whitespace-nowrap" style={{ color: "var(--text-muted)" }}>Office Access</th>
                      <th className="text-left py-2 px-2 font-semibold whitespace-nowrap" style={{ color: "var(--text-muted)" }}>Flags</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, idx) => {
                      const userEmail = String(user.email || "");
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          <td className="py-2 px-2" style={{ color: "var(--text)" }}>{userEmail}</td>
                          <td className="py-2 px-2" style={{ color: "var(--text)" }}>{String(user.name || "")}</td>
                          <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{String(user.mobile || "")}</td>
                          <td className="py-2 px-2 align-middle"><StepAccessCell user={user} /></td>
                          <td className="py-2 px-2 align-middle"><OfficeAccessCell user={user} /></td>
                          <td className="py-2 px-2 align-middle"><AccessFlagsCell user={user} /></td>
                          <td className="py-2 px-2 align-middle">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => openAccessModal(user)}
                                className="px-3 py-1.5 rounded text-[10px] font-semibold text-white cursor-pointer transition-all hover:opacity-90"
                                style={{ background: "var(--primary)" }}
                              >
                                Access
                              </button>

                              {/* CHANGE 3 — Generate Link button restored */}
                              <button
                                onClick={() => handleGenerateLink(userEmail)}
                                disabled={generatingLink === userEmail}
                                className="px-3 py-1.5 rounded text-[10px] font-semibold text-white cursor-pointer transition-all hover:opacity-90 flex items-center gap-1"
                                style={{ background: "#7c3aed", opacity: generatingLink === userEmail ? 0.7 : 1 }}
                                title="Create the personal dashboard link for this user"
                              >
                                {generatingLink === userEmail && (
                                  <span className="w-2.5 h-2.5 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                                )}
                                {generatingLink === userEmail ? "Generating..." : "Generate Link"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {users.length === 0 && <p className="text-center py-8 text-xs" style={{ color: "var(--text-muted)" }}>No users yet. Add your first user above.</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === "sales" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>Add Sales Person</h3>
              <div className="flex gap-2">
                <input type="text" value={newSalesPerson} onChange={(e) => setNewSalesPerson(e.target.value)} placeholder="Enter name" className="flex-1 px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <button onClick={handleAddSalesPerson} disabled={addingSalesPerson} className="px-5 py-2.5 rounded-md text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] shadow-sm flex items-center gap-1.5" style={{ background: "var(--primary)", opacity: addingSalesPerson ? 0.7 : 1 }}>
                  {addingSalesPerson && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {addingSalesPerson ? "Adding..." : "Add"}
                </button>
              </div>
            </div>

            <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>Sales Persons ({salesPersons.length})</h3>
              <div className="space-y-2">
                {salesPersons.map((sp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border-light)" }}>
                    <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{sp}</span>
                    <button onClick={() => handleRemoveSalesPerson(sp)} disabled={removingSalesPerson === sp} className="text-xs px-3 py-1.5 rounded font-semibold cursor-pointer transition-all hover:opacity-90 active:scale-[0.97] text-white shadow-sm flex items-center gap-1" style={{ background: "var(--danger)", opacity: removingSalesPerson === sp ? 0.7 : 1 }}>
                      {removingSalesPerson === sp && <span className="w-2.5 h-2.5 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />}
                      {removingSalesPerson === sp ? "Removing..." : "Remove"}
                    </button>
                  </div>
                ))}
                {salesPersons.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No sales persons added yet.</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === "entries" && (
          <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>All Entries ({entries.length})</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
                  Auto-syncing every 5s from Google Sheet
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>ID</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Challan No</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Company</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Enquirer</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Type</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Step</th>
                    <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border-light)" }}>
                      <td className="py-2 px-2 font-mono" style={{ color: "var(--primary)" }}>{String(entry.Entry_ID)}</td>
                      <td className="py-2 px-2">
                        {entry.Challan_Number ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
                            {String(entry.Challan_Number)}
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>-</span>
                        )}
                      </td>
                      <td className="py-2 px-2" style={{ color: "var(--text)" }}>{String(entry.Company_Name || "")}</td>
                      <td className="py-2 px-2" style={{ color: "var(--text)" }}>{String(entry.Name_of_Enquirer || "")}</td>
                      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{String(entry.Type_of_Enquiry || "")}</td>
                      <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{STEP_NAMES[entry.Current_Step as number] || "Step " + String(entry.Current_Step)}</td>
                      <td className="py-2 px-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                          background: entry.Is_Completed ? "rgba(5,150,105,0.08)" : entry.Is_Stopped ? "rgba(220,38,38,0.08)" : "rgba(37,99,235,0.06)",
                          color: entry.Is_Completed ? "var(--success)" : entry.Is_Stopped ? "var(--danger)" : "var(--primary)",
                        }}>
                          {entry.Is_Completed ? "Completed" : entry.Is_Stopped ? "Stopped" : "In Progress"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entries.length === 0 && <p className="text-center py-8 text-xs" style={{ color: "var(--text-muted)" }}>No entries yet.</p>}
            </div>
          </div>
        )}

        {activeTab === "forms" && <FormSubmissionsModule entries={entries} />}

        {activeTab === "holidays" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
              <p className="text-[11px]" style={{ color: "var(--primary)" }}>
                <strong>How it works:</strong> Holiday dates and Sunday dates are fetched from the <strong>&quot;sunday&amp;holiday&quot;</strong> tab in Google Sheet. When a planned date is calculated for any step, it automatically skips these dates and moves to the next working day.
              </p>
            </div>

            {loadingHolidays ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading holidays &amp; Sundays...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
                      Holidays
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--danger)" }}>
                        {holidaysData.holidays.length}
                      </span>
                    </h3>
                    <button
                      onClick={loadHolidaysData}
                      className="text-[10px] px-2.5 py-1 rounded font-semibold cursor-pointer"
                      style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid var(--primary)" }}
                    >
                      Refresh
                    </button>
                  </div>
                  <p className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
                    Source: Google Sheet &rarr; &quot;sunday&amp;holiday&quot; tab &rarr; Column A (dates from A2) &amp; Column B (reasons from B2)
                  </p>
                  <div className="overflow-y-auto max-h-[400px]">
                    {holidaysData.holidays.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>#</th>
                            <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Date</th>
                            <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holidaysData.holidays.map((holiday, idx) => (
                            <tr key={idx} style={{ borderBottom: "1px solid var(--border-light)" }}>
                              <td className="py-2 px-2" style={{ color: "var(--text-faint)" }}>{idx + 1}</td>
                              <td className="py-2 px-2 font-mono font-semibold" style={{ color: "var(--danger)" }}>{holiday.date}</td>
                              <td className="py-2 px-2" style={{ color: "var(--text)" }}>{holiday.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>No holidays found. Add dates in the &quot;sunday&amp;holiday&quot; tab column A &amp; B.</p>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
                      Sundays
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--warning)" }}>
                        {holidaysData.sundays.length}
                      </span>
                    </h3>
                  </div>
                  <p className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
                    Source: Google Sheet &rarr; &quot;sunday&amp;holiday&quot; tab &rarr; Column D (dates from D3)
                  </p>
                  <div className="overflow-y-auto max-h-[400px]">
                    {holidaysData.sundays.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {holidaysData.sundays.map((sundayDate, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-2 rounded-lg text-center"
                            style={{ background: "var(--surface-2)", border: "1px solid var(--border-light)" }}
                          >
                            <span className="text-[11px] font-mono font-semibold" style={{ color: "var(--warning)" }}>{sundayDate}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>No Sunday dates found. Add dates in the &quot;sunday&amp;holiday&quot; tab column D from D3.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================== EDIT ACCESS MODAL ===================== */}
      {editingUser && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>Edit Access - {String(editingUser.name)}</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{String(editingUser.email)}</p>

            <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
              <p className="text-[11px]" style={{ color: "var(--primary)" }}>
                <strong>How it works:</strong> every step can be set to <strong>Edit</strong> (submit only),
                <strong> View</strong> (read only) or <strong>Both</strong> (submit + always visible).
                A step with none of them is completely hidden for this user.
                &quot;Office Access&quot; controls which office location tasks the user can see and fill forms for.
              </p>
            </div>

            {/* Office Access */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Office Access</label>
              <div className="flex gap-2 flex-wrap">
                {["Mumbai", "Boisar", "Mumbai&Boisar"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setEditOfficeAccess(editOfficeAccess === opt ? "" : opt)}
                    className="px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer"
                    style={{
                      background: editOfficeAccess === opt ? "#7c3aed" : "var(--surface-2)",
                      color: editOfficeAccess === opt ? "white" : "var(--text)",
                      border: "1px solid " + (editOfficeAccess === opt ? "#7c3aed" : "var(--border)"),
                    }}
                  >
                    {opt === "Mumbai&Boisar" ? "Mumbai & Boisar" : opt}
                  </button>
                ))}
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                {editOfficeAccess ? "User will see only \"" + editOfficeAccess + "\" office tasks and fill forms with that office location." : "No restriction - user can see all office tasks."}
              </p>
            </div>

            <label
              className="flex items-center gap-3 p-3 rounded-lg cursor-pointer mb-4"
              style={{
                background: editCanViewAllSteps ? "rgba(37,99,235,0.06)" : "var(--surface-2)",
                border: "1px solid " + (editCanViewAllSteps ? "var(--primary)" : "var(--border)"),
              }}
            >
              <input
                type="checkbox"
                checked={editCanViewAllSteps}
                onChange={(e) => setEditCanViewAllSteps(e.target.checked)}
                className="w-4 h-4"
                style={{ accentColor: "var(--primary)" }}
              />
              <div>
                <span className="text-xs font-semibold block" style={{ color: "var(--text)" }}>Show ALL steps (master view switch)</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {editCanViewAllSteps
                    ? "User sees every step. Leave all View boxes unchecked to show all 10 steps as read only."
                    : "User sees only the steps selected below."}
                </span>
              </div>
            </label>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <label className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Step wise access
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={handleSelectAllSteps}
                    className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer"
                    style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid var(--primary)" }}
                  >
                    {editSteps.length === 10 ? "Clear Edit" : "All Edit"}
                  </button>
                  <button
                    onClick={handleSelectAllViewSteps}
                    className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer"
                    style={{ background: "rgba(124,58,237,0.08)", color: "#7c3aed", border: "1px solid #7c3aed" }}
                  >
                    {editViewSteps.length === 10 ? "Clear View" : "All View"}
                  </button>
                  <button
                    onClick={handleSelectAllBoth}
                    className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer"
                    style={{ background: "rgba(5,150,105,0.08)", color: "var(--success)", border: "1px solid var(--success)" }}
                  >
                    {editSteps.length === 10 && editViewSteps.length === 10 ? "Clear Both" : "All Both"}
                  </button>
                </div>
              </div>

              <p className="text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>
                <strong>Edit</strong> = can submit the step. <strong>View</strong> = read only.
                <strong> Both</strong> = can submit and always visible. Tick both boxes, or use the
                quick buttons on each row.
              </p>

              <div className="space-y-1.5">
                {ALL_STEPS.map((s) => {
                  const mode = getStepMode(s);
                  const canEdit = mode === "edit" || mode === "both";
                  const canView = mode === "view" || mode === "both";
                  const effectiveView = canEdit || canView || (editCanViewAllSteps && editViewSteps.length === 0);

                  const rowBg =
                    mode === "both"
                      ? "rgba(5,150,105,0.07)"
                      : mode === "edit"
                      ? "var(--primary-bg)"
                      : mode === "view"
                      ? "rgba(124,58,237,0.06)"
                      : "var(--surface-2)";
                  const rowBorder =
                    mode === "both"
                      ? "var(--success)"
                      : mode === "edit"
                      ? "var(--primary)"
                      : mode === "view"
                      ? "#7c3aed"
                      : "var(--border)";
                  const badgeBg =
                    mode === "both"
                      ? "var(--success)"
                      : mode === "edit"
                      ? "var(--primary)"
                      : mode === "view"
                      ? "#7c3aed"
                      : "var(--surface-3)";

                  const modeLabel =
                    mode === "both" ? "Edit + View (Both)"
                      : mode === "edit" ? "Edit only"
                      : mode === "view" ? "View only"
                      : effectiveView ? "View Only (from master switch)" : "Hidden";

                  return (
                    <div
                      key={s}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg flex-wrap"
                      style={{ background: rowBg, border: "1px solid " + rowBorder }}
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{ background: badgeBg, color: mode === "hidden" ? "var(--text-faint)" : "#ffffff" }}
                      >
                        {s}
                      </div>

                      <div className="flex-1 min-w-[120px]">
                        <span className="text-xs font-semibold block truncate" style={{ color: "var(--text)" }}>
                          {STEP_NAMES[s]}
                        </span>
                        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                          {modeLabel}
                        </span>
                      </div>

                      {/* independent checkboxes: Edit / View / Both */}
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canEdit}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setStepMode(s, canView ? "both" : "edit");
                            } else {
                              setStepMode(s, canView ? "view" : "hidden");
                            }
                          }}
                          className="w-3.5 h-3.5"
                          style={{ accentColor: "var(--primary)" }}
                        />
                        <span className="text-[9px] font-bold" style={{ color: "var(--primary)" }}>Edit</span>
                      </label>

                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canView}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setStepMode(s, canEdit ? "both" : "view");
                            } else {
                              setStepMode(s, canEdit ? "edit" : "hidden");
                            }
                          }}
                          className="w-3.5 h-3.5"
                          style={{ accentColor: "#7c3aed" }}
                        />
                        <span className="text-[9px] font-bold" style={{ color: "#7c3aed" }}>View</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => setStepMode(s, mode === "both" ? "hidden" : "both")}
                        className="text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
                        style={{
                          background: mode === "both" ? "var(--success)" : "var(--surface)",
                          color: mode === "both" ? "#ffffff" : "var(--success)",
                          border: "1px solid var(--success)",
                        }}
                        title="Set this step to Edit + View"
                      >
                        Both
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 p-2 rounded space-y-1" style={{ background: "var(--surface-2)" }}>
                <div className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  Edit only: {editSteps.filter((s) => !editViewSteps.includes(s)).sort((a, b) => a - b).join(", ") || "None"}
                </div>
                <div className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  View only: {editViewSteps.filter((s) => !editSteps.includes(s)).sort((a, b) => a - b).join(", ") || "None"}
                </div>
                <div className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  Both: {editSteps.filter((s) => editViewSteps.includes(s)).sort((a, b) => a - b).join(", ") || "None"}
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 p-3 rounded-lg cursor-pointer mb-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <input type="checkbox" checked={editCanFillForm} onChange={(e) => setEditCanFillForm(e.target.checked)} className="w-4 h-4" style={{ accentColor: "var(--primary)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>Can Fill Main Form (New Entry)</span>
            </label>

            <div className="flex gap-2 justify-between flex-wrap">
              <button
                onClick={() => handleGenerateLink(String(editingUser.email || ""))}
                disabled={generatingLink === String(editingUser.email || "")}
                className="px-4 py-2.5 rounded-md text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90 flex items-center gap-1.5"
                style={{ background: "#7c3aed", opacity: generatingLink === String(editingUser.email || "") ? 0.7 : 1 }}
              >
                {generatingLink === String(editingUser.email || "") && (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {generatingLink === String(editingUser.email || "") ? "Generating..." : "Generate Link"}
              </button>

              <div className="flex gap-2">
                <button onClick={() => setEditingUser(null)} disabled={savingAccess} className="px-4 py-2.5 rounded-md text-xs font-semibold cursor-pointer transition-all hover:opacity-90" style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Cancel</button>
                <button onClick={handleUpdateAccess} disabled={savingAccess} className="px-4 py-2.5 rounded-md text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] shadow-sm flex items-center gap-1.5" style={{ background: "var(--success)", opacity: savingAccess ? 0.7 : 1 }}>
                  {savingAccess && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {savingAccess ? "Saving..." : "Save Access"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {generatedLink && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setGeneratedLink(""); }}>
          <div className="w-full max-w-md rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Generated User Link</h2>
            <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
              This link opens the personal dashboard of that user. Steps set to Edit or Both are submittable, steps set to View are read only.
            </p>
            <div className="p-3 rounded-lg break-all text-xs" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--primary)" }}>
              {generatedLink}
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => { navigator.clipboard.writeText(generatedLink); showToast("Link copied!", "success"); }}
                className="px-4 py-2.5 rounded-md text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] shadow-sm"
                style={{ background: "var(--primary)" }}
              >
                Copy Link
              </button>
              <button onClick={() => setGeneratedLink("")} className="px-4 py-2.5 rounded-md text-xs font-semibold cursor-pointer transition-all hover:opacity-90" style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {syncNotifications.length > 0 && (
        <div className="fixed bottom-16 right-6 z-[900] w-72 max-h-48 overflow-y-auto rounded-lg shadow-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>Recent Changes</span>
            <button onClick={() => setSyncNotifications([])} className="text-[10px] cursor-pointer" style={{ color: "var(--text-faint)" }}>Clear</button>
          </div>
          <div className="p-2 space-y-1">
            {syncNotifications.slice(0, 5).map((n) => (
              <div key={n.id} className="text-[10px] p-1.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                {n.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white z-[10000] shadow-lg" style={{ background: toast.type === "success" ? "var(--success)" : toast.type === "info" ? "var(--primary)" : "var(--danger)" }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "var(--bg)" }}>
        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading admin panel...</p>
      </div>
    }>
      <AdminDashboardContent />
    </Suspense>
  );
}
