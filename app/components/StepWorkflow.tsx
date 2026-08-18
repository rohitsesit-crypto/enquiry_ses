
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { formatDate, formatSheetDateOnly, formatStorageDate } from "../lib/utils";
import { uploadToDrive } from "../lib/driveUpload";
import {
  buildPartialPayload,
  getItemAttachmentGroups,
  getRequirements,
  getStepItemProgress,
  getStepPartSummary,
  isPartialStep,
  type StepItemProgress,
} from "../lib/partialSubmission";
import {
  DISPATCH_MODES,
  PURCHASE_INDENT_FORM_URL,
  STEP_RULES,
  STEP_TITLES,
  describePlannedRule,
  describeRouting,
  formatSubmittedOn,
  getDispatchDetails,
  getGatePassNo,
  getPurchaseOrderDetails,
  resolveRouting,
} from "../lib/workflow";

interface StepWorkflowProps {
  entry: Record<string, unknown>;
  stepNum: number;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

/** Sheet tab that stores the Step 7 invoice + attachment rows (change 2) */
export const STEP7_INVOICE_SHEET_NAME = "Step 7 Invoice Attchment";

/** Timestamp exactly in the requested format: 08-08-2026 5:09:21 PM */
export function formatInvoiceLogTimestamp(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  let hour = date.getHours();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hour}:${mi}:${ss} ${ampm}`;
}

function UploadIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function cleanUrl(raw: string): string {
  const match = String(raw || "").match(/https?:\/\/(res\.cloudinary\.com|drive\.google\.com)[^\s[\]]+/);
  return match ? match[0] : String(raw || "");
}

export default function StepWorkflow({ entry, stepNum, onSubmit, onCancel }: StepWorkflowProps) {
  const rule = STEP_RULES[stepNum];
  const partial = isPartialStep(stepNum);

  const [status, setStatus] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [remark, setRemark] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  // Step 4 Purchase Order form
  const [poNumber, setPoNumber] = useState("");
  const [poLocation, setPoLocation] = useState("");
  const [qNo, setQNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [payTerms, setPayTerms] = useState("");

  // Steps 7 / 8 / 9 / 10 part wise quantities
  const [partialQuantities, setPartialQuantities] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");

  // Step 8 Dispatch form
  const [dispatchMode, setDispatchMode] = useState("");
  const [dispatchName, setDispatchName] = useState("");
  const [dispatchMobNo, setDispatchMobNo] = useState("");
  const [lrNo, setLrNo] = useState("");

  const plannedDate = entry[`Step_${stepNum}_Planned_Date`] as string | null;
  const requirements = useMemo(() => getRequirements(entry), [entry]);
  const gatePassNo = useMemo(() => getGatePassNo(entry), [entry]);
  const poDetails = useMemo(() => getPurchaseOrderDetails(entry), [entry]);
  const dispatchDetails = useMemo(() => getDispatchDetails(entry), [entry]);

  const itemProgress = useMemo(
    () => (partial ? getStepItemProgress(entry, stepNum) : []),
    [entry, stepNum, partial]
  );
  const summary = useMemo(
    () => (partial ? getStepPartSummary(entry, stepNum) : null),
    [entry, stepNum, partial]
  );
  // Step 8 shows the Step 7 invoice attachments grouped item wise
  const itemAttachments = useMemo(
    () => (stepNum === 8 ? getItemAttachmentGroups(entry, 7) : []),
    [entry, stepNum]
  );

  // CHANGE 1 — Step 8 quantity is locked (read only), it can never be typed
  const quantityLocked = stepNum === 8;

  // Pre-fill each item with its maximum submittable quantity
  useEffect(() => {
    if (!partial) return;
    const initial: Record<string, string> = {};
    itemProgress.forEach((item) => {
      initial[item.itemName] = String(item.maxSubmittable);
    });
    setPartialQuantities(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepNum]);

  /**
   * Quantity used for validation and for the submitted payload.
   * Step 8 always uses the quantity released by Step 7 (never user input),
   * so the value stays constant exactly as entered in Step 7.
   */
  const getItemQty = (item: StepItemProgress): number => {
    if (quantityLocked) return item.maxSubmittable;
    return parseInt(partialQuantities[item.itemName] || "0") || 0;
  };

  const allowedTotal = itemProgress.reduce((sum, item) => sum + item.maxSubmittable, 0);
  const enteredTotal = itemProgress.reduce((sum, item) => sum + getItemQty(item), 0);
  const balanceTotal = Math.max(0, allowedTotal - enteredTotal);

  const hasQuantityError = itemProgress.some((item) => {
    const value = getItemQty(item);
    return value < 0 || value > item.maxSubmittable;
  });

  const routing = resolveRouting(stepNum, status || (partial ? "Yes" : ""));
  const willStop = !!status && routing.stop;
  const blockSubmit = stepNum === 6 && status === "No";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let attachmentUrl = "";
      if (attachment) {
        setUploadingFile(true);
        try {
          const uploadResult = await uploadToDrive(attachment, String(entry.Entry_ID || "unknown"));
          if (uploadResult.success && uploadResult.url) attachmentUrl = uploadResult.url;
        } catch (err) {
          console.error("Upload error:", err);
        } finally {
          setUploadingFile(false);
        }
      }

      const finalStatus = partial && stepNum === 7 ? "Yes" : status || "Yes";

      const data: Record<string, unknown> = {
        status: finalStatus,
        conditionAnswer: finalStatus,
        remark,
        attachment: attachmentUrl || undefined,
      };

      // Step 4 -> Purchase Order form
      if (stepNum === 4 && status === "Yes") {
        data.poData = {
          poNumber,
          location: poLocation,
          qNo,
          deliveryDate: deliveryDate ? formatStorageDate(deliveryDate) : "",
          payTerms: payTerms ? parseInt(payTerms) : 0,
        };
      }

      // Steps 7 / 8 / 9 / 10 -> every submission creates its own Part
      if (partial) {
        data.partialSubmission = buildPartialPayload({
          stepNumber: stepNum,
          entry,
          items: itemProgress.map((item) => ({
            itemName: item.itemName,
            quantity: getItemQty(item),
          })),
          reference,
          attachment: attachmentUrl,
          remark,
        });

        if (stepNum === 7) {
          data.invoiceData = {
            invoiceNumber: reference,
            items: itemProgress.map((item) => ({
              itemName: item.itemName,
              quantityReceived: getItemQty(item),
              totalQuantity: item.totalQuantity,
              previouslyReceived: item.submitted,
              attachment: attachmentUrl || "",
            })),
          };

          // ---------------------------------------------------------------
          // CHANGE 2 — one row for the "Step 7 Invoice Attchment" sheet tab
          // Columns: Entry_ID | Invoice_No | Timestamp | Attachment_URL
          // ---------------------------------------------------------------
          data.step7InvoiceSheetName = STEP7_INVOICE_SHEET_NAME;
          data.step7InvoiceLog = {
            Entry_ID: String(entry.Entry_ID || ""),
            Invoice_No: reference,
            Timestamp: formatInvoiceLogTimestamp(new Date()),
            Attachment_URL: attachmentUrl || "",
          };
        }
      }

      // Step 8 -> Dispatch form, gate pass number comes from Step 5
      if (stepNum === 8) {
        data.dispatchData = {
          mode: dispatchMode,
          name: dispatchName,
          mobNo: dispatchMobNo,
          invoiceChallanNo: reference,
          gatePassNo,
          lrNo,
          status: "Yes",
        };
      }

      onSubmit(data);
    } catch (error) {
      console.error("Submit error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------
  const isValid = (() => {
    if (blockSubmit) return false;

    if (rule.attachmentRequired && !attachment && !partial) return false;

    if (stepNum === 1) return !!status;
    if (stepNum === 2) return !!status && !!attachment;
    if (stepNum === 3) return !!status && !!attachment;
    if (stepNum === 4) {
      if (!status) return false;
      if (status === "Yes") return !!poNumber && !!poLocation && !!qNo && !!deliveryDate && !!payTerms;
      return true;
    }
    if (stepNum === 5) return status === "Yes";
    if (stepNum === 6) return status === "Yes";

    if (stepNum === 7) {
      if (hasQuantityError || enteredTotal <= 0) return false;
      if (!reference) return false;
      if (!attachment) return false;
      return true;
    }
    if (stepNum === 8) {
      if (hasQuantityError || enteredTotal <= 0) return false;
      if (status !== "Yes") return false;
      // every dispatch form field is mandatory
      return !!dispatchMode && !!dispatchName && !!dispatchMobNo && !!reference && !!lrNo;
    }
    if (stepNum === 9 || stepNum === 10) {
      if (hasQuantityError || enteredTotal <= 0) return false;
      return status === "Yes";
    }
    return !!status;
  })();

  const submitLabel = partial && summary
    ? `Submit Step ${stepNum} Part ${summary.nextPartNumber}`
    : "Submit Step";

  // ---------------------------------------------------------------------------
  // SHARED RENDERERS
  // ---------------------------------------------------------------------------
  const renderStatusButtons = () => (
    <div>
      <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
        Status <span style={{ color: "var(--danger)" }}>*</span>
      </label>
      <div className={rule.options.length > 2 ? "grid grid-cols-1 sm:grid-cols-3 gap-2" : "flex gap-2"}>
        {rule.options.map((opt) => {
          const active = status === opt.value;
          const bg = opt.tone === "success" ? "var(--success)" : opt.tone === "danger" ? "var(--danger)" : "#d97706";
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className="flex-1 py-3 px-3 rounded-md text-[13px] font-semibold transition-all cursor-pointer"
              style={{
                background: active ? bg : "var(--surface-2)",
                color: active ? "#ffffff" : "var(--text)",
                border: "1px solid " + (active ? bg : "var(--border)"),
                opacity: status && !active ? 0.55 : 1,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {!!status && (
        <p className="mt-2 text-[10px] font-semibold" style={{ color: willStop ? "var(--danger)" : "var(--primary)" }}>
          {describeRouting(stepNum, status)}
        </p>
      )}
    </div>
  );

  const renderStatusCheckbox = () => (
    <div>
      <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
        Status <span style={{ color: "var(--danger)" }}>*</span>
      </label>
      <label
        className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
        style={{
          background: status === "Yes" ? "rgba(5,150,105,0.07)" : "var(--surface-2)",
          border: "1px solid " + (status === "Yes" ? "var(--success)" : "var(--border)"),
        }}
      >
        <input
          type="checkbox"
          checked={status === "Yes"}
          onChange={(e) => setStatus(e.target.checked ? "Yes" : "")}
          className="w-4 h-4"
          style={{ accentColor: "var(--success)" }}
        />
        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>Yes</span>
      </label>
      {status === "Yes" && (
        <p className="mt-2 text-[10px] font-semibold" style={{ color: "var(--primary)" }}>
          {describeRouting(stepNum, status)}
        </p>
      )}
    </div>
  );

  const renderAttachment = (required: boolean, label: string = "Upload Attachment") => (
    <div>
      <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
        {label}
        {required ? <span style={{ color: "var(--danger)" }}> *</span> : " (optional)"}
      </label>
      <label
        htmlFor={`file-step-${stepNum}`}
        className="flex items-center justify-center p-4 rounded-lg cursor-pointer"
        style={{ background: "var(--surface-2)", border: "2px dashed " + (attachment ? "var(--success)" : "var(--border)") }}
      >
        <input type="file" id={`file-step-${stepNum}`} className="hidden" onChange={handleFileChange} />
        <div className="flex flex-col items-center gap-2">
          <div style={{ color: attachment ? "var(--success)" : "var(--text-muted)" }}><UploadIcon /></div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {attachment ? `${attachment.name}` : "Click or tap to upload file"}
          </p>
        </div>
      </label>
      {required && !attachment && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--danger)" }}>Attachment is required.</p>
      )}
    </div>
  );

  /** Total banner: how much is matched and how much still remains (change 1) */
  const renderQuantityTotalBanner = () => {
    if (itemProgress.length === 0) return null;
    const matched = allowedTotal > 0 && enteredTotal === allowedTotal;
    return (
      <div
        className="p-2.5 rounded-lg flex items-center justify-between flex-wrap gap-1"
        style={{
          background: matched ? "rgba(5,150,105,0.07)" : "rgba(217,119,6,0.07)",
          border: `1px solid ${matched ? "var(--success)" : "rgba(217,119,6,0.35)"}`,
        }}
      >
        <span className="text-[10px] font-bold" style={{ color: "var(--text)" }}>
          Total entered: {enteredTotal} / {allowedTotal}
        </span>
        <span className="text-[10px] font-bold" style={{ color: matched ? "var(--success)" : "#b45309" }}>
          {matched ? "Matched — full quantity entered" : `${balanceTotal} remaining`}
        </span>
      </div>
    );
  };

  /** STEP 7 (and 9/10) — editable quantity with live remain / matched feedback */
  const renderQuantityInputs = () => (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
        {stepNum === 7 ? "Quantity received for each item" : "Quantity for this submission"}
        <span style={{ color: "var(--danger)" }}> *</span>
      </label>

      {itemProgress.length === 0 && (
        <p className="text-[11px]" style={{ color: "var(--danger)" }}>No requirement items found for this entry.</p>
      )}

      {itemProgress.map((item, idx) => {
        const value = partialQuantities[item.itemName] ?? "";
        const numeric = parseInt(value || "0") || 0;
        const invalid = numeric > item.maxSubmittable || numeric < 0;
        const itemBalance = item.maxSubmittable - numeric;
        const itemMatched = item.maxSubmittable > 0 && numeric === item.maxSubmittable;
        return (
          <div key={idx} className="p-3 rounded-lg" style={{ background: "var(--surface-2)", border: `1px solid ${invalid ? "var(--danger)" : "var(--border)"}` }}>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
              <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{item.itemName}</span>
              <span className="text-[10px]" style={{ color: item.remaining === 0 ? "var(--success)" : "#d97706" }}>
                Form Qty {item.totalQuantity} {item.unit} · Done {item.submitted}
                {item.remaining > 0 ? ` · ${item.remaining} remain` : " · Completed"}
              </span>
            </div>
            <input
              type="number"
              value={value}
              onChange={(e) => setPartialQuantities({ ...partialQuantities, [item.itemName]: e.target.value })}
              placeholder={`Max ${item.maxSubmittable}`}
              min="0"
              max={item.maxSubmittable}
              disabled={item.maxSubmittable <= 0}
              className="w-full px-3 py-2 rounded-md text-xs outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", opacity: item.maxSubmittable <= 0 ? 0.6 : 1 }}
            />

            {/* CHANGE 1 — live remain / matched feedback while typing */}
            {item.maxSubmittable > 0 && !invalid && (
              <p
                className="mt-1 text-[10px] font-bold"
                style={{ color: itemMatched ? "var(--success)" : "#b45309" }}
              >
                {itemMatched
                  ? `Matched — all ${item.maxSubmittable} ${item.unit} entered, 0 remaining`
                  : `Entered ${numeric} ${item.unit} · ${itemBalance} ${item.unit} remaining of ${item.maxSubmittable}`}
              </p>
            )}

            {item.maxSubmittable <= 0 && (
              <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                {item.remaining === 0
                  ? "Fully completed for this step."
                  : `Waiting for Step ${stepNum - 1} to release more quantity.`}
              </p>
            )}
            {invalid && (
              <p className="mt-1 text-[10px]" style={{ color: "var(--danger)" }}>
                Maximum allowed right now is {item.maxSubmittable}.
              </p>
            )}
          </div>
        );
      })}

      {renderQuantityTotalBanner()}

      {summary && enteredTotal > 0 && (
        <p className="text-[10px] font-semibold" style={{ color: "var(--primary)" }}>
          This submission: {enteredTotal} of {summary.totalQuantity} total
          {summary.remainingQuantity - enteredTotal > 0
            ? ` · ${summary.remainingQuantity - enteredTotal} will stay Pending as Step ${stepNum} Part ${summary.nextPartNumber + 1}`
            : ` · Step ${stepNum} will be fully Completed`}
        </p>
      )}
    </div>
  );

  /**
   * CHANGE 1 — STEP 8 : quantity is NOT editable.
   * It is exactly the quantity entered in Step 7 and is only displayed.
   */
  const renderLockedQuantities = () => (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
        Quantity (fixed from Step 7 — cannot be changed)
      </label>

      {itemProgress.length === 0 && (
        <p className="text-[11px]" style={{ color: "var(--danger)" }}>No requirement items found for this entry.</p>
      )}

      {itemProgress.map((item, idx) => (
        <div
          key={idx}
          className="p-3 rounded-lg"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
            <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{item.itemName}</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Form Qty {item.totalQuantity} {item.unit} · Dispatched {item.submitted}
            </span>
          </div>

          <div
            className="w-full px-3 py-2 rounded-md text-xs font-bold flex items-center justify-between"
            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <span>{item.maxSubmittable} {item.unit}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
              FROM STEP 7
            </span>
          </div>

          {item.maxSubmittable <= 0 && (
            <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              {item.remaining === 0
                ? "Fully completed for this step."
                : "Waiting for Step 7 to release quantity."}
            </p>
          )}
        </div>
      ))}

      <div
        className="p-2.5 rounded-lg flex items-center justify-between flex-wrap gap-1"
        style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.22)" }}
      >
        <span className="text-[10px] font-bold" style={{ color: "var(--primary)" }}>
          Total quantity for this dispatch: {enteredTotal}
        </span>
        <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
          Same as Step 7 — locked
        </span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* HEADER */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>
            {partial && summary
              ? `Step ${stepNum} Part ${summary.nextPartNumber}: ${STEP_TITLES[stepNum]}`
              : `Step ${stepNum}: ${STEP_TITLES[stepNum]}`}
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {String(entry.Company_Name || "")} &middot; {String(entry.Name_of_Enquirer || "")}
          </p>
          {plannedDate && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--primary)" }}>
              Planned: {formatDate(plannedDate)} <span style={{ color: "var(--text-faint)" }}>({describePlannedRule(stepNum)})</span>
            </p>
          )}
          {summary && summary.parts.length > 0 && (
            <p className="text-[11px] mt-0.5 font-semibold" style={{ color: "#d97706" }}>
              {summary.remainingQuantity} of {summary.totalQuantity} still pending
            </p>
          )}
        </div>
        <button onClick={onCancel} className="text-lg cursor-pointer" style={{ color: "var(--text-muted)" }}>&#x2715;</button>
      </div>

      {/* ENTRY DETAILS */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <h4 className="text-[11px] font-bold mb-2" style={{ color: "var(--text-secondary)" }}>Entry Details</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {!!entry.Timestamp && <Field label="Submitted On" value={formatSubmittedOn(entry.Timestamp)} />}
          {!!entry.Submitted_By && <Field label="Submitted By" value={String(entry.Submitted_By)} />}
          {!!entry.Location && <Field label="Location" value={String(entry.Location)} />}
          {!!entry.Company_Name && <Field label="Company" value={String(entry.Company_Name)} />}
          {!!entry.Name_of_Enquirer && <Field label="Enquirer" value={String(entry.Name_of_Enquirer)} />}
          {!!entry.Mobile_Number && <Field label="Mobile" value={String(entry.Mobile_Number)} />}
          {!!entry.Email_Id && <Field label="Email" value={String(entry.Email_Id)} />}
          {!!entry.Sales_Person_Accountable && <Field label="Sales Person" value={String(entry.Sales_Person_Accountable)} />}
          {!!entry.Sales_Close_Date && <Field label="Sales Close Date" value={formatSheetDateOnly(entry.Sales_Close_Date)} />}
          {!!entry.Type_of_Enquiry && <Field label="Type of Enquiry" value={String(entry.Type_of_Enquiry)} />}
        </div>
        {!!entry.Remark && (
          <div className="pt-2 mt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <Field label="Remark" value={String(entry.Remark)} />
          </div>
        )}
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

      {/* CHANGE E — PO details visible in Step 4 and every later step */}
      {poDetails && stepNum >= 4 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.18)" }}>
          <h4 className="text-[11px] font-bold mb-2" style={{ color: "var(--primary)" }}>Purchase Order Details</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Field label="PO Number" value={poDetails.poNumber} />
            <Field label="Location" value={poDetails.location} />
            <Field label="Q.No." value={poDetails.qNo} />
            <Field label="Delivery Date" value={formatSheetDateOnly(poDetails.deliveryDate)} />
            <Field label="Pay Terms" value={`${poDetails.payTerms} days`} />
            {!!gatePassNo && <Field label="Gate Pass No" value={gatePassNo} />}
          </div>
        </div>
      )}

      {/* CHANGE G — gate pass number is shown during Step 6 submission */}
      {stepNum === 6 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)" }}>
          <h4 className="text-[11px] font-bold mb-1" style={{ color: "#7c3aed" }}>Gate Pass Number</h4>
          {gatePassNo ? (
            <p className="text-sm font-bold font-mono" style={{ color: "#7c3aed" }}>{gatePassNo}</p>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Gate pass number is generated when Step 5 is completed.
            </p>
          )}
        </div>
      )}

      {/* CHANGE E — dispatch details with gate pass number */}
      {dispatchDetails && stepNum >= 8 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(5,150,105,0.05)", border: "1px solid rgba(5,150,105,0.18)" }}>
          <h4 className="text-[11px] font-bold mb-2" style={{ color: "var(--success)" }}>Dispatch Details</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Field label="Mode" value={dispatchDetails.mode} />
            <Field label="Name" value={dispatchDetails.name} />
            <Field label="Mob No" value={dispatchDetails.mobNo} />
            <Field label="Invoice/Challan No" value={dispatchDetails.invoiceChallanNo} />
            <Field label="Gate Pass No" value={dispatchDetails.gatePassNo} />
            <Field label="LR No" value={dispatchDetails.lrNo} />
          </div>
        </div>
      )}

      {/* PART WISE STATUS PANEL */}
      {partial && summary && summary.totalQuantity > 0 && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.18)" }}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-bold" style={{ color: "#b45309" }}>Step {stepNum} Part-wise Status</h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "var(--surface)", color: summary.isFullySubmitted ? "var(--success)" : "#b45309", border: "1px solid var(--border)" }}>
              {summary.overallStatus}
            </span>
          </div>

          <div className="space-y-1 mb-2">
            {itemProgress.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span style={{ color: "var(--text)" }}>{item.itemName}</span>
                <span style={{ color: item.remaining === 0 ? "var(--success)" : "#d97706" }}>
                  {item.submitted}/{item.totalQuantity} {item.unit}
                  {item.remaining === 0 ? " Completed" : ` (${item.remaining} remain)`}
                </span>
              </div>
            ))}
          </div>

          {summary.allParts.length > 0 && (
            <div className="mt-2 pt-2 space-y-1" style={{ borderTop: "1px solid rgba(217,119,6,0.18)" }}>
              {summary.allParts.map((part, idx) => (
                <div key={idx} className="p-2 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between flex-wrap gap-1.5">
                    <span className="text-[10px] font-bold" style={{ color: "var(--text)" }}>
                      Step {part.stepNumber} Part {part.partNumber}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Qty {part.status === "Pending" ? part.remainingQuantity : part.submittedQuantity} / {part.totalQuantity}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: part.status === "Completed" ? "rgba(5,150,105,0.1)" : "rgba(217,119,6,0.14)", color: part.status === "Completed" ? "var(--success)" : "#b45309" }}>
                      {part.status}
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 mt-0.5">
                    {part.submittedAt && <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>{formatDate(part.submittedAt)}</span>}
                    {part.reference && <span className="text-[9px] font-bold" style={{ color: "var(--primary)" }}>Ref# {part.reference}</span>}
                    {part.submittedBy && <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>{part.submittedBy}</span>}
                    {part.attachment && (
                      <button type="button" onClick={() => setPreviewUrl(cleanUrl(part.attachment))} className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer font-semibold" style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)" }}>
                        View
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* ================= STEP 1 : Quotation ================= */}
        {stepNum === 1 && renderStatusButtons()}

        {/* ================= STEP 2 : Follow Up 1 — attachment FIRST ================= */}
        {stepNum === 2 && (
          <>
            {renderAttachment(true)}
            {renderStatusButtons()}
          </>
        )}

        {/* ================= STEP 3 : Follow Up 2 — attachment FIRST ================= */}
        {stepNum === 3 && (
          <>
            {renderAttachment(true)}
            {renderStatusButtons()}
          </>
        )}

        {/* ================= STEP 4 : Purchase Date ================= */}
        {stepNum === 4 && (
          <>
            {renderStatusButtons()}
            {status === "Yes" && (
              <div className="space-y-3 p-4 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <h4 className="text-[11px] font-bold" style={{ color: "var(--text)" }}>Purchase Order Form</h4>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Po Number *" value={poNumber} onChange={setPoNumber} />
                  <TextInput label="Location *" value={poLocation} onChange={setPoLocation} />
                  <TextInput label="Q.No. *" value={qNo} onChange={setQNo} />
                  <TextInput label="Delivery date *" value={deliveryDate} onChange={setDeliveryDate} type="date" />
                  <div className="col-span-2">
                    <TextInput label="Payterms (days) *" value={payTerms} onChange={setPayTerms} type="number" />
                    <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Step 10 planned date = Step 9 actual date + Payterms days.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= STEP 5 : Acknowledgement ================= */}
        {stepNum === 5 && (
          <>
            {renderStatusCheckbox()}
          </>
        )}

        {/* ================= STEP 6 : Inventory Check ================= */}
        {stepNum === 6 && (
          <>
            {renderStatusButtons()}
            {status === "No" && (
              <div className="p-3 rounded-lg space-y-2.5" style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.16)" }}>
                <p className="text-[11px] font-semibold" style={{ color: "var(--danger)" }}>
                  Inventory not available. Fill the Purchase Indent form, then come back and select Yes to submit this step.
                </p>
                <a
                  href={PURCHASE_INDENT_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full py-3 rounded-md text-xs font-bold text-white cursor-pointer"
                  style={{ background: "var(--primary)" }}
                >
                  Go to Purchase Indent Form
                </a>
              </div>
            )}
          </>
        )}

        {/* ================= STEP 7 : Invoice and E-Way Bill ================= */}
        {stepNum === 7 && (
          <>
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Invoice Number <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Enter invoice number"
                className="w-full px-3 py-2.5 rounded-md text-xs outline-none"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            {renderQuantityInputs()}
            {renderAttachment(true, "Upload Invoice Attachment")}
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Invoice number, quantity and attachment are also saved in the sheet tab
              &quot;{STEP7_INVOICE_SHEET_NAME}&quot;.
            </p>
          </>
        )}

        {/* ================= STEP 8 : Dispatch ================= */}
        {stepNum === 8 && (
          <>
            {/* item wise invoice attachments coming from Step 7 */}
            {itemAttachments.length > 0 && (
              <div className="p-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <h4 className="text-[11px] font-bold mb-2" style={{ color: "var(--text-secondary)" }}>
                  Invoice Attachments (from Step 7)
                </h4>
                <div className="space-y-2">
                  {itemAttachments.map((group, gi) => (
                    <div key={gi} className="p-2 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
                      <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--text)" }}>
                        {group.itemName} : Quantity : {group.submittedQuantity} / {group.totalQuantity} {group.unit}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.files.length === 0 && (
                          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>No attachment yet</span>
                        )}
                        {group.files.map((file, fi) => (
                          <button
                            key={fi}
                            type="button"
                            onClick={() => file.attachment && setPreviewUrl(cleanUrl(file.attachment))}
                            disabled={!file.attachment}
                            className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer font-semibold"
                            style={{ color: "var(--primary)", background: "var(--primary-bg)", border: "1px solid var(--primary)", opacity: file.attachment ? 1 : 0.5 }}
                          >
                            Part {file.partNumber} · Qty {file.quantity}{file.reference ? ` · ${file.reference}` : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CHANGE 1 — quantity is only displayed here, never entered */}
            {renderLockedQuantities()}

            {/* Mode selection */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Mode <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DISPATCH_MODES.map((mode) => {
                  const active = dispatchMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDispatchMode(mode)}
                      className="py-2.5 px-3 rounded-md text-[11px] font-semibold cursor-pointer"
                      style={{
                        background: active ? "var(--primary)" : "var(--surface-2)",
                        color: active ? "#ffffff" : "var(--text)",
                        border: "1px solid " + (active ? "var(--primary)" : "var(--border)"),
                      }}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dispatch form appears only after a mode is chosen */}
            {!!dispatchMode && (
              <div className="space-y-3 p-4 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <h4 className="text-[11px] font-bold" style={{ color: "var(--text)" }}>
                  Dispatch Form — {dispatchMode} (all fields mandatory)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Name *" value={dispatchName} onChange={setDispatchName} />
                  <TextInput label="Mob no *" value={dispatchMobNo} onChange={setDispatchMobNo} type="number" />
                  <TextInput label="Invoice/challan no *" value={reference} onChange={setReference} type="number" />
                  <div>
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Get pass no (auto)</label>
                    <input
                      type="text"
                      value={gatePassNo}
                      readOnly
                      placeholder="Generated at Step 5"
                      className="w-full px-3 py-2 rounded-md text-xs outline-none font-mono font-bold"
                      style={{ background: "var(--surface-3)", border: "1px solid var(--border)", color: "#3adeed" }}
                    />
                  </div>
                  <TextInput label="LR NO *" value={lrNo} onChange={setLrNo} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    Status of dispatch <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <label
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
                    style={{
                      background: status === "Yes" ? "rgba(5,150,105,0.07)" : "var(--surface)",
                      border: "1px solid " + (status === "Yes" ? "var(--success)" : "var(--border)"),
                    }}
                  >
                    <input type="checkbox" checked={status === "Yes"} onChange={(e) => setStatus(e.target.checked ? "Yes" : "")} className="w-4 h-4" style={{ accentColor: "var(--success)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>YES</span>
                  </label>
                </div>
              </div>
            )}

            {renderAttachment(false)}
          </>
        )}

        {/* ================= STEP 9 : IMS Entry Outward ================= */}
        {stepNum === 9 && (
          <>
            {renderQuantityInputs()}
            {renderStatusCheckbox()}
          </>
        )}

        {/* ================= STEP 10 : Reminder ================= */}
        {stepNum === 10 && (
          <>
            {poDetails && (
              <div className="p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.16)" }}>
                <p className="text-[10px]" style={{ color: "var(--primary)" }}>
                  Planned date = Step 9 actual date + Payterms ({poDetails.payTerms} days).
                </p>
              </div>
            )}
            {renderQuantityInputs()}
            {renderStatusCheckbox()}
          </>
        )}

        {/* PARTIAL NOTE */}
        {partial && summary && summary.totalQuantity > 0 && (
          <div className="p-3 rounded-lg" style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.14)" }}>
            <p className="text-[10px]" style={{ color: "var(--primary)" }}>
              <strong>Partial submission:</strong> the submitted quantity is saved as <strong>Step {stepNum} Part {summary.nextPartNumber}</strong> (Completed).
              Any remaining quantity stays <strong>Pending</strong> as the next part of Step {stepNum} and can still be submitted from here,
              while Step {stepNum + 1} Part 1 becomes submittable at the same time.
            </p>
          </div>
        )}

        {/* REMARK */}
        <div>
          <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Remark (optional)</label>
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

      {/* ACTIONS */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-3 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          Cancel
        </button>
        {!blockSubmit && (
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting || uploadingFile}
            className="flex-1 py-3 rounded-lg text-xs font-bold text-white cursor-pointer flex items-center justify-center gap-2"
            style={{
              background: !isValid ? "var(--surface-3)" : willStop ? "var(--danger)" : "var(--success)",
              color: !isValid ? "var(--text-faint)" : "#ffffff",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {(submitting || uploadingFile) && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {uploadingFile ? "Uploading..." : submitting ? "Submitting..." : willStop ? "Submit & Stop Process" : submitLabel}
          </button>
        )}
      </div>

      {/* ATTACHMENT PREVIEW */}
      {!!previewUrl && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setPreviewUrl(""); }}>
          <div className="w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl overflow-hidden" style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>Attachment Preview</h3>
              <button onClick={() => setPreviewUrl("")} className="w-7 h-7 rounded-full flex items-center justify-center text-sm cursor-pointer" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>&#x2715;</button>
            </div>
            <div className="p-5 flex flex-col items-center gap-4">
              {previewUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ? (
                <img src={previewUrl} alt="Attachment" className="max-w-full max-h-[60vh] rounded-lg object-contain" />
              ) : previewUrl.match(/\.pdf$/i) ? (
                <iframe src={previewUrl} className="w-full h-[60vh] rounded-lg" title="PDF Preview" />
              ) : (
                <p className="text-xs py-8" style={{ color: "var(--text-muted)" }}>Preview not available for this file type</p>
              )}
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-md text-xs font-semibold text-white cursor-pointer" style={{ background: "var(--primary)" }}>Open in New Tab</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[11px]" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function TextInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
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
