// Working Days Configuration for Incentives Tracking
//
// This configuration defines the working days structure for the incentives system:
// - Week: 6 working days (excluding Sundays)
// - Month: 24 working days (approximately 4 weeks × 6 days)
//
// This affects:
// - Performance projections in charts
// - Weekly to monthly conversion calculations
// - Target achievement calculations

export const WORKING_DAYS_CONFIG = {
  DAILY: 1,
  WEEKLY: 6, // 6 working days per week
  MONTHLY: 24, // 24 working days per month

  // Conversion ratios
  WEEKS_PER_MONTH: 4, // 24 ÷ 6 = 4 weeks per month

  // Helper functions
  getMonthlyProjectionFromDaily: (dailyValue: number) => dailyValue * 24,
  getMonthlyProjectionFromWeekly: (weeklyValue: number) => weeklyValue * 4,
  getWeeklyProjectionFromDaily: (dailyValue: number) => dailyValue * 6,
} as const;

export type WorkingDaysConfig = typeof WORKING_DAYS_CONFIG;
