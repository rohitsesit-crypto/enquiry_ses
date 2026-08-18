// =============================================================================
// app/lib/workflow.ts   (NEW FILE — create it)
// =============================================================================
// Single source of truth for the 10 step execution rules.
//
//  Step 1  Quotation            planned = form submission + 1 day
//                               status  = Quoted | Not Quoted | Not Confirmed
//                               Quoted        -> Step 4  (+1 day)
//                               Not Quoted    -> PROCESS STOPPED
//                               Not Confirmed -> Step 2  (+1 day)
//
//  Step 2  Follow Up 1          attachment (mandatory) + same 3 statuses
//                               Quoted        -> Step 4  (+1 day)
//                               Not Quoted    -> PROCESS STOPPED
//                               Not Confirmed -> Step 3  (+1 day)
//
//  Step 3  Follow Up 2          attachment (mandatory) + Yes / No
//                               Yes -> Step 4 (+1 day) | No -> STOPPED
//
//  Step 4  Purchase Date        Yes -> Purchase Order form -> Step 5 (+30 min)
//                               No  -> STOPPED
//
//  Step 5  Acknowledgement      checkbox Yes -> Step 6 (+1 day)
//                               GATE PASS NUMBER IS CREATED HERE (change G)
//
//  Step 6  Inventory Check      Yes -> Step 7 (+1 day)
//                               No  -> Purchase Indent form (no submit)
//                               Gate Pass No is displayed here (change G)
//
//  Step 7  Invoice & E-Way Bill item wise received qty + invoice attachment
//                               partial allowed -> Step 8 (+1 day)
//
//  Step 8  Dispatch             mode + dispatch form -> Step 9 (+1 hour)
//
//  Step 9  IMS Entry Outward    checkbox Yes -> Step 10 (actual + Pay Terms days)
//
//  Step 10 Reminder             checkbox Yes -> PROCESS COMPLETED
// =============================================================================

export const PURCHASE_INDENT_FORM_URL =
  'https://script.google.com/a/macros/saraswateng.com/s/AKfycbykVvZUaUp4TMUs7QjEuMGEUazmeeIhNRAZsmScpJR5oTRFvJxVc7vXv1vu_AUVEeG3sw/exec?page=Form';

export const STEP_TITLES: Record<number, string> = {
  1: 'Quotation',
  2: 'Follow Up 1',
  3: 'Follow Up 2',
  4: 'Purchase Date',
  5: 'Acknowledgement',
  6: 'Inventory Check',
  7: 'Invoice and E-Way Bill',
  8: 'Dispatch',
  9: 'IMS Entry Outward',
  10: 'Reminder',
};

export type StatusTone = 'success' | 'danger' | 'warning';

export interface StatusOption {
  value: string;
  label: string;
  tone: StatusTone;
}

/** How the status control of a step is rendered */
export type StatusControl = 'buttons' | 'checkbox' | 'none';

export interface StepRule {
  /** Status options offered to the user */
  options: StatusOption[];
  /** Rendering of the status control */
  control: StatusControl;
  /** Attachment is mandatory before submitting */
  attachmentRequired: boolean;
  /** Attachment field is shown at all */
  attachmentVisible: boolean;
  /** Attachment control is rendered ABOVE the status control */
  attachmentFirst: boolean;
  /** Step works on item wise quantities (part wise partial submission) */
  quantityBased: boolean;
}

const QUOTE_OPTIONS: StatusOption[] = [
  { value: 'Quoted', label: 'Quoted', tone: 'success' },
  { value: 'Not Quoted', label: 'Not Quoted', tone: 'danger' },
  { value: 'Not Confirmed', label: 'Not Confirmed', tone: 'warning' },
];

const YES_NO_OPTIONS: StatusOption[] = [
  { value: 'Yes', label: 'Yes', tone: 'success' },
  { value: 'No', label: 'No', tone: 'danger' },
];

const YES_ONLY: StatusOption[] = [{ value: 'Yes', label: 'Yes', tone: 'success' }];

export const STEP_RULES: Record<number, StepRule> = {
  1: { options: QUOTE_OPTIONS, control: 'buttons', attachmentRequired: false, attachmentVisible: false, attachmentFirst: false, quantityBased: false },
  2: { options: QUOTE_OPTIONS, control: 'buttons', attachmentRequired: true, attachmentVisible: true, attachmentFirst: true, quantityBased: false },
  3: { options: YES_NO_OPTIONS, control: 'buttons', attachmentRequired: true, attachmentVisible: true, attachmentFirst: true, quantityBased: false },
  4: { options: YES_NO_OPTIONS, control: 'buttons', attachmentRequired: false, attachmentVisible: false, attachmentFirst: false, quantityBased: false },
  5: { options: YES_ONLY, control: 'checkbox', attachmentRequired: false, attachmentVisible: false, attachmentFirst: false, quantityBased: false },
  6: { options: YES_NO_OPTIONS, control: 'buttons', attachmentRequired: false, attachmentVisible: false, attachmentFirst: false, quantityBased: false },
  7: { options: [], control: 'none', attachmentRequired: true, attachmentVisible: true, attachmentFirst: false, quantityBased: true },
  8: { options: YES_ONLY, control: 'checkbox', attachmentRequired: false, attachmentVisible: false, attachmentFirst: false, quantityBased: true },
  9: { options: YES_ONLY, control: 'checkbox', attachmentRequired: false, attachmentVisible: false, attachmentFirst: false, quantityBased: true },
  10: { options: YES_ONLY, control: 'checkbox', attachmentRequired: false, attachmentVisible: false, attachmentFirst: false, quantityBased: true },
};

export const DISPATCH_MODES = [
  'Transport',
  'Courier',
  'By Hand',
  'Collect by Client',
  'Porter',
  'Direct by Client',
] as const;

export type DispatchMode = (typeof DISPATCH_MODES)[number];

// -----------------------------------------------------------------------------
// PLANNED DATE RULES  (offset is keyed by the TARGET step)
// -----------------------------------------------------------------------------

export interface PlannedOffset {
  days?: number;
  hours?: number;
  minutes?: number;
  /** Step 10 only: planned = previous actual date + Pay Terms (days) */
  payTerms?: boolean;
}

export const PLANNED_OFFSET: Record<number, PlannedOffset> = {
  1: { days: 1 },      // 1 day after form submission
  2: { days: 1 },      // 1 day after Step 1 "Not Confirmed"
  3: { days: 1 },      // 1 day after Step 2 "Not Confirmed"
  4: { days: 1 },      // 1 day after whichever step routed here
  5: { minutes: 30 },  // 30 minutes after Step 4
  6: { days: 1 },      // 1 day after Step 5
  7: { days: 1 },      // 1 day after Step 6
  8: { days: 1 },      // 1 day after Step 7
  9: { hours: 1 },     // 1 hour after Step 8
  10: { payTerms: true }, // Step 9 actual date + Pay Terms days
};

function shift(base: Date, offset: PlannedOffset, payTermDays: number): Date {
  const d = new Date(base.getTime());
  if (offset.payTerms) {
    d.setDate(d.getDate() + (payTermDays || 0));
    return d;
  }
  if (offset.days) d.setDate(d.getDate() + offset.days);
  if (offset.hours) d.setHours(d.getHours() + offset.hours);
  if (offset.minutes) d.setMinutes(d.getMinutes() + offset.minutes);
  return d;
}

/**
 * Planned date of `targetStep`, calculated from the moment the previous step
 * was actually submitted.
 *
 * @param targetStep  step whose planned date is required (1..10)
 * @param submittedAt actual submission moment of the routing step
 * @param payTermDays Pay Terms captured in the Step 4 Purchase Order form
 */
export function computePlannedDate(
  targetStep: number,
  submittedAt: Date | string | number,
  payTermDays: number = 0
): Date {
  const base = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  const offset = PLANNED_OFFSET[Number(targetStep)] || { days: 1 };
  return shift(base, offset, payTermDays);
}

/** Human readable rule, shown in the UI so the user can verify the date */
export function describePlannedRule(targetStep: number): string {
  switch (Number(targetStep)) {
    case 1: return '1 day after form submission';
    case 2: return '1 day after Step 1 (Not Confirmed)';
    case 3: return '1 day after Step 2 (Not Confirmed)';
    case 4: return '1 day after the step that confirmed the quotation';
    case 5: return '30 minutes after Step 4 submission';
    case 6: return '1 day after Step 5 submission';
    case 7: return '1 day after Step 6 submission';
    case 8: return '1 day after Step 7 submission';
    case 9: return '1 hour after Step 8 submission';
    case 10: return 'Step 9 actual date + Pay Terms (days)';
    default: return '';
  }
}

// -----------------------------------------------------------------------------
// ROUTING RULES
// -----------------------------------------------------------------------------

export interface RoutingResult {
  /** Next step that becomes Pending, null when the process is finished */
  nextStep: number | null;
  /** true => whole process is stopped here */
  stop: boolean;
  /** Steps that are bypassed by this decision and marked "Skipped" */
  skipped: number[];
  /** true => nothing is submitted (Step 6 "No" only shows the indent form) */
  blockSubmit: boolean;
  /** true => the entry is fully completed */
  complete: boolean;
}

const STOPPED: RoutingResult = { nextStep: null, stop: true, skipped: [], blockSubmit: false, complete: false };

export function resolveRouting(stepNum: number, status: string): RoutingResult {
  const s = Number(stepNum);
  const value = String(status || '').trim();

  if (s === 1) {
    if (value === 'Quoted') return { nextStep: 4, stop: false, skipped: [2, 3], blockSubmit: false, complete: false };
    if (value === 'Not Quoted') return STOPPED;
    if (value === 'Not Confirmed') return { nextStep: 2, stop: false, skipped: [], blockSubmit: false, complete: false };
  }

  if (s === 2) {
    if (value === 'Quoted') return { nextStep: 4, stop: false, skipped: [3], blockSubmit: false, complete: false };
    if (value === 'Not Quoted') return STOPPED;
    if (value === 'Not Confirmed') return { nextStep: 3, stop: false, skipped: [], blockSubmit: false, complete: false };
  }

  if (s === 3) {
    if (value === 'Yes') return { nextStep: 4, stop: false, skipped: [], blockSubmit: false, complete: false };
    return STOPPED;
  }

  if (s === 4) {
    if (value === 'Yes') return { nextStep: 5, stop: false, skipped: [], blockSubmit: false, complete: false };
    return STOPPED;
  }

  if (s === 5) return { nextStep: 6, stop: false, skipped: [], blockSubmit: false, complete: false };

  if (s === 6) {
    if (value === 'Yes') return { nextStep: 7, stop: false, skipped: [], blockSubmit: false, complete: false };
    // "No" -> only the Purchase Indent form, nothing is submitted
    return { nextStep: 6, stop: false, skipped: [], blockSubmit: true, complete: false };
  }

  if (s === 7) return { nextStep: 8, stop: false, skipped: [], blockSubmit: false, complete: false };
  if (s === 8) return { nextStep: 9, stop: false, skipped: [], blockSubmit: false, complete: false };
  if (s === 9) return { nextStep: 10, stop: false, skipped: [], blockSubmit: false, complete: false };
  if (s === 10) return { nextStep: null, stop: false, skipped: [], blockSubmit: false, complete: true };

  return { nextStep: null, stop: false, skipped: [], blockSubmit: true, complete: false };
}

/** Short sentence describing what will happen after submitting */
export function describeRouting(stepNum: number, status: string): string {
  const r = resolveRouting(stepNum, status);
  if (!status) return '';
  if (r.blockSubmit) return 'Fill the Purchase Indent form first, then select Yes.';
  if (r.stop) return 'The whole process will be STOPPED here.';
  if (r.complete) return 'The process will be COMPLETED.';
  if (r.nextStep) {
    return `Moves to Step ${r.nextStep}: ${STEP_TITLES[r.nextStep]} — planned date ${describePlannedRule(r.nextStep)}.`;
  }
  return '';
}

// -----------------------------------------------------------------------------
// GATE PASS NUMBER  (change G — created when Step 5 is completed)
// -----------------------------------------------------------------------------
// Format:  <B|M>-<MonthLetter><MonthNumber><YY><0000 sequence>
// Example: Boisar, July 2026, 1st pass  ->  B-J7260001
//          Mumbai, July 2026, 2nd pass  ->  M-J7260002
// The sequence restarts for every location + month + year combination.
// -----------------------------------------------------------------------------

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function gatePassPrefix(location: string): 'B' | 'M' {
  return String(location || '').trim().toLowerCase() === 'boisar' ? 'B' : 'M';
}

/** The month/year key used by the backend counter, e.g. "B-J726" */
export function gatePassSeriesKey(location: string, when: Date = new Date()): string {
  const prefix = gatePassPrefix(location);
  const letter = MONTH_LETTERS[when.getMonth()];
  const monthNum = when.getMonth() + 1;
  const yy = String(when.getFullYear()).slice(-2);
  return `${prefix}-${letter}${monthNum}${yy}`;
}

/** Builds the full gate pass number for a given running sequence (1 based) */
export function buildGatePassNo(location: string, sequence: number, when: Date = new Date()): string {
  const seq = String(Math.max(1, Math.floor(sequence || 1))).padStart(4, '0');
  return `${gatePassSeriesKey(location, when)}${seq}`;
}

/** Reads the stored gate pass number of an entry (created at Step 5) */
export function getGatePassNo(entry: Record<string, unknown>): string {
  const candidates = ['Gate_Pass_No', 'Step_5_Gate_Pass_No', 'Step_8_Dispatch_GatePassNo'];
  for (const key of candidates) {
    const value = String(entry?.[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

// -----------------------------------------------------------------------------
// PURCHASE ORDER + DISPATCH DETAILS  (change E — visible in Step 4 & dispatch)
// -----------------------------------------------------------------------------

export interface PurchaseOrderDetails {
  poNumber: string;
  location: string;
  qNo: string;
  deliveryDate: string;
  payTerms: number;
}

export interface DispatchDetails {
  mode: string;
  name: string;
  mobNo: string;
  invoiceChallanNo: string;
  gatePassNo: string;
  lrNo: string;
  status: string;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
  return isNaN(n) ? 0 : n;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  const str = text(value);
  if (!str) return {};
  try {
    const parsed = JSON.parse(str);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getPurchaseOrderDetails(entry: Record<string, unknown>): PurchaseOrderDetails | null {
  const json = parseJson(entry?.Step_4_PO_JSON);
  const poNumber = text(entry?.Step_4_PO_Number) || text(json.poNumber);
  const location = text(entry?.Step_4_PO_Location) || text(json.location);
  const qNo = text(entry?.Step_4_PO_QNo) || text(json.qNo);
  const deliveryDate = text(entry?.Step_4_PO_Delivery_Date) || text(json.deliveryDate);
  const payTerms = num(entry?.Step_4_PO_PayTerms) || num(json.payTerms);
  if (!poNumber && !location && !qNo && !deliveryDate && !payTerms) return null;
  return { poNumber, location, qNo, deliveryDate, payTerms };
}

/** Pay Terms (days) captured in Step 4 — used for the Step 10 planned date */
export function getPayTerms(entry: Record<string, unknown>): number {
  const po = getPurchaseOrderDetails(entry);
  return po ? po.payTerms : 0;
}

export function getDispatchDetails(entry: Record<string, unknown>): DispatchDetails | null {
  const json = parseJson(entry?.Step_8_Dispatch_JSON);
  const details: DispatchDetails = {
    mode: text(entry?.Step_8_Dispatch_Mode) || text(json.mode),
    name: text(entry?.Step_8_Dispatch_Name) || text(json.name),
    mobNo: text(entry?.Step_8_Dispatch_MobNo) || text(json.mobNo),
    invoiceChallanNo: text(entry?.Step_8_Dispatch_InvoiceChallanNo) || text(json.invoiceChallanNo),
    gatePassNo: text(entry?.Step_8_Dispatch_GatePassNo) || text(json.gatePassNo) || getGatePassNo(entry),
    lrNo: text(entry?.Step_8_Dispatch_LRNo) || text(json.lrNo),
    status: text(entry?.Step_8_Condition_Answer) || text(json.status),
  };
  const hasAny = Object.values(details).some((v) => !!v);
  return hasAny ? details : null;
}

// -----------------------------------------------------------------------------
// DATE DISPLAY HELPERS
// -----------------------------------------------------------------------------

/**
 * Change B — "Submitted on" must always render as dd/mm/yyyy.
 * The stored value is read literally so there is no timezone / day-month swap.
 */
export function formatSubmittedOn(value: unknown): string {
  const str = text(value);
  if (!str) return '';

  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = parseInt(iso[1]);
    const m = parseInt(iso[2]);
    const d = parseInt(iso[3]);
    if (m >= 1 && m <= 12) {
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
  }

  const dayFirst = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dayFirst) {
    let d = parseInt(dayFirst[1]);
    let m = parseInt(dayFirst[2]);
    const y = parseInt(dayFirst[3]);
    if (m > 12 && d <= 12) {
      const tmp = d;
      d = m;
      m = tmp;
    }
    if (m >= 1 && m <= 12) {
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`;
  }
  return str;
}

/** Storage format used by the Google Sheet: DD-MM-YYYY HH:MM:SS AM/PM */
export function toStorageTimestamp(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${day}-${month}-${year} ${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
}