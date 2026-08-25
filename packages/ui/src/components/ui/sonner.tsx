"use client"

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loading03Icon as Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "@hugeicons/core-free-icons";
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CircleCheckIcon} className="size-4" />,
        info: <HugeiconsIcon icon={InfoIcon} className="size-4" />,
        warning: <HugeiconsIcon icon={TriangleAlertIcon} className="size-4" />,
        error: <HugeiconsIcon icon={OctagonXIcon} className="size-4" />,
        loading: <HugeiconsIcon icon={Loader2Icon} className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
