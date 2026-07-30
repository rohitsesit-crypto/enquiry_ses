"use client";

import React, { useState, useEffect } from "react";
import { STEP_NAMES } from "../lib/types";
import { formatDateOnly } from "../lib/utils";
import { uploadToCloudinary } from "../lib/cloudinary";

/**
 * Formats a Date object to Asian format: DD-MM-YYYY HH:MM:SS AM/PM
 * Used for timestamping each attachment upload
 */
function formatAsianTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hStr = String(h).padStart(2, '0');
  return `${day}-${month}-${year} ${hStr}:${m}:${s} ${ampm}`;
}

interface StepWorkflowProps {
  entry: Record<string, unknown>;
  stepNum: number;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
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
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceEntries, setInvoiceEntries] = useState<{ itemName: string; quantityReceived: string; attachment: File | null; uploadedUrl: string }[]>([]);

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

  // Get history totals for step 7
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

  // Initialize invoice entries for step 7
  useEffect(() => {
    if (stepNum === 7 && requirements.length > 0 && invoiceEntries.length === 0) {
      setInvoiceEntries(requirements.map((r) => ({ itemName: r.itemName, quantityReceived: "", attachment: null, uploadedUrl: "" })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepNum]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    const data: Record<string, unknown> = { remark };

    // For steps that require attachment (all steps except 7 which handles its own attachments)
    // Make attachment compulsory for steps that have attachment upload UI
    if (stepNum !== 7) {
      // Steps 1, 5, 9, 10 don't have attachment upload UI shown by default
      // Steps 2, 3, 4, 6, 8 have attachment upload - make it compulsory
      const stepsRequiringAttachment = [2, 3, 4, 5, 6, 8, 9, 10];
      if (stepsRequiringAttachment.includes(stepNum) && !attachment) {
        alert("Attachment upload is compulsory. Please upload a file.");
        setSubmitting(false);
        return;
      }
    }

    // Handle attachment upload to Cloudinary
    if (attachment) {
      setUploadingFile(true);
      const entryId = String(entry.Entry_ID || "unknown");
      const result = await uploadToCloudinary(attachment, `fms/${entryId}/step-${stepNum}`);
      setUploadingFile(false);

      if (result.success && result.url) {
        data.attachment = result.url;
      } else {
        alert("File upload failed: " + (result.error || "Unknown error"));
        setSubmitting(false);
        return;
      }
    }

    switch (stepNum) {
      case 1: // Quotation
        if (!status) { alert("Please select a status"); setSubmitting(false); return; }
        if (!attachment) { alert("Attachment upload is compulsory. Please upload a file."); setSubmitting(false); return; }
        data.conditionAnswer = status;
        data.status = status;
        break;

      case 2: // Follow Up 1
        if (!status) { alert("Please select a status"); setSubmitting(false); return; }
        data.conditionAnswer = status;
        data.status = status;
        break;

      case 3: // Follow Up 2
        if (!status) { alert("Please select Yes or No"); setSubmitting(false); return; }
        data.conditionAnswer = status;
        data.status = status;
        break;

      case 4: // Purchase Date
        if (!status) { alert("Please select Yes or No"); setSubmitting(false); return; }
        data.conditionAnswer = status;
        data.status = status;
        if (status === "Yes") {
          if (!poNumber.trim()) { alert("PO Number is required"); setSubmitting(false); return; }
          if (!poLocation.trim()) { alert("Location is required"); setSubmitting(false); return; }
          if (!qNo.trim()) { alert("Q.No. is required"); setSubmitting(false); return; }
          if (!deliveryDate) { alert("Delivery Date is required"); setSubmitting(false); return; }
          if (!payTerms) { alert("Pay Terms is required"); setSubmitting(false); return; }
          data.poNumber = poNumber.trim();
          data.poLocation = poLocation.trim();
          data.qNo = qNo.trim();
          data.deliveryDate = deliveryDate;
          data.payTerms = parseInt(payTerms);
        }
        break;

      case 5: // Acknowledgement
        data.conditionAnswer = "Yes";
        break;

      case 6: // Inventory Check
        if (!status) { alert("Please select Yes or No"); setSubmitting(false); return; }
        data.conditionAnswer = status;
        data.status = status;
        break;

      case 7: { // Invoice and E-Way Bill
        // Validate Invoice No is entered
        if (!invoiceNo.trim()) {
          alert("Invoice No is required. Please enter the Invoice Number.");
          setSubmitting(false);
          return;
        }

        // Allow partial submissions
        const hasAnyQuantity = invoiceEntries.some((ie) => parseInt(ie.quantityReceived || "0") > 0);
        if (!hasAnyQuantity) {
          alert("Please enter at least one item's received quantity.");
          setSubmitting(false);
          return;
        }

        // Check that at least one attachment is uploaded (compulsory)
        const hasAnyAttachment = invoiceEntries.some((ie) => ie.attachment !== null || ie.uploadedUrl !== "");
        if (!hasAnyAttachment) {
          alert("Attachment upload is compulsory. Please upload at least one invoice attachment.");
          setSubmitting(false);
          return;
        }

        // Upload invoice attachments to Cloudinary
        setUploadingFile(true);
        const entryId = String(entry.Entry_ID || "unknown");
        const invoicesData = [];
        for (let idx = 0; idx < invoiceEntries.length; idx++) {
          const ie = invoiceEntries[idx];
          const qtyReceived = parseInt(ie.quantityReceived || "0");
          let attachmentUrl = ie.uploadedUrl || "";
          // Upload attachment if file is selected
          if (ie.attachment && !ie.uploadedUrl) {
            const uploadResult = await uploadToCloudinary(ie.attachment, `fms/${entryId}/step-7/invoices`);
            if (uploadResult.success && uploadResult.url) {
              attachmentUrl = uploadResult.url;
            } else {
              setUploadingFile(false);
              alert(`Failed to upload attachment for ${ie.itemName}: ${uploadResult.error || "Unknown error"}`);
              setSubmitting(false);
              return;
            }
          }
          const now = new Date();
          const uploadedAt = attachmentUrl ? formatAsianTimestamp(now) : "";
          invoicesData.push({
            itemName: ie.itemName,
            quantityReceived: qtyReceived,
            totalQuantity: requirements[idx]?.quantity || 0,
            attachment: attachmentUrl,
            uploadedAt: uploadedAt,
          });
        }
        setUploadingFile(false);
        data.invoices = invoicesData;
        data.invoiceNo = invoiceNo.trim();

        // Build step 7 invoice attachment entries (line by line for separate sheet tab)
        const step7AttachmentEntries: { entryId: string; invoiceNo: string; timestamp: string; attachmentUrl: string }[] = [];
        invoicesData.forEach((inv) => {
          if (inv.attachment) {
            step7AttachmentEntries.push({
              entryId: String(entry.Entry_ID || ""),
              invoiceNo: invoiceNo.trim(),
              timestamp: inv.uploadedAt,
              attachmentUrl: inv.attachment,
            });
          }
        });
        data.step7AttachmentEntries = step7AttachmentEntries;

        // Also store a flat attachment list for easy Google Sheet column mapping
        const allAttachmentUrls = invoicesData
          .filter((inv) => inv.attachment)
          .map((inv) => `${inv.itemName}: ${inv.attachment}${inv.uploadedAt ? " [" + inv.uploadedAt + "]" : ""}`);
        if (allAttachmentUrls.length > 0) {
          data.attachment = allAttachmentUrls.join(" | ");
        }
        break;
      }

      case 8: // Dispatch
        if (!dispatchMode) { alert("Please select dispatch mode"); setSubmitting(false); return; }
        if (!dispatchName.trim()) { alert("Name is required"); setSubmitting(false); return; }
        if (!dispatchMobNo.trim()) { alert("Mobile number is required"); setSubmitting(false); return; }
        if (!invoiceChallanNo.trim()) { alert("Invoice/Challan No is required"); setSubmitting(false); return; }
        if (!lrNo.trim()) { alert("LR No is required"); setSubmitting(false); return; }
        data.dispatchMode = dispatchMode;
        data.dispatchName = dispatchName.trim();
        data.dispatchMobNo = dispatchMobNo.trim();
        data.invoiceChallanNo = invoiceChallanNo.trim();
        data.lrNo = lrNo.trim();
        data.conditionAnswer = "Yes";
        break;

      case 9: // IMS Entry Outward
        data.conditionAnswer = "Yes";
        break;

      case 10: // Reminder
        data.conditionAnswer = "Yes";
        break;
    }

    onSubmit(data);
    setSubmitting(false);
  };

  // Upload icon SVG component
  const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  return (
    <div>
      <h2 className="text-base font-bold pb-3.5 mb-4 flex items-center gap-2" style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}>
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "var(--primary)" }}>{stepNum}</span>
        {STEP_NAMES[stepNum]}
      </h2>

      {/* Step Info */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 py-1">
          <span className="text-[11px] font-semibold min-w-[100px]" style={{ color: "var(--text-muted)" }}>Step</span>
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{STEP_NAMES[stepNum]}</span>
        </div>
        {plannedDate && (
          <div className="flex items-center gap-2.5 py-1">
            <span className="text-[11px] font-semibold min-w-[100px]" style={{ color: "var(--text-muted)" }}>Planned Date</span>
            <span className="text-xs font-medium" style={{ color: "var(--primary)" }}>{formatDateOnly(plannedDate)}</span>
          </div>
        )}
      </div>

      {/* NOTE: PO Data and Dispatch Data details are NOT shown during step submission */}
      {/* They are only visible in the Task Detail / History view */}

      {/* Step-specific content */}
      {stepNum === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById(`file-step-${stepNum}`)?.click()}
            >
              <input type="file" id={`file-step-${stepNum}`} className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Status <span style={{ color: "var(--danger)" }}>*</span></label>
            <div className="flex gap-2">
              {["Quoted", "Not Quoted", "Not Confirmed"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatus(opt)}
                  className="flex-1 py-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={{
                    background: status === opt ? (opt === "Quoted" ? "var(--success)" : opt === "Not Quoted" ? "var(--danger)" : "var(--warning)") : "var(--surface-2)",
                    color: status === opt ? "white" : "var(--text)",
                    border: "1px solid " + (status === opt ? "transparent" : "var(--border)"),
                    opacity: status && status !== opt ? 0.5 : 1,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {stepNum === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById(`file-step-${stepNum}`)?.click()}
            >
              <input type="file" id={`file-step-${stepNum}`} className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Status <span style={{ color: "var(--danger)" }}>*</span></label>
            <div className="flex gap-2">
              {["Quoted", "Not Quoted", "Not Confirmed"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatus(opt)}
                  className="flex-1 py-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer"
                  style={{
                    background: status === opt ? (opt === "Quoted" ? "var(--success)" : opt === "Not Quoted" ? "var(--danger)" : "var(--warning)") : "var(--surface-2)",
                    color: status === opt ? "white" : "var(--text)",
                    border: "1px solid " + (status === opt ? "transparent" : "var(--border)"),
                    opacity: status && status !== opt ? 0.5 : 1,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {stepNum === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById("file-step-3")?.click()}
            >
              <input type="file" id="file-step-3" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Status <span style={{ color: "var(--danger)" }}>*</span></label>
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

      {stepNum === 4 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById("file-step-4")?.click()}
            >
              <input type="file" id="file-step-4" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Status <span style={{ color: "var(--danger)" }}>*</span></label>
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
            <div className="p-4 rounded-lg space-y-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <h4 className="text-xs font-bold" style={{ color: "var(--text)" }}>Purchase Order Form</h4>
              <InputField label="PO Number" value={poNumber} onChange={setPoNumber} required />
              <InputField label="Location" value={poLocation} onChange={setPoLocation} required />
              <InputField label="Q.No." value={qNo} onChange={setQNo} required />
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Delivery Date <span style={{ color: "var(--danger)" }}>*</span></label>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-3 py-2 rounded-md text-xs outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
              <InputField label="Pay Terms (days)" value={payTerms} onChange={setPayTerms} type="number" required />
            </div>
          )}
        </div>
      )}

      {stepNum === 5 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById("file-step-5")?.click()}
            >
              <input type="file" id="file-step-5" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 p-3 rounded-lg cursor-pointer" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <input type="checkbox" checked={status === "Yes"} onChange={(e) => setStatus(e.target.checked ? "Yes" : "")} className="w-4 h-4" style={{ accentColor: "var(--primary)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>I confirm acknowledgement is done</span>
          </label>
        </div>
      )}

      {stepNum === 6 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById("file-step-6")?.click()}
            >
              <input type="file" id="file-step-6" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Status <span style={{ color: "var(--danger)" }}>*</span></label>
            <div className="flex gap-2">
              {["Yes", "No"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatus(opt)}
                  className="flex-1 py-3 rounded-md text-sm font-semibold transition-all cursor-pointer"
                  style={{
                    background: status === opt ? (opt === "Yes" ? "var(--success)" : "var(--warning)") : "var(--surface-2)",
                    color: status === opt ? "white" : "var(--text)",
                    border: "1px solid " + (status === opt ? "transparent" : "var(--border)"),
                    opacity: status && status !== opt ? 0.5 : 1,
                  }}
                >
                  {opt === "Yes" ? "✅ Yes - Inventory Available" : "⚠️ No - Need Purchase"}
                </button>
              ))}
            </div>
          </div>
          {status === "No" && (
            <div className="p-4 rounded-lg" style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.15)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>Please fill the Purchase Indent form:</p>
              <a
                href="https://script.google.com/a/macros/saraswateng.com/s/AKfycbykVvZUaUp4TMUs7QjEuMGEUazmeeIhNRAZsmScpJR5oTRFvJxVc7vXv1vu_AUVEeG3sw/exec?page=Form"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-white cursor-pointer"
                style={{ background: "var(--primary)" }}
              >
                📋 Open Purchase Indent Form
              </a>
              <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>After filling the form, come back and select &quot;Yes&quot;</p>
            </div>
          )}
        </div>
      )}

      {stepNum === 7 && (
        <div className="space-y-4">
          <h4 className="text-xs font-bold" style={{ color: "var(--text)" }}>Invoice &amp; Quantity Verification</h4>

          {/* Invoice No Input - REQUIRED before adding attachments */}
          <div className="p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--primary)" }}>
              Invoice No <span style={{ color: "var(--danger)" }}>* (Required)</span>
            </label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="Enter Invoice Number"
              className="w-full px-3 py-2.5 rounded-md text-xs outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Enter the invoice number before uploading attachments
            </p>
          </div>

          {/* Show previous partial submission history */}
          {((): React.ReactNode => {
            let existingInvoices: { batch: number; date: string; submittedBy: string; items: { itemName: string; quantityReceived: number; attachment: string; uploadedAt?: string }[] }[] = [];
            try {
              const invoicesStr = entry.Step_7_Invoices_JSON as string;
              if (invoicesStr) existingInvoices = JSON.parse(invoicesStr);
            } catch { /* ignore */ }

            if (existingInvoices.length === 0) return null;

            const historyTotals: Record<string, number> = {};
            existingInvoices.forEach((batch) => {
              (batch.items || []).forEach((item) => {
                if (!historyTotals[item.itemName]) historyTotals[item.itemName] = 0;
                historyTotals[item.itemName] += (item.quantityReceived || 0);
              });
            });

            return (
              <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.15)" }}>
                <h5 className="text-[11px] font-bold mb-2" style={{ color: "#d97706" }}>{"📋 Previous Submissions (" + existingInvoices.length + " batch" + (existingInvoices.length > 1 ? "es" : "") + ")"}</h5>
                {existingInvoices.map((batch, bIdx) => (
                  <div key={bIdx} className="mb-2 p-2 rounded" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                      {"Batch " + batch.batch + " - "}<span style={{ color: "var(--text-secondary)" }}>{formatDateOnly(batch.date)}</span>
                      {batch.submittedBy && <span className="ml-2" style={{ color: "var(--text-faint)" }}>by {batch.submittedBy}</span>}
                    </div>
                    {(batch.items || []).map((item, iIdx) => (
                      <div key={iIdx} className="text-[10px] flex items-center flex-wrap gap-2 py-0.5" style={{ color: "var(--text)" }}>
                        <span>{item.itemName + ": " + item.quantityReceived + " received"}</span>
                        {item.attachment && (
                          <button
                            type="button"
                            onClick={() => { setSheetAttachmentUrl(item.attachment); setShowAttachmentSheet(true); }}
                            className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer font-semibold"
                            style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}
                          >
                            📎 View Attachment
                          </button>
                        )}
                        {item.uploadedAt && (
                          <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                            ⏱️ {formatDateOnly(item.uploadedAt)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>Total received so far:</span>
                  {requirements.map((req, idx) => {
                    const prevQty = historyTotals[req.itemName] || 0;
                    const isItemMatched = prevQty >= req.quantity;
                    return (
                      <div key={idx} className="text-[10px]" style={{ color: isItemMatched ? "var(--success)" : "#d97706" }}>
                        {req.itemName + ": " + prevQty + "/" + req.quantity + " " + req.unit + " " + (isItemMatched ? "✓" : "(" + (req.quantity - prevQty) + " remaining)")}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Enter the quantity received for each item and upload invoice attachments. <span style={{ color: "var(--danger)" }}>Attachment is compulsory.</span></p>
          <div className="space-y-3">
            {requirements.map((req, idx) => {
              const historyTotals = getHistoryTotals();
              const previouslyReceived = historyTotals[req.itemName] || 0;
              const currentInput = parseInt(invoiceEntries[idx]?.quantityReceived || "0");
              const totalReceived = previouslyReceived + currentInput;
              const matched = totalReceived >= req.quantity;
              const remaining = req.quantity - totalReceived;

              return (
                <div key={idx} className="p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid " + (matched ? "var(--success)" : "var(--border)") }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{req.itemName}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: matched ? "rgba(5,150,105,0.08)" : "rgba(217,119,6,0.08)", color: matched ? "var(--success)" : "var(--warning)" }}>
                      {matched ? "✓ Matched" : (remaining + " remaining")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {"Required: " + req.quantity + " " + req.unit + (previouslyReceived > 0 ? " (Already received: " + previouslyReceived + ")" : "")}
                    </span>
                    <input
                      type="number"
                      placeholder="Qty received"
                      value={invoiceEntries[idx]?.quantityReceived || ""}
                      onChange={(e) => {
                        const updated = [...invoiceEntries];
                        if (!updated[idx]) updated[idx] = { itemName: req.itemName, quantityReceived: "", attachment: null, uploadedUrl: "" };
                        updated[idx].quantityReceived = e.target.value;
                        setInvoiceEntries(updated);
                      }}
                      className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                    />
                  </div>
                  <div className="mt-2">
                    <div
                      className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all hover:shadow-sm"
                      style={{ borderColor: invoiceEntries[idx]?.attachment ? "var(--success)" : "var(--border)", background: invoiceEntries[idx]?.attachment ? "rgba(5,150,105,0.04)" : "var(--surface)" }}
                      onClick={() => document.getElementById(`file-invoice-${idx}`)?.click()}
                    >
                      <input
                        type="file"
                        id={`file-invoice-${idx}`}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const updated = [...invoiceEntries];
                            if (!updated[idx]) updated[idx] = { itemName: req.itemName, quantityReceived: "", attachment: null, uploadedUrl: "" };
                            updated[idx].attachment = e.target.files[0];
                            setInvoiceEntries(updated);
                          }
                        }}
                      />
                      <div className="flex items-center justify-center gap-2">
                        <div style={{ color: invoiceEntries[idx]?.attachment ? "var(--success)" : "var(--text-muted)" }}>
                          <UploadIcon />
                        </div>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {invoiceEntries[idx]?.attachment ? "📎 " + invoiceEntries[idx].attachment!.name : "Click to upload invoice *"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stepNum === 8 && (
        <div className="space-y-4">
          {/* Attachment Upload - Compulsory */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById("file-step-8")?.click()}
            >
              <input type="file" id="file-step-8" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>

          {/* Dispatch Mode */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Mode of Dispatch <span style={{ color: "var(--danger)" }}>*</span></label>
            <select
              value={dispatchMode}
              onChange={(e) => setDispatchMode(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-xs outline-none cursor-pointer"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="">-- Select Mode --</option>
              <option value="Transport">Transport</option>
              <option value="Courier">Courier</option>
              <option value="By Hand">By Hand</option>
              <option value="Collect by Client">Collect by Client</option>
              <option value="Porter">Porter</option>
              <option value="Direct by Client">Direct by Client</option>
            </select>
          </div>

          {dispatchMode && (
            <div className="p-4 rounded-lg space-y-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <h4 className="text-xs font-bold" style={{ color: "var(--text)" }}>Dispatch Form</h4>
              <InputField label="Name" value={dispatchName} onChange={setDispatchName} required />
              <InputField label="Mob No" value={dispatchMobNo} onChange={setDispatchMobNo} type="tel" required />
              <InputField label="Invoice/Challan No" value={invoiceChallanNo} onChange={setInvoiceChallanNo} required />
              <div className="flex items-center gap-2.5 py-1">
                <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>Gate Pass No:</span>
                <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>Auto-generated on submit</span>
              </div>
              <InputField label="LR No" value={lrNo} onChange={setLrNo} required />
            </div>
          )}
        </div>
      )}

      {stepNum === 9 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById("file-step-9")?.click()}
            >
              <input type="file" id="file-step-9" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 p-3 rounded-lg cursor-pointer" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <input type="checkbox" checked={status === "Yes"} onChange={(e) => setStatus(e.target.checked ? "Yes" : "")} className="w-4 h-4" style={{ accentColor: "var(--primary)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>I confirm IMS Entry Outward is done</span>
          </label>
        </div>
      )}

      {stepNum === 10 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Attachment <span style={{ color: "var(--danger)" }}>* (Required)</span></label>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: attachment ? "var(--success)" : "var(--border)", background: attachment ? "rgba(5,150,105,0.04)" : "var(--surface-2)" }}
              onClick={() => document.getElementById("file-step-10")?.click()}
            >
              <input type="file" id="file-step-10" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-2">
                <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}>
                  <UploadIcon />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{attachment ? "📎 " + attachment.name : "Click or tap to upload file"}</p>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Reminder step. The planned date is calculated based on Step 9 actual date + Pay Terms from Step 4.
            </p>
          </div>
          <label className="flex items-center gap-2 p-3 rounded-lg cursor-pointer" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <input type="checkbox" checked={status === "Yes"} onChange={(e) => setStatus(e.target.checked ? "Yes" : "")} className="w-4 h-4" style={{ accentColor: "var(--primary)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>I confirm reminder is complete - Payment received</span>
          </label>
        </div>
      )}

      {/* Remark */}
      {[1, 2, 3, 4, 6, 8].includes(stepNum) && (
        <div className="mt-4">
          <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Remark (Optional)</label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
            placeholder="Enter any remark..."
            className="w-full px-3 py-2 rounded-md text-xs outline-none resize-y"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-4 mt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-xs font-semibold cursor-pointer"
          style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          Cancel
        </button>
        {stepNum === 7 ? (() => {
          const historyTotals = getHistoryTotals();
          const allMatched = requirements.every((req, idx) => {
            const currentInput = parseInt(invoiceEntries[idx]?.quantityReceived || "0");
            const prevReceived = historyTotals[req.itemName] || 0;
            return (prevReceived + currentInput) >= req.quantity;
          });
          const totalReceivedQty = invoiceEntries.reduce((sum, ie) => sum + parseInt(ie.quantityReceived || "0"), 0) + Object.values(historyTotals).reduce((sum, v) => sum + v, 0);
          const totalRequiredQty = requirements.reduce((sum, req) => sum + req.quantity, 0);

          return allMatched ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || uploadingFile}
              className="px-4 py-2 rounded-md text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--success)" }}
            >
              {uploadingFile ? "Uploading..." : submitting ? "Submitting..." : "✅ Submit → Move to Step 8"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || uploadingFile || invoiceEntries.every((ie) => parseInt(ie.quantityReceived || "0") === 0)}
              className="px-4 py-2 rounded-md text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              style={{ background: "#d97706" }}
            >
              {uploadingFile ? "Uploading..." : submitting ? "Submitting..." : "📦 Submit Partial (" + totalReceivedQty + "/" + totalRequiredQty + " received)"}
            </button>
          );
        })() : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || uploadingFile || (stepNum === 5 && status !== "Yes") || (stepNum === 9 && status !== "Yes") || (stepNum === 10 && status !== "Yes")}
            className="px-4 py-2 rounded-md text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
            style={{ background: "var(--success)" }}
          >
            {uploadingFile ? "Uploading file..." : submitting ? "Submitting..." : "Submit"}
          </button>
        )}
      </div>

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
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
        {label} {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md text-xs outline-none"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
    </div>
  );
}
