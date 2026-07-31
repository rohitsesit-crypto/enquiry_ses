// Utility functions for Enquiry Capture O2D

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
 *  - Any other value understood by the Date constructor (ISO strings)
 */
export function parseDateString(dateStr: string | Date | null): Date {
  return parseDate(dateStr);
}

function parseDate(input: string | Date | null): Date {
  if (input instanceof Date) return input;
  const str = String(input ?? '').trim();
  if (!str) return new Date(NaN);

  // 1) Day-first numeric: DD-MM-YYYY [HH:MM[:SS] [AM|PM]]
  const numeric = str.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (numeric) {
    const [, day, month, year, hours, minutes, seconds, ampm] = numeric;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
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

  // 4) Fallback to standard Date parsing (ISO timestamps etc.)
  return new Date(str);
}

/** UI date only: 28 Jul 2026 */
export function formatDateOnly(date: Date | string | null): string {
  if (!date) return '';
  const d = parseDate(date);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
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
