"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CalendarIcon,
  ClockIcon,
} from "@hugeicons/core-free-icons";
import { useId, useState, useEffect } from "react";
import { format } from "date-fns";

import { Calendar } from "@repo/ui/components/ui/calendar";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Button } from "@repo/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Parses an "HH:mm" value into definite numbers.
 *
 * `split(":").map(Number)` yields `(number | undefined)[]`, and handing
 * `undefined` to `Date.setHours` does not throw — it produces an Invalid Date.
 * So the failure showed up as an empty field with no error, which is the hardest
 * kind to trace. Returning null makes the caller decide.
 */
function parseHhMm(value: string): { hours: number; minutes: number } | null {
  const [h, m] = value.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}


interface DateTimePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  required?: boolean;
  minDate?: Date;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date and time",
  disabled = false,
  className,
  label,
  required = false,
  minDate,
}: DateTimePickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value);
  const [timeValue, setTimeValue] = useState<string>("");

  // Initialize time value when component mounts or value changes
  useEffect(() => {
    if (value) {
      setSelectedDate(value);
      setTimeValue(format(value, "HH:mm"));
    }
  }, [value]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined);
      onChange?.(undefined);
      return;
    }

    let newDate = new Date(date);

    // If we have a time value, apply it to the selected date
    if (timeValue) {
      const parsed = parseHhMm(timeValue);
      if (parsed) newDate.setHours(parsed.hours, parsed.minutes, 0, 0);
    } else {
      // If no time is set, use current time
      const now = new Date();
      newDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
      setTimeValue(format(now, "HH:mm"));
    }

    setSelectedDate(newDate);
    onChange?.(newDate);
  };

  const handleTimeChange = (time: string) => {
    setTimeValue(time);

    if (selectedDate && time) {
      const parsed = parseHhMm(time);
      if (!parsed) return;
      const newDate = new Date(selectedDate);
      newDate.setHours(parsed.hours, parsed.minutes, 0, 0);
      setSelectedDate(newDate);
      onChange?.(newDate);
    }
  };

  const handleClear = () => {
    setSelectedDate(undefined);
    setTimeValue("");
    onChange?.(undefined);
    setOpen(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label htmlFor={id} className="text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <HugeiconsIcon icon={CalendarIcon} className="mr-2 h-4 w-4" />
            {selectedDate ? (
              format(selectedDate, "PPP 'at' HH:mm")
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <div className="rounded-md border-0">
            <Calendar
              mode="single"
              className="p-3"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(date) => {
                if (minDate && date < minDate) return true;
                return false;
              }}
              initialFocus
            />

            <div className="border-t p-3">
              <div className="flex items-center gap-3">
                <Label htmlFor={`${id}-time`} className="text-xs font-medium">
                  Time
                </Label>
                <div className="relative flex-1">
                  <Input
                    id={`${id}-time`}
                    type="time"
                    value={timeValue}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="peer appearance-none ps-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
                    <HugeiconsIcon icon={ClockIcon} size={16} aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-3 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={handleClear}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={!selectedDate}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
