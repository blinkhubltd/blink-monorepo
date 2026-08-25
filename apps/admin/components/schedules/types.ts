import { Doc, Id } from "@repo/backend/dataModel";

export type Schedule = Doc<"schedules">;
export type User = Doc<"users">;
export type Vendor = Doc<"vendors">;

export interface ScheduleWithDetails extends Schedule {
  user: (User & { role?: string }) | null;
  vendor: Vendor | null;
}

export interface StaffWithSchedule extends User {
  schedule: Schedule | null;
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export interface DaySchedule {
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface WeeklySchedule {
  Monday?: DaySchedule;
  Tuesday?: DaySchedule;
  Wednesday?: DaySchedule;
  Thursday?: DaySchedule;
  Friday?: DaySchedule;
  Saturday?: DaySchedule;
  Sunday?: DaySchedule;
}

export interface ScheduleFormData {
  userId?: Id<"users">;
  vendorId?: Id<"vendors">;
  weeklySchedule: WeeklySchedule;
}

export interface BulkScheduleFormData {
  userIds: Id<"users">[];
  vendorId?: Id<"vendors">;
  weeklySchedule: WeeklySchedule;
}

// Dynamic role management: any non-customer role name from roles table.
export type StaffRole = string;
