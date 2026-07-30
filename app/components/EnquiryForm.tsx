"use client";

import { useState, useEffect } from "react";
import { getCompanyAutoFill } from "../lib/api";

interface RequirementItem {
  itemName: string;
  quantity: string;
  unit: string;
}

interface EnquiryFormProps {
  salesPersons: string[];
  companies: Record<string, unknown>[];
  initialData?: Record<string, unknown>;
  onSubmit: (formData: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
}

export default function EnquiryForm({ salesPersons, companies, initialData, onSubmit, onCancel }: EnquiryFormProps) {
  const [location, setLocation] = useState((initialData?.Location as string) || "");
  const [companyName, setCompanyName] = useState((initialData?.Company_Name as string) || "");
  const [nameOfEnquirer, setNameOfEnquirer] = useState((initialData?.Name_of_Enquirer as string) || "");
  const [mobileNumber, setMobileNumber] = useState(String(initialData?.Mobile_Number || ""));
  const [emailId, setEmailId] = useState(String(initialData?.Email_Id || ""));
  const [requirements, setRequirements] = useState<RequirementItem[]>(() => {
    if (initialData?.Requirements_JSON) {
      try {
        const parsed = JSON.parse(initialData.Requirements_JSON as string);
        return parsed.map((r: { itemName: string; quantity: number; unit: string }) => ({
          itemName: r.itemName || "",
          quantity: String(r.quantity || ""),
          unit: r.unit || "",
        }));
      } catch {
        return [{ itemName: "", quantity: "", unit: "" }];
      }
    }
    return [{ itemName: "", quantity: "", unit: "" }];
  });
  const [salesPerson, setSalesPerson] = useState((initialData?.Sales_Person_Accountable as string) || "");
  const [salesCloseDate, setSalesCloseDate] = useState((initialData?.Sales_Close_Date as string) || "");
  const [typeOfEnquiry, setTypeOfEnquiry] = useState((initialData?.Type_of_Enquiry as string) || "");
  const [remark, setRemark] = useState((initialData?.Remark as string) || "");
  const [submitting, setSubmitting] = useState(false);
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Auto-fill when company name matches
  useEffect(() => {
    if (!companyName || initialData) return;

    const timer = setTimeout(async () => {
      // Check local companies list first
      const match = companies.find(
        (c) => String(c.companyName || "").toLowerCase() === companyName.toLowerCase()
      );
      if (match) {
        setNameOfEnquirer(String(match.nameOfEnquirer || ""));
        setMobileNumber(String(match.mobileNumber || ""));
        setEmailId(String(match.emailId || ""));
      } else {
        // Try API
        try {
          const result = await getCompanyAutoFill(companyName);
          if (result.success && result.data) {
            setNameOfEnquirer(String(result.data.nameOfEnquirer || ""));
            setMobileNumber(String(result.data.mobileNumber || ""));
            setEmailId(String(result.data.emailId || ""));
          }
        } catch { /* ignore */ }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [companyName, companies, initialData]);

  // Company name suggestions
  useEffect(() => {
    if (!companyName || companyName.length < 2) {
      setCompanySuggestions([]);
      return;
    }
    const filtered = companies
      .map((c) => String(c.companyName || ""))
      .filter((name) => name.toLowerCase().includes(companyName.toLowerCase()));
    setCompanySuggestions(filtered.slice(0, 5));
  }, [companyName, companies]);

  const addRequirement = () => {
    setRequirements([...requirements, { itemName: "", quantity: "", unit: "" }]);
  };

  const removeRequirement = (index: number) => {
    if (requirements.length > 1) {
      setRequirements(requirements.filter((_, i) => i !== index));
    }
  };

  const updateRequirement = (index: number, field: keyof RequirementItem, value: string) => {
    const updated = [...requirements];
    updated[index] = { ...updated[index], [field]: value };
    setRequirements(updated);
  };

  const handleSubmit = async () => {
    // Validation
    const mobileStr = String(mobileNumber || "");
    const emailStr = String(emailId || "");
    const companyStr = String(companyName || "");
    const enquirerStr = String(nameOfEnquirer || "");
    if (!location) { alert("Location is required"); return; }
    if (!companyStr.trim()) { alert("Company Name is required"); return; }
    if (!enquirerStr.trim()) { alert("Name of Enquirer is required"); return; }
    if (!mobileStr.trim()) { alert("Mobile Number is required"); return; }
    if (!emailStr.trim()) { alert("Email ID is required"); return; }
    if (!requirements[0]?.itemName.trim()) { alert("At least one requirement item is required"); return; }
    if (!salesPerson) { alert("Sales Person Accountable is required"); return; }
    if (!salesCloseDate) { alert("Sales Close Date is required"); return; }
    if (!typeOfEnquiry) { alert("Type of Enquiry is required"); return; }

    setSubmitting(true);

    const formData = {
      location,
      companyName: companyStr.trim(),
      nameOfEnquirer: enquirerStr.trim(),
      mobileNumber: mobileStr.trim(),
      emailId: emailStr.trim(),
      requirements: requirements
        .filter((r) => r.itemName.trim())
        .map((r) => ({ itemName: r.itemName.trim(), quantity: parseInt(r.quantity) || 0, unit: r.unit.trim() })),
      salesPersonAccountable: salesPerson,
      salesCloseDate,
      typeOfEnquiry,
      remark: remark.trim(),
    };

    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Location */}
      <FormField label="Location" required>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 rounded-md text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <option value="">-- Select Location --</option>
          <option value="Mumbai">Mumbai</option>
          <option value="Boisar">Boisar</option>
        </select>
      </FormField>

      {/* Company Name */}
      <FormField label="Company Name" required>
        <div className="relative">
          <input
            type="text"
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Enter company name"
            className="w-full px-3 py-2 rounded-md text-xs outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          {showSuggestions && companySuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md shadow-lg max-h-40 overflow-y-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              {companySuggestions.map((name, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
                  style={{ color: "var(--text)", borderBottom: "1px solid var(--border-light)" }}
                  onMouseDown={() => { setCompanyName(name); setShowSuggestions(false); }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </FormField>

      {/* Name of Enquirer */}
      <FormField label="Name of Enquirer" required>
        <input
          type="text"
          value={nameOfEnquirer}
          onChange={(e) => setNameOfEnquirer(e.target.value)}
          placeholder="Enter name"
          className="w-full px-3 py-2 rounded-md text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </FormField>

      {/* Mobile Number */}
      <FormField label="Mobile Number" required>
        <input
          type="tel"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          placeholder="Enter mobile number"
          className="w-full px-3 py-2 rounded-md text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </FormField>

      {/* Email ID */}
      <FormField label="Email ID" required>
        <input
          type="email"
          value={emailId}
          onChange={(e) => setEmailId(e.target.value)}
          placeholder="Enter email"
          className="w-full px-3 py-2 rounded-md text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </FormField>

      {/* Requirements */}
      <div>
        <label className="block text-[11px] font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
          Requirements <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <div className="space-y-2">
          {requirements.map((req, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input
                type="text"
                value={req.itemName}
                onChange={(e) => updateRequirement(index, "itemName", e.target.value)}
                placeholder="Item Name"
                className="flex-1 px-3 py-2 rounded-md text-xs outline-none"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <input
                type="number"
                value={req.quantity}
                onChange={(e) => updateRequirement(index, "quantity", e.target.value)}
                placeholder="Qty"
                className="w-20 px-3 py-2 rounded-md text-xs outline-none"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <input
                type="text"
                value={req.unit}
                onChange={(e) => updateRequirement(index, "unit", e.target.value)}
                placeholder="Unit"
                className="w-20 px-3 py-2 rounded-md text-xs outline-none"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              {requirements.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRequirement(index)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: "var(--danger)" }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRequirement}
          className="mt-2 px-3 py-1.5 rounded-md text-[11px] font-semibold"
          style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid var(--primary)" }}
        >
          + Add Item
        </button>
      </div>

      {/* Sales Person Accountable */}
      <FormField label="Sales Person Accountable" required>
        <select
          value={salesPerson}
          onChange={(e) => setSalesPerson(e.target.value)}
          className="w-full px-3 py-2 rounded-md text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <option value="">-- Select Sales Person --</option>
          {salesPersons.map((sp, i) => (
            <option key={i} value={sp}>{sp}</option>
          ))}
        </select>
      </FormField>

      {/* Sales Close Date */}
      <FormField label="Sales Close Date Expected" required>
        <input
          type="date"
          value={salesCloseDate}
          onChange={(e) => setSalesCloseDate(e.target.value)}
          className="w-full px-3 py-2 rounded-md text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </FormField>

      {/* Type of Enquiry */}
      <FormField label="Type of Enquiry" required>
        <select
          value={typeOfEnquiry}
          onChange={(e) => setTypeOfEnquiry(e.target.value)}
          className="w-full px-3 py-2 rounded-md text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <option value="">-- Select Type --</option>
          <option value="Purchase">Purchase</option>
          <option value="General">General</option>
          <option value="Order Received">Order Received</option>
        </select>
      </FormField>

      {/* Remark */}
      <FormField label="Remark">
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Enter remark (optional)"
          rows={3}
          className="w-full px-3 py-2 rounded-md text-xs outline-none resize-y"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </FormField>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-xs font-semibold"
          style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 rounded-md text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
          style={{ background: "var(--success)" }}
        >
          {submitting && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {submitting ? "Submitting..." : initialData ? "Update" : "Submit"}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
        {label} {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
