import type { Routine, Weekday } from "../types";

export const WEEKDAYS: Array<{
  value: Weekday;
  label: string;
  shortLabel: string;
  dayIndex: number;
}> = [
  { value: "monday", label: "Monday", shortLabel: "Mon", dayIndex: 1 },
  { value: "tuesday", label: "Tuesday", shortLabel: "Tue", dayIndex: 2 },
  { value: "wednesday", label: "Wednesday", shortLabel: "Wed", dayIndex: 3 },
  { value: "thursday", label: "Thursday", shortLabel: "Thu", dayIndex: 4 },
  { value: "friday", label: "Friday", shortLabel: "Fri", dayIndex: 5 },
  { value: "saturday", label: "Saturday", shortLabel: "Sat", dayIndex: 6 },
  { value: "sunday", label: "Sunday", shortLabel: "Sun", dayIndex: 0 },
];

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function getNextScheduledDate(
  routine: Routine,
  from = new Date(),
  minimumLeadMs = 3000,
): Date | null {
  const [hours, minutes] = routine.scheduledTime.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  if (
    routine.scheduleMode === "specific_days" &&
    routine.daysOfWeek.length === 0
  ) {
    return null;
  }

  const allowedDays =
    routine.scheduleMode === "every_day"
      ? new Set([0, 1, 2, 3, 4, 5, 6])
      : new Set(routine.daysOfWeek.map((day) => WEEKDAY_INDEX[day]));

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    if (!allowedDays.has(candidate.getDay())) continue;

    if (candidate.getTime() > from.getTime() + minimumLeadMs) {
      return candidate;
    }
  }

  return null;
}
