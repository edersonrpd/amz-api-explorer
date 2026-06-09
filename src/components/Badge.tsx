import React, { ReactNode } from "react";
import { cn } from "../lib/utils";

interface BadgeProps extends React.ComponentProps<"span"> {
  children: ReactNode;
  variant?: "default" | "success" | "error" | "warning" | "info" | "orange";
  className?: string;
  key?: React.Key;
}

export function Badge({ children, variant = "default", className, ...props }: BadgeProps) {
  const variants = {
    default: "bg-gray-100 text-gray-800",
    success: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
    warning: "bg-yellow-100 text-yellow-800",
    info: "bg-blue-100 text-blue-800",
    orange: "bg-[#FF9900]/10 text-[#FF9900]",
  };

  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        (variants as any)[variant] || variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}
