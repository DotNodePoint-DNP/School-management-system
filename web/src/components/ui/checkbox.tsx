
"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/api/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Dash instead of check — e.g. a role with some but not all actions in a module allowed. */
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate = false, checked, disabled, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null);

    // indeterminate is a DOM property, not an HTML attribute — must be set imperatively
    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    return (
      <span
        className={cn(
          "relative inline-flex h-4 w-4 shrink-0 items-center justify-center",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={(node) => {
            innerRef.current = node;
            if (typeof forwardedRef === "function") forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className={cn(
            "peer h-4 w-4 shrink-0 appearance-none rounded-sm border border-primary shadow",
            "checked:bg-primary indeterminate:bg-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />
        <span className="pointer-events-none absolute inset-0 hidden items-center justify-center text-primary-foreground peer-checked:flex peer-indeterminate:flex">
          {indeterminate ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
        </span>
      </span>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };