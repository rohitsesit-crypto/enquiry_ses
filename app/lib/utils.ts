// Utility functions for Enquiry Capture O2D

export function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTimestamp(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} at ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`;
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
  const p = new Date(planned);
  const a = new Date(actual);
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
  const planned = new Date(plannedDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  planned.setHours(0, 0, 0, 0);
  return planned < today;
}

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}