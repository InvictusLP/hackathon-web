"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-3.5 text-up shrink-0" />,
        info: <InfoIcon className="size-3.5 text-primary shrink-0" />,
        warning: <TriangleAlertIcon className="size-3.5 text-amber-500 shrink-0" />,
        error: <OctagonXIcon className="size-3.5 text-destructive shrink-0" />,
        loading: <Loader2Icon className="size-3.5 animate-spin text-muted-foreground shrink-0" />,
      }}
      toastOptions={{
        classNames: {
          toast: "group toast border text-xs shadow-lg backdrop-blur-md rounded-lg select-none font-sans bg-popover/95 text-popover-foreground border-border/80 py-2 px-3 min-h-[36px] max-h-[80px] flex items-center gap-2.5 data-[type=success]:border-up/40 data-[type=error]:border-destructive/40 data-[type=warning]:border-amber-500/40 data-[type=info]:border-border/80",
          title: "font-semibold text-xs text-foreground leading-tight",
          description: "text-muted-foreground text-[11px] leading-tight mt-0.5",
          actionButton: "bg-primary text-primary-foreground text-[11px] font-medium rounded-md px-2 py-0.5 h-6",
          cancelButton: "bg-muted text-muted-foreground text-[11px] font-medium rounded-md px-2 py-0.5 h-6",
          closeButton: "border-border/40 text-muted-foreground hover:text-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "356px",
          maxWidth: "calc(100vw - 2rem)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
