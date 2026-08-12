// Utility functions for Enquiry Capture O2D
// Enhanced with robust data normalization for manual Google Sheet entries

/** Short month names used for all UI date rendering: 28 Jul 2026 */
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function to24Hour(hour: number, ampm?: string | null): number {
  let h = hour;
  if (!ampm) return h;
  const marker = ampm.toUpperCase();
  if (marker === 'PM' && h !== 12) h += 12;
  if (marker === 'AM' && h === 12) h = 0;
  return h;
}

/**
 * Parses any date string used across the app into a Date object.
 *
 * Supported inputs (day-first is always assumed for numeric values):
 *  - DD-MM-YYYY HH:MM:SS AM/PM  (storage format used by Google Sheets)
 *  - DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY  (with or without time)
 *  - DD Mon YYYY                (UI format, e.g. 28 Jul 2026, with or without time)
 *  - YYYY-MM-DD                 (native <input type="date"> value)
 *  - MM/DD/YYYY                 (US format from Google Sheets auto-format)
 *  - Any other value understood by the Date constructor (ISO strings)
 */
export function parseDateString(dateStr: string | Date | null): Date {
  return parseDate(dateStr);
}

function parseDate(input: string | Date | null): Date {
  if (input instanceof Date) return input;
  const str = String(input ?? '').trim();
  if (!str) return new Date(NaN);

  // 1) Numeric date: always DD-MM-YYYY (Indian/Asian format)
  // The backend stores all dates as DD-MM-YYYY. Google Sheets may auto-convert
  // separators (dash/slash/dot) but the order remains Day-Month-Year.
  const numeric = str.match(
    /^(\d{1,2})([-/.])(\d{1,2})[-/.](\d{4})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (numeric) {
    const [, part1, , part2, year, hours, minutes, seconds, ampm] = numeric;
    const num1 = parseInt(part1);
    const num2 = parseInt(part2);
    
    let finalDay: number;
    let finalMonth: number;
    
    // Always treat as DD-MM-YYYY (Indian format) regardless of separator.
    // The backend (Google Apps Script) stores all dates as DD-MM-YYYY.
    // Google Sheets may auto-convert dashes to slashes but keeps DD/MM/YYYY order.
    finalDay = num1;
    finalMonth = num2 - 1;
    
    // Safety: if month > 11 after conversion, swap (handles edge cases)
    if (finalMonth > 11) {
      const temp = finalDay;
      finalDay = finalMonth + 1;
      finalMonth = temp - 1;
    }
    
    return new Date(
      parseInt(year),
      finalMonth,
      finalDay,
      to24Hour(parseInt(hours || '0'), ampm),
      parseInt(minutes || '0'),
      parseInt(seconds || '0')
    );
  }

  // 2) UI format: 28 Jul 2026 [HH:MM[:SS] [AM|PM]]
  const named = str.match(
    /^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/
  );
  if (named) {
    const [, day, monthName, year, hours, minutes, seconds, ampm] = named;
    const monthIdx = MONTH_INDEX[monthName.slice(0, 3).toLowerCase()];
    if (monthIdx !== undefined) {
      return new Date(
        parseInt(year),
        monthIdx,
        parseInt(day),
        to24Hour(parseInt(hours || '0'), ampm),
        parseInt(minutes || '0'),
        parseInt(seconds || '0')
      );
    }
  }

  // 3) Native date input value: YYYY-MM-DD (parsed as local midnight, avoids timezone shift)
  const isoDateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const [, year, month, day] = isoDateOnly;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // 4) Google Sheets serial date number (e.g., 45678)
  const serialNum = parseFloat(str);
  if (!isNaN(serialNum) && serialNum > 25000 && serialNum < 100000 && str.match(/^\d+\.?\d*$/)) {
    // Google Sheets serial date: days since Dec 30, 1899
    const baseDate = new Date(1899, 11, 30);
    const resultDate = new Date(baseDate.getTime() + serialNum * 24 * 60 * 60 * 1000);
    return resultDate;
  }

  // 5) Fallback to standard Date parsing (ISO timestamps etc.)
  return new Date(str);
}

/** UI date only: 28 Jul 2026 */
export function formatDateOnly(date: Date | string | null): string {
  if (!date) return '';
  const d = parseDate(date);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Renders a sheet value EXACTLY as it is written in the Google Sheet,
 * without any locale / timezone re-interpretation.
 *
 *   "10-08-2026 05:48:46 PM"      -> "10 Aug 2026"   (day-first, read literally)
 *   "10/08/2026"                  -> "10 Aug 2026"
 *   "2026-08-10T12:18:46.000Z"    -> "10 Aug 2026"   (ISO parts read literally, no TZ shift)
 *
 * Used for form-submission Timestamp and Sales_Close_Date so the UI always
 * mirrors the sheet text instead of guessing DD/MM vs MM/DD.
 */
export function formatSheetDateOnly(value: unknown): string {
  const str = normalizeString(value);
  if (!str) return '';

  // ISO-like value (YYYY-MM-DD...) -> take parts literally, never via Date()
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = parseInt(iso[1]);
    const monthIdx = parseInt(iso[2]) - 1;
    const day = parseInt(iso[3]);
    if (monthIdx >= 0 && monthIdx <= 11) {
      return `${String(day).padStart(2, '0')} ${MONTH_SHORT[monthIdx]} ${year}`;
    }
  }

  // Day-first numeric value as stored/displayed by the sheet: DD-MM-YYYY
  const dayFirst = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dayFirst) {
    let day = parseInt(dayFirst[1]);
    let month = parseInt(dayFirst[2]);
    const year = parseInt(dayFirst[3]);
    // Only swap when the second part cannot be a month (e.g. 08-25-2026)
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }
    if (month >= 1 && month <= 12) {
      return `${String(day).padStart(2, '0')} ${MONTH_SHORT[month - 1]} ${year}`;
    }
  }

  return formatDateOnly(str);
}

/** UI date + time: 28 Jul 2026 03:45 PM */
export function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = parseDate(date);
  if (isNaN(d.getTime())) return '';

  const datePart = formatDateOnly(d);

  // A pure date value (no time component) is shown without a misleading 12:00 AM
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  if (!hasTime) return datePart;

  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;

  return `${datePart} ${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

/** Alias kept for readability at call sites that render timestamps */
export function formatTimestamp(ts: string | Date | null): string {
  return formatDate(ts);
}

/**
 * Storage format expected by the Google Apps Script backend:
 * DD-MM-YYYY HH:MM:SS AM/PM
 */
export function formatStorageTimestamp(date: Date | string | null): string {
  const d = date ? parseDate(date) : new Date();
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${day}-${month}-${year} ${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
}

/** Storage date only: 28-07-2026 (DD-MM-YYYY) */
export function formatStorageDate(date: Date | string | null): string {
  if (!date) return '';
  const d = parseDate(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${d.getFullYear()}`;
}

/**
 * Value for a native <input type="date"> (always YYYY-MM-DD).
 * Accepts any supported input format, so existing DD-MM-YYYY records
 * loaded from the sheet can be edited without a day/month swap.
 */
export function toInputDate(date: Date | string | null): string {
  if (!date) return '';
  const d = parseDate(date);
  if (isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

export function calculateDelayDays(planned: string | null, actual: string | null): number {
  if (!planned || !actual) return 0;
  const p = parseDate(planned);
  const a = parseDate(actual);
  if (isNaN(p.getTime()) || isNaN(a.getTime())) return 0;
  const diffTime = a.getTime() - p.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function generateGatePassNo(location: 'Mumbai' | 'Boisar', currentCount: number): string {
  const now = new Date();
  const monthNames = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const prefix = location === 'Boisar' ? 'B' : 'M';
  const monthLetter = monthNames[now.getMonth()];
  const monthNum = now.getMonth() + 1;
  const yearShort = String(now.getFullYear()).slice(-2);
  const serial = String(currentCount + 1).padStart(4, '0');
  return `${prefix}-${monthLetter}${monthNum}${yearShort}${serial}`;
}

export function isOverdue(plannedDate: string | null): boolean {
  if (!plannedDate) return false;

  const planned = parseDate(plannedDate);
  if (isNaN(planned.getTime())) return false;

  planned.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return planned < today;
}

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;

  const date = parseDate(dateStr);
  if (isNaN(date.getTime())) return false;

  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date.getTime() === today.getTime();
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ==================== DATA NORMALIZATION ====================

/**
 * Normalizes a boolean value from Google Sheets.
 * Handles: TRUE, FALSE, true, false, "TRUE", "FALSE", 1, 0, "1", "0", yes, no, etc.
 */
export function normalizeBoolean(value: unknown): boolean {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  const str = String(value ?? '').trim().toLowerCase();
  return str === 'true' || str === 'yes' || str === 'y';
}

/**
 * Normalizes a number value from Google Sheets.
 * Handles: numbers, strings that look like numbers, empty strings, etc.
 */
export function normalizeNumber(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  const str = String(value ?? '').trim();
  if (!str) return defaultValue;
  const num = parseFloat(str);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Normalizes a string value from Google Sheets.
 * Handles: null, undefined, numbers, booleans, objects, etc.
 */
export function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return String(value).trim();
}

/**
 * Normalizes a JSON string from Google Sheets.
 * Handles: already-parsed objects, malformed JSON, empty values, etc.
 */
export function normalizeJSON<T>(value: unknown, defaultValue: T): T {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    return value as T;
  }
  if (Array.isArray(value)) return value as unknown as T;
  const str = String(value).trim();
  if (!str || str === '[]' || str === '{}') return defaultValue;
  try {
    return JSON.parse(str) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Normalizes a complete entry row from Google Sheets.
 * Ensures all fields have proper types regardless of how they were entered.
 */
export function normalizeEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...entry };

  // Normalize core fields
  normalized.Entry_ID = normalizeString(entry.Entry_ID);
  normalized.Serial_No = normalizeNumber(entry.Serial_No);
  normalized.Timestamp = normalizeString(entry.Timestamp);
  normalized.Submitted_By = normalizeString(entry.Submitted_By);
  normalized.Location = normalizeString(entry.Location);
  normalized.Company_Name = normalizeString(entry.Company_Name);
  normalized.Name_of_Enquirer = normalizeString(entry.Name_of_Enquirer);
  normalized.Mobile_Number = normalizeString(entry.Mobile_Number);
  normalized.Email_Id = normalizeString(entry.Email_Id);
  normalized.Sales_Person_Accountable = normalizeString(entry.Sales_Person_Accountable);
  normalized.Sales_Close_Date = normalizeString(entry.Sales_Close_Date);
  normalized.Type_of_Enquiry = normalizeString(entry.Type_of_Enquiry);
  normalized.Remark = normalizeString(entry.Remark);
  normalized.Current_Step = normalizeNumber(entry.Current_Step, 1);
  normalized.Is_Completed = normalizeBoolean(entry.Is_Completed);
  normalized.Is_Stopped = normalizeBoolean(entry.Is_Stopped);

  // Normalize Requirements_JSON
  const reqRaw = entry.Requirements_JSON;
  if (reqRaw && typeof reqRaw === 'string') {
    normalized.Requirements_JSON = reqRaw;
  } else if (Array.isArray(reqRaw)) {
    normalized.Requirements_JSON = JSON.stringify(reqRaw);
  } else {
    normalized.Requirements_JSON = '[]';
  }

  // Normalize step fields
  for (let s = 1; s <= 10; s++) {
    const statusKey = `Step_${s}_Status`;
    const plannedKey = `Step_${s}_Planned_Date`;
    const actualKey = `Step_${s}_Actual_Date`;
    const delayKey = `Step_${s}_Delay_Days`;
    const attachKey = `Step_${s}_Attachment`;
    const completedByKey = `Step_${s}_Completed_By`;
    const completedTsKey = `Step_${s}_Completed_Timestamp`;
    const condKey = `Step_${s}_Condition_Answer`;
    const remarkKey = `Step_${s}_Remark`;

    // Normalize status - handle various text inputs
    const rawStatus = normalizeString(entry[statusKey]).toLowerCase();
    if (rawStatus === 'completed' || rawStatus === 'done' || rawStatus === 'complete') {
      normalized[statusKey] = 'Completed';
    } else if (rawStatus === 'pending' || rawStatus === 'in progress' || rawStatus === 'active') {
      normalized[statusKey] = 'Pending';
    } else if (rawStatus === 'locked' || rawStatus === 'lock' || rawStatus === '') {
      normalized[statusKey] = 'Locked';
    } else if (rawStatus === 'stopped' || rawStatus === 'stop' || rawStatus === 'cancelled') {
      normalized[statusKey] = 'Stopped';
    } else if (rawStatus === 'skipped' || rawStatus === 'skip') {
      normalized[statusKey] = 'Skipped';
    } else {
      // Keep original if it's already a valid status
      const original = normalizeString(entry[statusKey]);
      normalized[statusKey] = original || 'Locked';
    }

    normalized[plannedKey] = normalizeString(entry[plannedKey]);
    normalized[actualKey] = normalizeString(entry[actualKey]);
    normalized[delayKey] = normalizeNumber(entry[delayKey], 0);
    normalized[attachKey] = normalizeString(entry[attachKey]);
    normalized[completedByKey] = normalizeString(entry[completedByKey]);
    normalized[completedTsKey] = normalizeString(entry[completedTsKey]);
    normalized[condKey] = normalizeString(entry[condKey]);
    normalized[remarkKey] = normalizeString(entry[remarkKey]);
  }

  // Normalize Step 4 PO fields
  normalized.Step_4_PO_Number = normalizeString(entry.Step_4_PO_Number);
  normalized.Step_4_PO_Location = normalizeString(entry.Step_4_PO_Location);
  normalized.Step_4_PO_QNo = normalizeString(entry.Step_4_PO_QNo);
  normalized.Step_4_PO_Delivery_Date = normalizeString(entry.Step_4_PO_Delivery_Date);
  normalized.Step_4_PO_PayTerms = normalizeString(entry.Step_4_PO_PayTerms);
  normalized.Step_4_PO_JSON = normalizeString(entry.Step_4_PO_JSON);

  // Normalize Step 7 Invoice fields
  normalized.Step_7_Invoices_JSON = normalizeString(entry.Step_7_Invoices_JSON);

  // Normalize Step 8 Dispatch fields
  normalized.Step_8_Dispatch_Mode = normalizeString(entry.Step_8_Dispatch_Mode);
  normalized.Step_8_Dispatch_Name = normalizeString(entry.Step_8_Dispatch_Name);
  normalized.Step_8_Dispatch_MobNo = normalizeString(entry.Step_8_Dispatch_MobNo);
  normalized.Step_8_Dispatch_InvoiceChallanNo = normalizeString(entry.Step_8_Dispatch_InvoiceChallanNo);
  normalized.Step_8_Dispatch_GatePassNo = normalizeString(entry.Step_8_Dispatch_GatePassNo);
  normalized.Step_8_Dispatch_LRNo = normalizeString(entry.Step_8_Dispatch_LRNo);
  normalized.Step_8_Dispatch_JSON = normalizeString(entry.Step_8_Dispatch_JSON);

  // Handle Challan_Number if present
  if (entry.Challan_Number !== undefined) {
    normalized.Challan_Number = normalizeString(entry.Challan_Number);
  }

  return normalized;
}

/**
 * Normalizes an array of entries from Google Sheets.
 * Filters out completely empty rows.
 */
export function normalizeEntries(entries: Record<string, unknown>[]): Record<string, unknown>[] {
  return entries
    .map(normalizeEntry)
    .filter((entry) => {
      // Filter out rows that have no Entry_ID and no Company_Name (likely empty rows)
      const id = String(entry.Entry_ID || '').trim();
      const company = String(entry.Company_Name || '').trim();
      return id !== '' || company !== '';
    });
}

/**
 * Generates a hash of entries data for change detection.
 * Used to determine if data has changed since last fetch.
 */
export function generateDataHash(entries: Record<string, unknown>[]): string {
  const key = entries.map((e) => {
    return `${e.Entry_ID}|${e.Current_Step}|${e.Is_Completed}|${e.Is_Stopped}|${
      Array.from({ length: 10 }, (_, i) => e[`Step_${i + 1}_Status`] || '').join(',')
    }`;
  }).join('||');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return String(Math.abs(hash));
}

/**
 * Compares two sets of entries and returns what changed.
 */
export function detectChanges(
  oldEntries: Record<string, unknown>[],
  newEntries: Record<string, unknown>[]
): {
  newItems: Record<string, unknown>[];
  updatedItems: { entry: Record<string, unknown>; changes: string[] }[];
  removedIds: string[];
} {
  const oldMap = new Map<string, Record<string, unknown>>();
  oldEntries.forEach((e) => {
    const id = String(e.Entry_ID || '');
    if (id) oldMap.set(id, e);
  });

  const newMap = new Map<string, Record<string, unknown>>();
  newEntries.forEach((e) => {
    const id = String(e.Entry_ID || '');
    if (id) newMap.set(id, e);
  });

  const newItems: Record<string, unknown>[] = [];
  const updatedItems: { entry: Record<string, unknown>; changes: string[] }[] = [];
  const removedIds: string[] = [];

  // Find new and updated entries
  newMap.forEach((newEntry, id) => {
    const oldEntry = oldMap.get(id);
    if (!oldEntry) {
      newItems.push(newEntry);
    } else {
      const changes: string[] = [];
      // Check key fields for changes
      if (String(oldEntry.Current_Step) !== String(newEntry.Current_Step)) {
        changes.push(`Step changed to ${newEntry.Current_Step}`);
      }
      if (normalizeBoolean(oldEntry.Is_Completed) !== normalizeBoolean(newEntry.Is_Completed)) {
        changes.push(normalizeBoolean(newEntry.Is_Completed) ? 'Completed' : 'Reopened');
      }
      if (normalizeBoolean(oldEntry.Is_Stopped) !== normalizeBoolean(newEntry.Is_Stopped)) {
        changes.push(normalizeBoolean(newEntry.Is_Stopped) ? 'Stopped' : 'Resumed');
      }
      // Check step statuses
      for (let s = 1; s <= 10; s++) {
        const oldStatus = String(oldEntry[`Step_${s}_Status`] || '');
        const newStatus = String(newEntry[`Step_${s}_Status`] || '');
        if (oldStatus !== newStatus && newStatus) {
          changes.push(`Step ${s}: ${oldStatus || 'none'} → ${newStatus}`);
        }
      }
      if (changes.length > 0) {
        updatedItems.push({ entry: newEntry, changes });
      }
    }
  });

  // Find removed entries
  oldMap.forEach((_, id) => {
    if (!newMap.has(id)) {
      removedIds.push(id);
    }
  });

  return { newItems, updatedItems, removedIds };
}

// ==================== HOLIDAY-AWARE DATE CALCULATION ====================

/**
 * Checks if a given date falls on a holiday or Sunday from the provided lists.
 * @param date - The date to check
 * @param holidays - Array of holiday date strings in DD-MM-YYYY format
 * @param sundays - Array of Sunday date strings in DD-MM-YYYY format
 */
export function isHolidayOrSunday(date: Date, holidays: string[], sundays: string[]): boolean {
  const dateStr = formatStorageDate(date); // DD-MM-YYYY
  if (holidays.includes(dateStr)) return true;
  if (sundays.includes(dateStr)) return true;
  // Also check if the date itself is a Sunday (day of week === 0)
  if (date.getDay() === 0) return true;
  return false;
}

/**
 * Gets the next working date by skipping holidays and Sundays.
 * Starting from the given date, advances forward until a working day is found.
 * @param startDate - The initial planned date
 * @param holidays - Array of holiday date strings in DD-MM-YYYY format
 * @param sundays - Array of Sunday date strings in DD-MM-YYYY format
 * @returns The next available working date
 */
export function getNextWorkingDate(startDate: Date, holidays: string[], sundays: string[]): Date {
  const result = new Date(startDate);
  // Safety limit to prevent infinite loop (max 365 days forward)
  let attempts = 0;
  while (isHolidayOrSunday(result, holidays, sundays) && attempts < 365) {
    result.setDate(result.getDate() + 1);
    attempts++;
  }
  return result;
}

/**
 * Formats a relative time string (e.g., "5 seconds ago", "2 minutes ago")
 */
export function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return formatDateOnly(date);
}
