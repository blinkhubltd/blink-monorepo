"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  Edit02Icon as Pencil,
  ViewIcon as Eye,
  ViewOffIcon as EyeOff,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Alert, AlertDescription } from "@repo/ui/components/ui/alert";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/ui/form";

interface ProtectedFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hasValue?: boolean;
  required?: boolean;
}

/**
 * ProtectedField component - displays sensitive data like API keys or account numbers
 * Once a value is set, it's masked and can only be edited with a disclaimer
 * Similar to how Resend handles API keys
 */
export function ProtectedField({
  id,
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
  hasValue = false,
  required = false,
}: ProtectedFieldProps) {
  const [isEditing, setIsEditing] = useState(!hasValue);

  const handleEditClick = () => {
    setIsEditing(true);
    onChange(""); // Clear value when entering edit mode
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    onChange(""); // Reset to empty if canceling edit
  };

  // If field has value and not editing, show masked value
  if (hasValue && !isEditing) {
    return (
      <div className="space-y-2.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="flex gap-2 items-center">
          <div className="flex-1 px-3 py-2 bg-muted rounded-md border text-sm font-mono min-h-[40px] flex items-center">
            ••••••••••••••••
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleEditClick}
            disabled={disabled}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            <HugeiconsIcon icon={Pencil} className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          This value is protected and hidden for security
        </p>
      </div>
    );
  }

  // If editing or no value set, show input field
  return (
    <div className="space-y-2.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className="font-mono h-10"
      />
      {hasValue && (
        <>
          <Alert variant="destructive" className="mt-2">
            <HugeiconsIcon icon={AlertCircle} className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Warning:</strong> Updating this value will replace the
              existing value. The old value cannot be recovered once changed.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelEdit}
            disabled={disabled}
            className="text-xs mt-2"
          >
            Cancel Edit
          </Button>
        </>
      )}
    </div>
  );
}

interface ProtectedFormFieldProps {
  label: string;
  placeholder?: string;
  hasValue?: boolean;
  field: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    name: string;
  };
  disabled?: boolean;
}

/**
 * ProtectedFormField - for use with react-hook-form
 */
export function ProtectedFormField({
  label,
  placeholder,
  hasValue = false,
  field,
  disabled = false,
}: ProtectedFormFieldProps) {
  const [isEditing, setIsEditing] = useState(!hasValue);

  const handleEditClick = () => {
    setIsEditing(true);
    field.onChange(""); // Clear value when entering edit mode
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    field.onChange(""); // Reset to empty if canceling edit
  };

  // If field has value and not editing, show masked value
  if (hasValue && !isEditing) {
    return (
      <FormItem>
        <FormLabel className="text-sm font-medium">{label}</FormLabel>
        <div className="flex gap-2 items-center">
          <div className="flex-1 px-3 py-2 bg-muted rounded-md border text-sm font-mono min-h-[40px] flex items-center">
            ••••••••••••••••
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleEditClick}
            disabled={disabled}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            <HugeiconsIcon icon={Pencil} className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          This value is protected and hidden for security
        </p>
        <FormMessage />
      </FormItem>
    );
  }

  // If editing or no value set, show input field
  return (
    <FormItem>
      <FormLabel className="text-sm font-medium">{label}</FormLabel>
      <FormControl>
        <Input
          placeholder={placeholder}
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          disabled={disabled}
          className="font-mono h-10"
        />
      </FormControl>
      {hasValue && (
        <>
          <Alert variant="destructive" className="mt-2">
            <HugeiconsIcon icon={AlertCircle} className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Warning:</strong> Updating this value will replace the
              existing value. The old value cannot be recovered once changed.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelEdit}
            disabled={disabled}
            className="text-xs mt-2"
          >
            Cancel Edit
          </Button>
        </>
      )}
      <FormMessage />
    </FormItem>
  );
}

interface ProtectedDisplayFieldProps {
  icon: React.ReactNode;
  label: string;
  hasValue: boolean;
  onEdit?: () => void;
  showEdit?: boolean;
}

/**
 * ProtectedDisplayField - for read-only display in detail views
 * Shows masked value with optional edit button
 */
export function ProtectedDisplayField({
  icon,
  label,
  hasValue,
  onEdit,
  showEdit = false,
}: ProtectedDisplayFieldProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm font-mono">
            {hasValue ? "••••••••••••••••" : "Not provided"}
          </p>
          {hasValue && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Protected
            </span>
          )}
        </div>
      </div>
      {showEdit && onEdit && (
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      )}
    </div>
  );
}
