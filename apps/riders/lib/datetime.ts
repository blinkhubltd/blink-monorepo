/**
 * Date and time utility functions
 */

/**
 * Format a date to a readable string
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a date to a short string
 */
export function formatDateShort(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time to HH:MM AM/PM
 */
export function formatTime(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Time';
  
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format date and time together
 */
export const formatDateTime = (dateStr: string | number) => {
  const date = new Date(dateStr);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) {
    return `Today ${timeStr}`;
  }

  const dateStr2 = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${dateStr2} ${timeStr}`;
};

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function getRelativeTime(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMs < 0) {
    // Future date
    const futureDiffMs = Math.abs(diffMs);
    const futureDiffSecs = Math.floor(futureDiffMs / 1000);
    const futureDiffMins = Math.floor(futureDiffSecs / 60);
    const futureDiffHours = Math.floor(futureDiffMins / 60);
    const futureDiffDays = Math.floor(futureDiffHours / 24);
    
    if (futureDiffDays > 0) return `in ${futureDiffDays} day${futureDiffDays > 1 ? 's' : ''}`;
    if (futureDiffHours > 0) return `in ${futureDiffHours} hour${futureDiffHours > 1 ? 's' : ''}`;
    if (futureDiffMins > 0) return `in ${futureDiffMins} minute${futureDiffMins > 1 ? 's' : ''}`;
    return 'in a few seconds';
  }
  
  // Past date
  if (diffDays > 30) return formatDateShort(d);
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffSecs > 0) return `${diffSecs} second${diffSecs > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string | number): boolean {
  const d = new Date(date);
  const today = new Date();
  
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
}

/**
 * Check if a date is yesterday
 */
export function isYesterday(date: Date | string | number): boolean {
  const d = new Date(date);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
}

/**
 * Check if a date is within the last N days
 */
export function isWithinDays(date: Date | string | number, days: number): boolean {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return diffDays >= 0 && diffDays <= days;
}

/**
 * Get the start of day for a given date
 */
export function startOfDay(date: Date | string | number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of day for a given date
 */
export function endOfDay(date: Date | string | number): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Add days to a date
 */
export function addDays(date: Date | string | number, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Add hours to a date
 */
export function addHours(date: Date | string | number, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

/**
 * Get day of week name
 */
export function getDayName(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Get month name
 */
export function getMonthName(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'long' });
}

/**
 * Format duration in milliseconds to readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Get estimated delivery time (adds 30-45 minutes to current time)
 */
export function getEstimatedDeliveryTime(): { min: Date; max: Date; display: string } {
  const now = new Date();
  const minTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
  const maxTime = new Date(now.getTime() + 45 * 60 * 1000); // 45 minutes
  
  return {
    min: minTime,
    max: maxTime,
    display: `${formatTime(minTime)} - ${formatTime(maxTime)}`,
  };
}
