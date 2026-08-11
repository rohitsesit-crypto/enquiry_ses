"use client";

import React, { useState, useEffect } from "react";
import { STEP_NAMES } from "../lib/types";
import { formatDate, formatDateOnly, formatStorageDate, formatStorageTimestamp, toInputDate } from "../lib/utils";
import { uploadToDrive } from "../lib/driveUpload";

interface StepWorkflowProps {
  entry: Record<string, unknown>;
  stepNum: number;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default function StepWorkflow({ entry, stepNum, onSubmit, onCancel }: StepWorkflowProps) {
  const [status, setStatus] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [remark, setRemark] = useState("");
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [sheetAttachmentUrl, setSheetAttachmentUrl] = useState("");

  // Step 4 PO Form
  const [poNumber, setPoNumber] = useState("");
  const [poLocation, setPoLocation] = useState("");
  const [qNo, setQNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [payTerms, setPayTerms] = useState("");

  // Step 7 Invoice tracking
  const [invoiceEntries, setInvoiceEntries] = useState<{ itemName: string; quantityReceived: string }[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  // Step 8 Dispatch
  const [dispatchMode, setDispatchMode] = useState("");
  const [dispatchName, setDispatchName] = useState("");
  const [dispatchMobNo, setDispatchMobNo] = useState("");
  const [invoiceChallanNo, setInvoiceChallanNo] = useState("");
  const [lrNo, setLrNo] = useState("");

  const plannedDate = entry[`Step_${stepNum}_Planned_Date`] as string | null;

  // Parse requirements for step 7
  let requirements: { itemName: string; quantity: number; unit: string }[] = [];
  try {
    const reqStr = entry.Requirements_JSON as string;
    if (reqStr) requirements = JSON.parse(reqStr);
  } catch { /* ignore */ }

  // Get history totals for step 7 - total received so far across all batches
  function getHistoryTotals(): Record<string, number> {
    const totals: Record<string, number> = {};
    try {
      const invoicesStr = entry.Step_7_Invoices_JSON as string;
      if (invoicesStr) {
        const existingBatches = JSON.parse(invoicesStr);
        existingBatches.forEach((batch: { items: { itemName: string; quantityReceived: number }[] }) => {
          (batch.items || []).forEach((item) => {
            if (!totals[item.itemName]) totals[item.itemName] = 0;
            totals[item.itemName] += (item.quantityReceived || 0);
          });
        });
      }
    } catch { /* ignore */ }
    return totals;
  }

  // Check if all quantities are fully matched
  function isFullyMatched(): boolean {
    const totals = getHistoryTotals();
    for (const req of requirements) {
      const received = totals[req.itemName] || 0;
      if (received < req.quantity) return false;
    }
    return true;
  }

  // Get remaining quantities for step 7
  function getRemainingQuantities(): { itemName: string; remaining: number; unit: string; total: number; received: number }[] {
    const totals = getHistoryTotals();
    return requirements.map((req) => {
      const received = totals[req.itemName] || 0;
      return {
        itemName: req.itemName,
        remaining: Math.max(0, req.quantity - received),
        unit: req.unit,
        total: req.quantity,
        received: received,
      };
    }).filter((item) => item.remaining > 0);
  }

  // Initialize invoice entries for step 7
  useEffect(() => {
    if (stepNum === 7 && requirements.length > 0 && invoiceEntries.length === 0) {
      const totals = getHistoryTotals();
      setInvoiceEntries(
        requirements.map((r) => ({
          itemName: r.itemName,
          quantityReceived: String(Math.max(0, r.quantity - (totals[r.itemName] || 0))),
        }))
      );
    }
  }, [stepNum]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let attachmentUrl = "";

      // Upload file if present
      if (attachment) {
        setUploadingFile(true);
        try {
          const uploadResult = await uploadToDrive(attachment, String(entry.Entry_ID || "unknown"));
          if (uploadResult.success && uploadResult.url) {
            attachmentUrl = uploadResult.url;
          }
        } catch (err) {
          console.error("Upload error:", err);
        } finally {
          setUploadingFile(false);
        }
      }

      // Build submission data based on step
      const data: Record<string, unknown> = {
        status: status || "Completed",
        remark,
        attachment: attachmentUrl || undefined,
      };

      if (stepNum === 4 && status === "Yes") {
        data.poData = {
          poNumber,
          location: poLocation,
          qNo,
          deliveryDate: deliveryDate ? formatStorageDate(deliveryDate) : "",
          payTerms: payTerms ? parseInt(payTerms) : 0,
        };
      }

      if (stepNum === 7) {
        const totals = getHistoryTotals();
        data.invoiceData = {
          invoiceNumber,
          items: invoiceEntries.map((ie) => ({
            itemName: ie.itemName,
            quantityReceived: parseInt(ie.quantityReceived) || 0,
            totalQuantity: requirements.find((r) => r.itemName === ie.itemName)?.quantity || 0,
            previouslyReceived: totals[ie.itemName] || 0,
            attachment: attachmentUrl || "",
          })),
        };
        // Flag: allow partial - move to step 8 even if not fully matched
        data.allowPartial = true;
      }

      if (stepNum === 8) {
        data.dispatchData = {
          mode: dispatchMode,
          name: dispatchName,
          mobNo: dispatchMobNo,
          invoiceChallanNo,
          lrNo,
        };
        // Check if Step 7 quantities are fully matched
        // If not, after Step 8 completion, should loop back to Step 7
        const fullyMatched = isFullyMatched();
        data.step7FullyMatched = fullyMatched;
        if (!fullyMatched) {
          data.loopBackToStep7 = true;
        }
      }

      onSubmit(data);
    } catch (error) {
      console.error("Submit error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // Validation
  const isValid = (() => {
    if (stepNum === 1 || stepNum === 2 || stepNum === 5 || stepNum === 6 || stepNum === 9 || stepNum === 10) {
      return !!status;
    }
    if (stepNum === 3) {
      return !!status && !!attachment;
    }
    if (stepNum === 4) {
      if (!status) return false;
      if (status === "Yes") return !!poNumber && !!deliveryDate;
      return true;
    }
    if (stepNum === 7) {
      return !!invoiceNumber && invoiceEntries.some((ie) => parseInt(ie.quantityReceived) > 0) && !!attachment;
    }
    if (stepNum === 8) {
      return !!dispatchMode && !!dispatchName && !!invoiceChallanNo;
    }
    return true;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>
            Step {stepNum}: {STEP_NAMES[stepNum]}
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Entry: {String(entry.Company_Name || "")} &middot; {String(entry.Name_of_Enquirer || "")}
          </p>
          {plannedDate && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--primary)" }}>
              Planned: {formatDate(plannedDate)}
            </p>
          )}
        </div>
        <button
          onClick={onCancel}
          className="text-lg cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          &#x2715;
        </button>
      </div>

      {/* Entry Details Summary */}
      <div className="mb-5 p-3 rounded-lg space-y-1.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <h4 className="text-[11px] font-bold mb-2" style={{ color: "var(--text-secondary)" }}>Entry Details</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {!!entry.Timestamp && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Date</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{formatDateOnly(String(entry.Timestamp))}</span>
            </div>
          )}
          {!!entry.Submitted_By && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Submitted By</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{String(entry.Submitted_By)}</span>
            </div>
          )}
          {!!entry.Location && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Location</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{String(entry.Location)}</span>
            </div>
          )}
          {!!entry.Company_Name && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Company</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{String(entry.Company_Name)}</span>
            </div>
          )}
          {!!entry.Name_of_Enquirer && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Enquirer</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{String(entry.Name_of_Enquirer)}</span>
            </div>
          )}
          {!!entry.Mobile_Number && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Mobile</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{String(entry.Mobile_Number)}</span>
            </div>
          )}
          {!!entry.Email_Id && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Email</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{String(entry.Email_Id)}</span>
            </div>
          )}
          {!!entry.Sales_Person_Accountable && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Sales Person</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{String(entry.Sales_Person_Accountable)}</span>
            </div>
          )}
          {!!entry.Sales_Close_Date && (
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Sales Close Date</span>
              <span className="text-[11px]" style={{ color: "var(--text)" }}>{formatDateOnly(String(entry.Sales_Close_Date))}</span>
            </div>
          )}
        </div>
        {/* Requirements */}
        {requirements.length > 0 && (
          <div className="pt-2 mt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Requirements:</span>
            <div className="mt-1 space-y-0.5">
              {requirements.map((r, i) => (
                <div key={i} className="text-[11px]" style={{ color: "var(--text)" }}>
                  {r.itemName} — Qty: {r.quantity} {r.unit}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 7/8 Info Banner - Show remaining quantities info */}
      {(stepNum === 7 || stepNum === 8) && requirements.length > 0 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.15)" }}>
          <h4 className="text-[11px] font-bold mb-2" style={{ color: "#d97706" }}>
            {stepNum === 7 ? "Invoice & Quantity Tracking" : "Dispatch - Quantity Status"}
          </h4>
          {(() => {
            const totals = getHistoryTotals();
            const allMatched = isFullyMatched();
            return (
              <div className="space-y-1">
                {requirements.map((req, i) => {
                  const received = totals[req.itemName] || 0;
                  const remaining = Math.max(0, req.quantity - received);
                  const isMatched = received >= req.quantity;
                  return (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span style={{ color: "var(--text)" }}>{req.itemName}</span>
                      <span style={{ color: isMatched ? "var(--success)" : "#d97706" }}>
                        {received}/{req.quantity} {req.unit} {isMatched ? "✓ Matched" : `(${remaining} remaining)`}
                      </span>
                    </div>
                  );
                })}
                {stepNum === 8 && !allMatched && (
                  <div className="mt-2 p-2 rounded" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.12)" }}>
                    <p className="text-[10px] font-semibold" style={{ color: "var(--danger)" }}>
                      ⚠️ Quantities not fully matched. After this dispatch is completed, the workflow will loop back to Step 7 for remaining quantities before proceeding to Step 9.
                    </p>
                  </div>
                )}
                {stepNum === 7 && allMatched && (
                  <div className="mt-2 p-2 rounded" style={{ background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.12)" }}>
                    <p className="text-[10px] font-semibold" style={{ color: "var(--success)" }}>
                      ✅ All quantities fully matched! After dispatch (Step 8), workflow will proceed to Step 9.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Show previous invoice submissions with attachments */}
          {stepNum === 7 && (() => {
            let invoices: { batch: number; date: string; submittedBy: string; invoiceNo?: string; items: { itemName: string; quantityReceived: number; totalQuantity: number; attachment: string; uploadedAt?: string }[] }[] = [];
            try {
              const invStr = entry.Step_7_Invoices_JSON as string;
              if (invStr) invoices = JSON.parse(invStr);
            } catch { /* ignore */ }
            if (invoices.length === 0) return null;
            return (
              <div className="mt-3 pt-2" style={{ borderTop: "1px solid rgba(217,119,6,0.15)" }}>
                <h5 className="text-[10px] font-bold mb-1.5" style={{ color: "#92400e" }}>Previous Submissions:</h5>
                {invoices.map((batch, bIdx) => (
                  <div key={bIdx} className="mb-1.5 p-2 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="text-[9px] font-semibold" style={{ color: "var(--text-faint)" }}>
                      Batch {batch.batch} - {formatDate(batch.date)}
                      {batch.invoiceNo && <span className="ml-2 font-bold" style={{ color: "var(--primary)" }}>Inv# {batch.invoiceNo}</span>}
                    </div>
                    {(batch.items || []).map((item, iIdx) => (
                      <div key={iIdx} className="flex items-center flex-wrap gap-2 py-0.5 text-[10px]">
                        <span style={{ color: "var(--text)" }}>{item.itemName}: {item.quantityReceived} received</span>
                        {item.attachment && (
                          <button
                            type="button"
                            onClick={() => {
                              let cleanUrl = item.attachment;
                              const urlMatch = item.attachment.match(/https?:\/\/(res\.cloudinary\.com|drive\.google\.com)[^\s[\]]+/);
                              if (urlMatch) cleanUrl = urlMatch[0];
                              setSheetAttachmentUrl(cleanUrl);
                              setShowAttachmentSheet(true);
                            }}
                            className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer font-semibold"
                            style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
                          >
                            📎 View
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      <div className="space-y-4">
        {/* Steps 1, 2, 5, 6, 9, 10 - Simple status selection */}
        {(stepNum === 1 || stepNum === 2 || stepNum === 5 || stepNum === 6 || stepNum === 9 || stepNum === 10) && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Status <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="flex gap-2">
                {["Yes", "No"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStatus(opt)}
                    className="flex-1 py-3 rounded-md text-sm font-semibold transition-all cursor-pointer"
                    style={{
                      background: status === opt ? (opt === "Yes" ? "var(--success)" : "var(--danger)") : "var(--surface-2)",
                      color: status === opt ? "white" : "var(--text)",
                      border: "1px solid " + (status === opt ? "transparent" : "var(--border)"),
                      opacity: status && status !== opt ? 0.5 : 1,
                    }}
                  >
                    {opt === "Yes" ? "✅ Yes" : "❌ No"}
                  </button>
                ))}
              </div>
            </div>

            {/* Attachment (optional for these steps) */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Attachment (optional)
              </label>
              <label
                htmlFor={`file-step-${stepNum}`}
                className="flex items-center justify-center p-4 rounded-lg cursor-pointer transition-all"
                style={{ background: "var(--surface-2)", border: "2px dashed var(--border)" }}
              >
                <input type="file" id={`file-step-${stepNum}`} className="hidden" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2">
                  <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                    <UploadIcon />
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {attachment ? `📎 ${attachment.name}` : "Click or tap to upload file"}
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Step 3 - Requires attachment */}
        {stepNum === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Attachment <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <label
                htmlFor="file-step-3"
                className="flex items-center justify-center p-4 rounded-lg cursor-pointer transition-all"
                style={{ background: "var(--surface-2)", border: "2px dashed var(--border)" }}
              >
                <input type="file" id="file-step-3" className="hidden" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2">
                  <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                    <UploadIcon />
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {attachment ? `📎 ${attachment.name}` : "Click or tap to upload file *"}
                  </p>
                </div>
              </label>
              {!attachment && (
                <p className="mt-1 text-[11px]" style={{ color: "var(--danger)" }}>Attachment is required.</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Status <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="flex gap-2">
                {["Yes", "No"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStatus(opt)}
                    className="flex-1 py-3 rounded-md text-sm font-semibold transition-all cursor-pointer"
                    style={{
                      background: status === opt ? (opt === "Yes" ? "var(--success)" : "var(--danger)") : "var(--surface-2)",
                      color: status === opt ? "white" : "var(--text)",
                      border: "1px solid " + (status === opt ? "transparent" : "var(--border)"),
                      opacity: status && status !== opt ? 0.5 : 1,
                    }}
                  >
                    {opt === "Yes" ? "✅ Yes" : "❌ No"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4 - PO Form */}
        {stepNum === 4 && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Status <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="flex gap-2">
                {["Yes", "No"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStatus(opt)}
                    className="flex-1 py-3 rounded-md text-sm font-semibold transition-all cursor-pointer"
                    style={{
                      background: status === opt ? (opt === "Yes" ? "var(--success)" : "var(--danger)") : "var(--surface-2)",
                      color: status === opt ? "white" : "var(--text)",
                      border: "1px solid " + (status === opt ? "transparent" : "var(--border)"),
                      opacity: status && status !== opt ? 0.5 : 1,
                    }}
                  >
                    {opt === "Yes" ? "✅ Yes" : "❌ No"}
                  </button>
                ))}
              </div>
            </div>

            {status === "Yes" && (
              <div className="space-y-3 p-4 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <h4 className="text-[11px] font-bold" style={{ color: "var(--text)" }}>Purchase Order Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>PO Number *</label>
                    <input type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Location</label>
                    <input type="text" value={poLocation} onChange={(e) => setPoLocation(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Q.No</label>
                    <input type="text" value={qNo} onChange={(e) => setQNo(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Delivery Date *</label>
                    <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Payment Terms (days)</label>
                    <input type="number" value={payTerms} onChange={(e) => setPayTerms(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Attachment (optional) */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Attachment (optional)</label>
              <label htmlFor="file-step-4" className="flex items-center justify-center p-4 rounded-lg cursor-pointer transition-all" style={{ background: "var(--surface-2)", border: "2px dashed var(--border)" }}>
                <input type="file" id="file-step-4" className="hidden" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2">
                  <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}><UploadIcon /></div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? `📎 ${attachment.name}` : "Click or tap to upload file"}</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Step 7 - Invoice and E-Way Bill */}
        {stepNum === 7 && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Invoice Number <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Enter invoice number"
                className="w-full px-3 py-2.5 rounded-md text-xs outline-none"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>

            {/* Quantity entries per item */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                Quantity Received <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              {invoiceEntries.map((ie, idx) => {
                const req = requirements.find((r) => r.itemName === ie.itemName);
                const totals = getHistoryTotals();
                const previouslyReceived = totals[ie.itemName] || 0;
                const totalRequired = req?.quantity || 0;
                const remaining = Math.max(0, totalRequired - previouslyReceived);

                return (
                  <div key={idx} className="p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{ie.itemName}</span>
                      <span className="text-[10px]" style={{ color: previouslyReceived >= totalRequired ? "var(--success)" : "#d97706" }}>
                        {previouslyReceived}/{totalRequired} {req?.unit || ""} received
                        {remaining > 0 && ` (${remaining} remaining)`}
                      </span>
                    </div>
                    <input
                      type="number"
                      value={ie.quantityReceived}
                      onChange={(e) => {
                        const updated = [...invoiceEntries];
                        updated[idx].quantityReceived = e.target.value;
                        setInvoiceEntries(updated);
                      }}
                      placeholder={`Qty received this batch (max ${remaining})`}
                      min="0"
                      max={remaining}
                      className="w-full px-3 py-2 rounded-md text-xs outline-none"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Attachment - required for Step 7 */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Invoice Attachment <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <label htmlFor="file-step-7" className="flex items-center justify-center p-4 rounded-lg cursor-pointer transition-all" style={{ background: "var(--surface-2)", border: "2px dashed var(--border)" }}>
                <input type="file" id="file-step-7" className="hidden" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2">
                  <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}><UploadIcon /></div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? `📎 ${attachment.name}` : "Click or tap to upload invoice file *"}</p>
                </div>
              </label>
              {!attachment && (
                <p className="mt-1 text-[11px]" style={{ color: "var(--danger)" }}>Attachment is required for invoice submission.</p>
              )}
            </div>

            {/* Info about partial submission */}
            {!isFullyMatched() && (
              <div className="p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
                <p className="text-[10px]" style={{ color: "var(--primary)" }}>
                  <strong>Note:</strong> You can submit partial quantities. The workflow will move to Step 8 (Dispatch) for the received quantity. After dispatch, if there are remaining quantities, it will loop back here for the next batch.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 8 - Dispatch */}
        {stepNum === 8 && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Dispatch Mode <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {["Transport", "Courier", "By Hand", "Collect by Client", "Porter", "Direct by Client"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDispatchMode(mode)}
                    className="py-2.5 px-3 rounded-md text-[11px] font-semibold transition-all cursor-pointer"
                    style={{
                      background: dispatchMode === mode ? "var(--primary)" : "var(--surface-2)",
                      color: dispatchMode === mode ? "white" : "var(--text)",
                      border: "1px solid " + (dispatchMode === mode ? "var(--primary)" : "var(--border)"),
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Name *</label>
                <input type="text" value={dispatchName} onChange={(e) => setDispatchName(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Mobile No</label>
                <input type="tel" value={dispatchMobNo} onChange={(e) => setDispatchMobNo(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Invoice/Challan No *</label>
                <input type="text" value={invoiceChallanNo} onChange={(e) => setInvoiceChallanNo(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>LR No</label>
                <input type="text" value={lrNo} onChange={(e) => setLrNo(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
            </div>

            {/* Attachment (optional for dispatch) */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Attachment (optional)</label>
              <label htmlFor="file-step-8" className="flex items-center justify-center p-4 rounded-lg cursor-pointer transition-all" style={{ background: "var(--surface-2)", border: "2px dashed var(--border)" }}>
                <input type="file" id="file-step-8" className="hidden" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2">
                  <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}><UploadIcon /></div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? `📎 ${attachment.name}` : "Click or tap to upload file"}</p>
                </div>
              </label>
            </div>

            {/* Warning about loop back */}
            {!isFullyMatched() && (
              <div className="p-3 rounded-lg" style={{ background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.12)" }}>
                <p className="text-[10px] font-semibold" style={{ color: "var(--danger)" }}>
                  ⚠️ <strong>Important:</strong> Quantities are not fully matched yet. After completing this dispatch, the workflow will return to Step 7 (Invoice) for the remaining quantities. Step 9 will NOT be unlocked until all quantities are matched and dispatched.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Remark (all steps) */}
        <div>
          <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Remark (optional)
          </label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Add any notes..."
            rows={2}
            className="w-full px-3 py-2.5 rounded-md text-xs outline-none resize-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>
      </div>

      {/* Submit / Cancel buttons */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-3 rounded-lg text-xs font-semibold cursor-pointer transition-all"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting || uploadingFile}
          className="flex-1 py-3 rounded-lg text-xs font-bold text-white cursor-pointer transition-all flex items-center justify-center gap-2"
          style={{
            background: isValid ? "var(--success)" : "var(--surface-3)",
            opacity: (!isValid || submitting) ? 0.6 : 1,
          }}
        >
          {(submitting || uploadingFile) && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {uploadingFile ? "Uploading..." : submitting ? "Submitting..." : "Submit Step"}
        </button>
      </div>

      {/* Attachment Preview Sheet */}
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
              ) : sheetAttachmentUrl.match(/\.(pdf)$/i) ? (
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
    </div>
  );
}
