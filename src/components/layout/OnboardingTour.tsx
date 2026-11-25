import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

const TOUR_KEY = "chronoatlas.tour.v1";

const steps = [
  {
    title: "Are you new here?",
    body: "ChronoAtlas is a reading room for historical places and artifacts. Records are sourced drafts; unknown dates and locations stay unknown. Let me show you around.",
    target: null,
  },
  {
    title: "Records",
    body: "This pane lists the records currently in view. Each card is one place or artifact. Select a card to open its full context.",
    target: "feed",
  },
  {
    title: "Find something",
    body: "Search titles, eras, and places. Scope, Type, and Era narrow the corpus. Filters live in the URL, so you can share the exact view you are looking at.",
    target: "search",
  },
  {
    title: "The map",
    body: "The map plots origins and current locations. Filled dots are places, hollow rings are artifact origins, and blue rings are current holdings. Zoom or pan, then use “Search this map area” to limit the list to what you see.",
    target: "map",
  },
  {
    title: "Open the context",
    body: "Click any record card. On a phone, use the bottom tabs to move between Records, Map, and Context. The map will fly to the selected record when a coordinate is known.",
    target: "records",
  },
  {
    title: "Inside the drawer",
    body: "The context drawer holds the summary, image or evidence card, relationships, sources, and your private notes. “Draft · unreviewed” means the record has not been curated.",
    target: "drawer",
  },
  {
    title: "Import and archive",
    body: "Import Wikipedia opens a draft builder. “Local archive” means no account is needed and progress stays in this browser. If Supabase is configured, sign-in and curation controls appear here.",
    target: "header",
  },
  {
    title: "That is the loop",
    body: "Find a record, locate it, inspect its evidence, and check the source before citing it. You can replay this guide any time from the Guide button in the header.",
    target: null,
  },
] as const;

export function OnboardingTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStep(0);
    dialogRef.current?.focus();
    return () => previousFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.querySelectorAll(".tour-highlight").forEach((element) => {
      element.classList.remove("tour-highlight");
    });
    const targetName = steps[step].target;
    if (!targetName) return;
    const target = document.querySelector<HTMLElement>(`[data-tour="${targetName}"]`);
    if (target) {
      target.classList.add("tour-highlight");
      target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
    return () => target?.classList.remove("tour-highlight");
  }, [open, step]);

  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, "done");
    } catch {
      // Private browsing can block storage; the guide simply reappears next visit.
    }
    onClose();
  };

  const next = () => {
    if (step === steps.length - 1) finish();
    else setStep((value) => value + 1);
  };

  const back = () => setStep((value) => Math.max(0, value - 1));

  if (!open) return null;

  const current = steps[step];
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="ChronoAtlas quick tour"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") finish();
        if (event.key === "ArrowRight") {
          event.preventDefault();
          next();
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          back();
        }
      }}
      className="fixed bottom-4 left-4 z-[70] w-[min(92vw,420px)] border border-ochre bg-sheet p-4 shadow-[0_12px_32px_rgba(29,28,25,0.18)]"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="caption-label">
          Quick tour · {step + 1} of {steps.length}
        </span>
        <button
          type="button"
          aria-label="Close tour"
          onClick={finish}
          className="grid size-8 place-items-center border border-rule text-muted hover:border-ink hover:text-ink"
        >
          <X aria-hidden="true" size={14} strokeWidth={1.5} />
        </button>
      </div>

      <h2 className="font-display text-[24px] leading-tight text-ink">{current.title}</h2>
      <p aria-live="polite" className="mt-2 text-sm leading-relaxed text-muted">
        {current.body}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={finish}
          className="text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex min-h-9 items-center gap-1 border border-rule px-2 text-xs text-ink hover:border-ink"
            >
              <ArrowLeft aria-hidden="true" size={13} strokeWidth={1.5} />
              Back
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="inline-flex min-h-9 items-center gap-1 border border-ink bg-ink px-3 text-xs text-sheet hover:bg-[#2e2a24]"
          >
            {step === steps.length - 1 ? (
              <>
                <Check aria-hidden="true" size={13} strokeWidth={1.5} />
                Done
              </>
            ) : (
              <>
                Next
                <ArrowRight aria-hidden="true" size={13} strokeWidth={1.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
