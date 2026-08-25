"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  Cancel01Icon as X,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle,
  InformationCircleIcon as Info,
} from "@hugeicons/core-free-icons";
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@/lib/utils";

export type DialogVariant = "warning" | "info" | "success" | "error";

interface BannersDialogueProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  variant?: DialogVariant;
  primaryAction?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "destructive" | "outline" | "secondary";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  showCloseButton?: boolean;
}

const variantConfig = {
  warning: {
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    borderColor: "border-amber-200",
    backgroundColor: "bg-amber-50",
    titleColor: "text-amber-900",
  },
  info: {
    icon: Info,
    iconColor: "text-blue-500",
    borderColor: "border-blue-200",
    backgroundColor: "bg-blue-50",
    titleColor: "text-blue-900",
  },
  success: {
    icon: CheckCircle,
    iconColor: "text-green-500",
    borderColor: "border-green-200",
    backgroundColor: "bg-green-50",
    titleColor: "text-green-900",
  },
  error: {
    icon: XCircle,
    iconColor: "text-red-500",
    borderColor: "border-red-200",
    backgroundColor: "bg-red-50",
    titleColor: "text-red-900",
  },
};

export default function BannersDialogue({
  isOpen,
  onClose,
  title,
  description,
  variant = "info",
  primaryAction,
  secondaryAction,
  showCloseButton = true,
}: BannersDialogueProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handlePrimaryAction = () => {
    primaryAction?.onClick();
    onClose();
  };

  const handleSecondaryAction = () => {
    secondaryAction?.onClick();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <HugeiconsIcon icon={X} className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        )}

        <div
          className={cn(
            "flex items-start space-x-4 p-6 rounded-t-lg border-l-4",
            config.backgroundColor,
            config.borderColor
          )}
        >
          <div className={cn("flex-shrink-0", config.iconColor)}>
            <HugeiconsIcon icon={Icon} className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <DialogHeader className="text-left space-y-2">
              <DialogTitle
                className={cn("text-lg font-semibold", config.titleColor)}
              >
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600 leading-relaxed">
                {description}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 bg-gray-50 rounded-b-lg">
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 space-y-2 space-y-reverse sm:space-y-0 w-full">
            {secondaryAction && (
              <Button
                variant="outline"
                onClick={handleSecondaryAction}
                className="w-full sm:w-auto"
              >
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button
                variant={primaryAction.variant || "default"}
                onClick={handlePrimaryAction}
                className="w-full sm:w-auto"
              >
                {primaryAction.label}
              </Button>
            )}
            {!primaryAction && !secondaryAction && (
              <Button
                variant="outline"
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
