/**
 * Helper functions for vendor schedule validation
 */

type WeeklySchedule = {
  Monday?: { startTime: string; endTime: string };
  Tuesday?: { startTime: string; endTime: string };
  Wednesday?: { startTime: string; endTime: string };
  Thursday?: { startTime: string; endTime: string };
  Friday?: { startTime: string; endTime: string };
  Saturday?: { startTime: string; endTime: string };
  Sunday?: { startTime: string; endTime: string };
};

type VendorSchedule = {
  is_fulltime?: boolean;
  weeklySchedule?: WeeklySchedule;
};

/**
 * Parse time string (HH:mm) to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Get day of week name from Date object
 */
function getDayName(date: Date): keyof WeeklySchedule {
  const days: (keyof WeeklySchedule)[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[date.getDay()];
}

/**
 * Format minutes to HH:mm
 */
function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export type ScheduleValidationResult = {
  isOperational: boolean;
  isTooClose: boolean; // Within 20 minutes of closing
  minutesUntilClose?: number;
  closingTime?: string;
  daySchedule?: { startTime: string; endTime: string };
  reason?: string;
};

/**
 * Check if a vendor is operational at the specified time
 * @param schedule - Vendor's schedule object
 * @param checkTime - Timestamp to check (defaults to now)
 * @returns Validation result with operational status
 */
export function checkVendorSchedule(
  schedule: VendorSchedule | null | undefined,
  checkTime?: number
): ScheduleValidationResult {
  // If no schedule or is fulltime (24/7), vendor is always operational
  if (!schedule || schedule.is_fulltime) {
    return {
      isOperational: true,
      isTooClose: false,
      reason: schedule?.is_fulltime ? "24/7 operation" : "No schedule defined",
    };
  }

  // If no weekly schedule defined, assume operational
  if (!schedule.weeklySchedule) {
    return {
      isOperational: true,
      isTooClose: false,
      reason: "No weekly schedule defined",
    };
  }

  const now = checkTime ? new Date(checkTime) : new Date();

  // Adjust for UTC+3 (East Africa Time) to match vendor operations
  // This ensures we're checking against the local time of the vendor
  const TIMEZONE_OFFSET = 3;
  now.setHours(now.getHours() + TIMEZONE_OFFSET);

  const dayName = getDayName(now);
  const daySchedule = schedule.weeklySchedule[dayName];

  // If no schedule for this day, vendor is closed
  if (!daySchedule) {
    return {
      isOperational: false,
      isTooClose: false,
      reason: `Vendor closed on ${dayName}`,
    };
  }

  // Get current time in minutes since midnight
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(daySchedule.startTime);
  const endMinutes = parseTimeToMinutes(daySchedule.endTime);

  // Check if current time is within operational hours
  const isWithinHours =
    currentMinutes >= startMinutes && currentMinutes < endMinutes;

  if (!isWithinHours) {
    return {
      isOperational: false,
      isTooClose: false,
      daySchedule,
      closingTime: daySchedule.endTime,
      reason:
        currentMinutes < startMinutes
          ? `Vendor opens at ${daySchedule.startTime}`
          : `Vendor closed at ${daySchedule.endTime}`,
    };
  }

  // Check if within 20 minutes of closing time
  const minutesUntilClose = endMinutes - currentMinutes;
  const isTooClose = minutesUntilClose <= 20;

  return {
    isOperational: true,
    isTooClose,
    minutesUntilClose,
    closingTime: daySchedule.endTime,
    daySchedule,
    reason: isTooClose
      ? `Closing in ${minutesUntilClose} minutes`
      : "Within operational hours",
  };
}

/**
 * Get the next opening time for a vendor
 */
export function getNextOpeningTime(
  schedule: VendorSchedule | null | undefined,
  checkTime?: number
): string {
  if (!schedule || schedule.is_fulltime || !schedule.weeklySchedule) {
    return "Always open";
  }

  const now = checkTime ? new Date(checkTime) : new Date();
  
  // Adjust for UTC+3 (East Africa Time)
  const TIMEZONE_OFFSET = 3;
  now.setHours(now.getHours() + TIMEZONE_OFFSET);
  
  let checkDate = new Date(now);

  // Check up to 7 days ahead
  for (let i = 0; i < 7; i++) {
    const dayName = getDayName(checkDate);
    const daySchedule = schedule.weeklySchedule[dayName];

    if (daySchedule) {
      const currentMinutes = checkDate.getHours() * 60 + checkDate.getMinutes();
      const startMinutes = parseTimeToMinutes(daySchedule.startTime);

      // If it's today and before opening time, or it's a future day
      if (i === 0 && currentMinutes < startMinutes) {
        return `Today at ${daySchedule.startTime}`;
      } else if (i === 1) {
        return `Tomorrow at ${daySchedule.startTime}`;
      } else if (i > 0) {
        return `${dayName} at ${daySchedule.startTime}`;
      }
    }

    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1);
    checkDate.setHours(0, 0, 0, 0);
  }

  return "Schedule unavailable";
}

export const ScheduleErrors = {
  VENDOR_CLOSED: "Vendor is currently closed",
  TOO_CLOSE_TO_CLOSING: "Too close to vendor closing time",
  NO_SCHEDULE: "Vendor schedule not available",
} as const;
