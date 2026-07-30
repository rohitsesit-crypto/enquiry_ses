// Utility functions for Enquiry Capture O2D

/**
 * Parses an Asian format timestamp (DD-MM-YYYY HH:MM:SS AM/PM) into a Date object.
 * Also handles ISO strings and other standard date formats.
 */
export function parseDateString(dateStr: string): Date {
  return parseDate(dateStr);
}

function parseDate(dateStr: string): Date {
  // Try Asian format: DD-MM-YYYY HH:MM:SS AM/PM
  const asianMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
  if (asianMatch) {
    const [, day, month, year, hours, minutes, seconds, ampm] = asianMatch;
    let h = parseInt(hours);
    if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(minutes), parseInt(seconds));
  }
  // Fallback to standard Date parsing
  return new Date(dateStr);
}

export function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseDate(date) : date;
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
  const hStr = String(h).padStart(2, '0');
  return `${day}-${month}-${year} ${hStr}:${m}:${s} ${ampm}`;
}
/** Date only, no time: 31-07-2026 */
export function formatDateOnly(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseDate(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatTimestamp(ts: string | null): string {
  if (!ts) return '';
  const d = parseDate(ts);
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
  const hStr = String(h).padStart(2, '0');
  return `${day}-${month}-${year} ${hStr}:${m}:${s} ${ampm}`;
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  planned.setHours(0, 0, 0, 0);
  return planned < today;
}

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const date = parseDate(dateStr);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
