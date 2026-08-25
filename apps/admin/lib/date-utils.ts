import { format } from "date-fns";
type DateInput = Date | number | string;

export function formatDate(
  date: DateInput,
  formatStr: string = 'MMM d, yyyy'
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }

  const pad = (n: number): string => String(n).padStart(2, '0');

  const formats: Record<string, () => string | number> = {
    // Year
    yyyy: () => d.getFullYear(),
    yy: () => String(d.getFullYear()).slice(-2),
    
    // Month
    MMMM: () => d.toLocaleString('default', { month: 'long' }),
    MMM: () => d.toLocaleString('default', { month: 'short' }),
    MM: () => pad(d.getMonth() + 1),
    M: () => d.getMonth() + 1,
    
    // Day
    dd: () => pad(d.getDate()),
    d: () => d.getDate(),
    
    // Day of week
    EEEE: () => d.toLocaleString('default', { weekday: 'long' }),
    EEE: () => d.toLocaleString('default', { weekday: 'short' }),
    
    // Time
    HH: () => pad(d.getHours()),
    H: () => d.getHours(),
    hh: () => {
      const hours = d.getHours() % 12;
      return pad(hours === 0 ? 12 : hours);
    },
    h: () => {
      const hours = d.getHours() % 12;
      return hours === 0 ? 12 : hours;
    },
    mm: () => pad(d.getMinutes()),
    m: () => d.getMinutes(),
    ss: () => pad(d.getSeconds()),
    s: () => d.getSeconds(),
    a: () => (d.getHours() < 12 ? 'AM' : 'PM'),
    
    // Timezone
    Z: () => {
      const tzOffset = -d.getTimezoneOffset();
      const sign = tzOffset >= 0 ? '+' : '-';
      const hours = Math.floor(Math.abs(tzOffset) / 60);
      const minutes = Math.abs(tzOffset) % 60;
      return `${sign}${pad(hours)}${pad(minutes)}`;
    },
  };

  // Match format tokens and replace them with their values
  return formatStr.replace(/(\[[^\]]+\]|y{4}|y{2}|M{1,4}|d{1,2}|E{1,4}|H{1,2}|h{1,2}|m{1,2}|s{1,2}|a|Z)/g, 
    (match) => {
      // Handle escaped characters in square brackets
      if (match.startsWith('[') && match.endsWith(']')) {
        return match.slice(1, -1);
      }
      return formats[match] ? String(formats[match]()) : match;
    }
  );
}

// Common date formats for easy reuse
export const DATE_FORMATS = {
  SHORT: 'MM/dd/yyyy',
  MEDIUM: 'MMM d, yyyy',
  LONG: 'MMMM d, yyyy',
  FULL: 'EEEE, MMMM d, yyyy',
  TIME: 'h:mm a',
  DATE_TIME: 'MMM d, yyyy h:mm a',
  ISO: 'yyyy-MM-dd',
} as const;

export function formatRelativeTime(date: DateInput): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  } as const;

  for (const [unit, seconds] of Object.entries(intervals)) {
    const interval = Math.floor(diffInSeconds / seconds);
    if (interval >= 1) {
      return interval === 1 
        ? `${interval} ${unit} ago` 
        : `${interval} ${unit}s ago`;
    }
  }
  
  return 'just now';
}

export function isToday(date: DateInput): boolean {
  const d = new Date(date);
  const today = new Date();
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
}

export function isSameDay(date1: DateInput, date2: DateInput): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getDate() === d2.getDate() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getFullYear() === d2.getFullYear();
}

export const formatDateTime = (timestamp: number) => {
    return format(new Date(timestamp), "MMM dd, yyyy 'at' h:mm a");
  };
/**
 * "14:30" -> "2:30 PM".
 *
 * Extracted from two byte-identical copies in ScheduleOverview and
 * ScheduleTable. Both had the same latent bug: `time.split(":")` gives
 * `string | undefined`, and `parseInt(undefined)` is NaN, so a malformed value
 * rendered "NaN:undefined AM" rather than falling into the catch — `parseInt`
 * does not throw. Returning the input unchanged is what the catch was reaching
 * for.
 */
export function formatTimeOfDay(time: string): string {
  const [hoursPart, minutesPart] = time.split(":");
  const hour24 = Number(hoursPart);
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return time;
  if (!minutesPart || !/^\d{2}$/.test(minutesPart)) return time;

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${minutesPart} ${period}`;
}
