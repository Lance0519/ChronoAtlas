import type { ReactNode } from "react";

export function PanelMessage({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 px-6 py-10">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="max-w-[32ch] text-sm leading-relaxed text-muted">{children}</p>
      {action}
    </div>
  );
}

export function SkeletonRows() {
  return (
    <div aria-busy="true" aria-label="Loading entries" className="space-y-px">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="border-b border-rule px-4 py-4">
          <div className="mb-2 h-3 w-1/3 animate-pulse bg-rule" />
          <div className="h-4 w-4/5 animate-pulse bg-rule/70" />
        </div>
      ))}
    </div>
  );
}

export function ErrorMessage({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="border-b border-rule bg-[#f7e9e2] px-4 py-3 text-sm text-[#7a3720]"
    >
      <p>{children}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 border border-current px-2 py-1 text-xs hover:bg-[#efd8cc]"
        >
          Try again
        </button>
      )}
    </div>
  );
}
