import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS conflict resolution.
 *
 * Internal `@mfe/x-charts` helper — kept local to avoid a runtime
 * dependency on the design-system package (which would create a package
 * cycle once the design-system chart entries become shims around
 * `@mfe/x-charts`).
 *
 * @example
 * cn("px-4 py-2", active && "bg-primary", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
