"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getAdminData, addUser, bulkAddUsers, updateUserAccess, addSalesPerson, removeSalesPerson, generateUserLink } from "../lib/api";
import { STEP_NAMES } from "../lib/types";
import type { SyncState, SyncNotification } from "../lib/types";
import { createSyncManager, DataSyncManager } from "../lib/dataSync";
import { formatRelativeTime } from "../lib/utils";

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailFromUrl);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adminData, setAdminData] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "sales" | "entries">("users");
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

  const [generatedLink, setGeneratedLink] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [addingSalesPerson, setAddingSalesPerson] = useState(false);
  const [removingSalesPerson, setRemovingSalesPerson] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);

  // Real-time sync state
  const [syncState, setSyncState] = useState<SyncState>({
    lastSyncTime: null,
    isSyncing: false,
    syncError: null,
    dataHash: null,
  });
  const [syncNotifications, setSyncNotifications] = useState<SyncNotification[]>([]);
  const syncManagerRef = useRef<DataSyncManager | null>(null);
  const [, setTick] = useState(0); // Force re-render for relative time updates

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Update relative time display every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  // Initialize real-time sync after authentication
  useEffect(() => {
    if (!authenticated || !email) return;

    const manager = createSyncManager({
      fetchFn: () => getAdminData(email) as Promise<Record<string, unknown>>,
      onData: (data) => {
        setAdminData(data);
      },
      onNotification: (notification) => {
        setSyncNotifications((prev) => [notification, ...prev].slice(0, 10));
        showToast(`🔄 ${notification.message}`, "info");
      },
      onError: (error) => {
        console.error("Sync error:", error);
      },
      onStateChange: (state) => {
        setSyncState(state);
      },
      config: {
        pollInterval: 5000, // 5 seconds
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
        canFillForm: editCanFillForm,
        canViewAllSteps: editCanViewAllSteps,
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

  const handleSelectAllSteps = () => {
    if (editSteps.length === 10) {
      setEditSteps([]);
    } else {
      setEditSteps([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
          {/* Real-time Sync Indicator */}
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
              🔄
            </button>
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{email}</div>
        </div>
      </header>

      <div className="flex gap-1 px-6 pt-4" style={{ borderBottom: "1px solid var(--border)" }}>
        {(["users", "sales", "entries"] as const).map((tab) => (
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
            {tab === "users" ? "Users (" + users.length + ")" : tab === "sales" ? "Sales Persons (" + salesPersons.length + ")" : "Entries (" + entries.length + ")"}
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
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>All Users ({users.length})</h3>
              <p className="text-[11px] mb-3 p-2 rounded" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                &#x1F4A1; Use &quot;Access&quot; to set which steps a user can edit. Enable &quot;View + Edit&quot; to let the user see all steps while only editing their authorized ones. Without it, users only see their authorized steps.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Email</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Name</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Mobile</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Authorized Steps</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Access</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, idx) => {
                      const stepsStr = String(user.assignedSteps || "");
                      const stepsArr = stepsStr ? stepsStr.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n)) : [];
                      const hasViewAll = user.canViewAllSteps === true || user.canViewAllSteps === "TRUE" || user.canViewAllSteps === "true";
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          <td className="py-2 px-2" style={{ color: "var(--text)" }}>{String(user.email)}</td>
                          <td className="py-2 px-2" style={{ color: "var(--text)" }}>{String(user.name)}</td>
                          <td className="py-2 px-2" style={{ color: "var(--text-muted)" }}>{String(user.mobile || "")}</td>
                          <td className="py-2 px-2">
                            {stepsArr.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {stepsArr.map((s) => (
                                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>None</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-1">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: user.canFillForm ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)", color: user.canFillForm ? "var(--success)" : "var(--danger)" }}>
                                Form: {user.canFillForm ? "Yes" : "No"}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: hasViewAll ? "rgba(37,99,235,0.08)" : "rgba(100,100,100,0.08)", color: hasViewAll ? "var(--primary)" : "var(--text-faint)" }}>
                                {hasViewAll ? "View+Edit" : "Edit Only"}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingUser(user);
                                  setEditSteps(stepsArr);
                                  setEditCanFillForm(user.canFillForm === true || user.canFillForm === "TRUE" || user.canFillForm === "true");
                                  setEditCanViewAllSteps(hasViewAll);
                                }}
                                className="px-3 py-1.5 rounded text-[10px] font-semibold cursor-pointer transition-all hover:opacity-90 active:scale-[0.97] text-white shadow-sm"
                                style={{ background: "var(--primary)" }}
                              >
                                Access
                              </button>
                              <button
                                onClick={() => handleGenerateLink(String(user.email))}
                                disabled={generatingLink === String(user.email)}
                                className="px-3 py-1.5 rounded text-[10px] font-semibold cursor-pointer transition-all hover:opacity-90 active:scale-[0.97] text-white shadow-sm flex items-center gap-1"
                                style={{ background: "#6366f1", opacity: generatingLink === String(user.email) ? 0.7 : 1 }}
                              >
                                {generatingLink === String(user.email) && <span className="w-2.5 h-2.5 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />}
                                {generatingLink === String(user.email) ? "..." : "Link"}
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
      </div>

      {/* Enhanced Edit Access Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>Edit Access - {String(editingUser.name)}</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{String(editingUser.email)}</p>

            <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
              <p className="text-[11px]" style={{ color: "var(--primary)" }}>
                <strong>How it works:</strong> Select the steps this user is authorized to edit/submit. By default, users can ONLY see their authorized steps. Enable &quot;View + Edit&quot; below to let them see ALL steps (read-only for non-authorized ones) while still only being able to edit their authorized steps.
              </p>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer mb-4" style={{ background: editCanViewAllSteps ? "rgba(37,99,235,0.06)" : "var(--surface-2)", border: "1px solid " + (editCanViewAllSteps ? "var(--primary)" : "var(--border)") }}>
              <input type="checkbox" checked={editCanViewAllSteps} onChange={(e) => setEditCanViewAllSteps(e.target.checked)} className="w-4 h-4" style={{ accentColor: "var(--primary)" }} />
              <div>
                <span className="text-xs font-semibold block" style={{ color: "var(--text)" }}>View + Edit Access</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {editCanViewAllSteps ? "User can see ALL steps + edit authorized ones" : "User can ONLY see their authorized steps"}
                </span>
              </div>
            </label>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>Authorize Steps (User can edit these)</label>
                <button
                  onClick={handleSelectAllSteps}
                  className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer"
                  style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid var(--primary)" }}
                >
                  {editSteps.length === 10 ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="space-y-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => {
                  const isSelected = editSteps.includes(s);
                  return (
                    <div
                      key={s}
                      onClick={() => {
                        if (isSelected) {
                          setEditSteps(editSteps.filter((x) => x !== s));
                        } else {
                          setEditSteps([...editSteps, s]);
                        }
                      }}
                      className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all"
                      style={{
                        background: isSelected ? "var(--primary-bg)" : "var(--surface-2)",
                        border: "1px solid " + (isSelected ? "var(--primary)" : "var(--border)"),
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{
                          background: isSelected ? "var(--primary)" : "var(--surface-3)",
                          color: isSelected ? "white" : "var(--text-faint)",
                        }}
                      >
                        {isSelected ? "\u2713" : s}
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                          Step {s}: {STEP_NAMES[s]}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: isSelected ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)",
                        color: isSelected ? "var(--success)" : "var(--danger)",
                      }}>
                        {isSelected ? "Can Edit" : (editCanViewAllSteps ? "View Only" : "Hidden")}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 p-2 rounded" style={{ background: "var(--surface-2)" }}>
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  Selected: {editSteps.length > 0 ? editSteps.sort((a, b) => a - b).map((s) => s + ". " + STEP_NAMES[s]).join(", ") : "No steps authorized"}
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 p-3 rounded-lg cursor-pointer mb-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <input type="checkbox" checked={editCanFillForm} onChange={(e) => setEditCanFillForm(e.target.checked)} className="w-4 h-4" style={{ accentColor: "var(--primary)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>Can Fill Main Form (New Entry)</span>
            </label>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingUser(null)} disabled={savingAccess} className="px-4 py-2.5 rounded-md text-xs font-semibold cursor-pointer transition-all hover:opacity-90" style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Cancel</button>
              <button onClick={handleUpdateAccess} disabled={savingAccess} className="px-4 py-2.5 rounded-md text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] shadow-sm flex items-center gap-1.5" style={{ background: "var(--success)", opacity: savingAccess ? 0.7 : 1 }}>
                {savingAccess && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {savingAccess ? "Saving..." : "Save Access"}
              </button>
            </div>
          </div>
        </div>
      )}

      {generatedLink && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setGeneratedLink(""); }}>
          <div className="w-full max-w-md rounded-xl p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Generated User Link</h2>
            <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
              This link will show the user only their authorized steps for editing. If &quot;View + Edit&quot; is enabled, they will also see other steps as read-only.
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

      {/* Sync Notifications Panel (bottom-right) */}
      {syncNotifications.length > 0 && (
        <div className="fixed bottom-16 right-6 z-[900] w-72 max-h-48 overflow-y-auto rounded-lg shadow-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>Recent Changes</span>
            <button onClick={() => setSyncNotifications([])} className="text-[10px] cursor-pointer" style={{ color: "var(--text-faint)" }}>Clear</button>
          </div>
          <div className="p-2 space-y-1">
            {syncNotifications.slice(0, 5).map((n) => (
              <div key={n.id} className="text-[10px] p-1.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                🔄 {n.message}
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
