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
    body: "This pane lists the records currently in view. Each card is one place or artifact. Select a card (or press [ and ]) to move across records.",
    target: "feed",
  },
  {
    title: "Find something",
    body: "Press / to search titles, eras, and places, or toggle Then & Now to see archival photo comparisons. Filters and active records sync to the URL for sharing.",
    target: "search",
  },
  {
    title: "The map",
    body: "The map plots origins and current locations. Filled dots are places, hollow rings are artifact origins, and blue rings are current holdings. Zoom, pan, or toggle “Area filter” directly on the map.",
    target: "map",
  },
  {
    title: "Open the context",
    body: "Click any record card. On a phone, use the bottom tabs to move between Records, Map, and Context. The map flies smoothly to the selected record when a coordinate is known.",
    target: "records",
  },
  {
    title: "Inside the drawer",
    body: "The context drawer holds the summary, Then-vs-Now comparison slider, relationships, citations, and your private notes. “Draft · unreviewed” means the record has not been curated yet.",
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

export function OnboardingTour({
  open,
  onClose,
  onStepChange,
}: {
  open: boolean;
  onClose: () => void;
  onStepChange?: (stepIndex: number, target: string | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<DOMRect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStep(0);
    dialogRef.current?.focus();
    return () => previousFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSpotlight(null);
      return;
    }

    const targetName = steps[step].target;
    onStepChangeRef.current?.(step, targetName);

    const update = () => {
      const target = targetName
        ? document.querySelector<HTMLElement>(`[data-tour="${targetName}"]`)
        : null;
      if (target && window.getComputedStyle(target).display !== "none") {
        setSpotlight(target.getBoundingClientRect());
      } else {
        setSpotlight(null);
      }
    };

    update();
    if (targetName) {
      document
        .querySelector<HTMLElement>(`[data-tour="${targetName}"]`)
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
    const raf = window.requestAnimationFrame(update);

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
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
    <>
      {spotlight && (
        <>
          <div
            aria-hidden="true"
            className="tour-dim"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, spotlight.top) }}
          />
          <div
            aria-hidden="true"
            className="tour-dim"
            style={{ top: Math.max(0, spotlight.bottom), left: 0, right: 0, bottom: 0 }}
          />
          <div
            aria-hidden="true"
            className="tour-dim"
            style={{
              top: Math.max(0, spotlight.top),
              left: 0,
              width: Math.max(0, spotlight.left),
              height: Math.max(0, spotlight.height),
            }}
          />
          <div
            aria-hidden="true"
            className="tour-dim"
            style={{
              top: Math.max(0, spotlight.top),
              left: Math.max(0, spotlight.right),
              right: 0,
              height: Math.max(0, spotlight.height),
            }}
          />
          <div
            aria-hidden="true"
            className="tour-halo"
            style={{
              top: spotlight.top - 4,
              left: spotlight.left - 4,
              width: spotlight.width + 8,
              height: spotlight.height + 8,
            }}
          />
        </>
      )}
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
        className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] left-1/2 z-[70] max-h-[calc(100dvh-6rem)] w-[min(92vw,420px)] -translate-x-1/2 overflow-y-auto border-2 border-ochre bg-sheet p-4 md:bottom-4 md:left-4 md:max-h-[calc(100dvh-2rem)] md:translate-x-0"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="caption-label">
            Quick tour · {step + 1} of {steps.length}
          </span>
          <button
            type="button"
            aria-label="Close tour"
            onClick={finish}
            className="grid size-11 place-items-center border border-rule text-muted hover:border-ink hover:text-ink md:size-8"
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
            className="inline-flex min-h-11 items-center text-xs text-muted underline underline-offset-4 hover:text-ink md:min-h-0"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex min-h-11 items-center gap-1 border border-rule px-2 text-xs text-ink hover:border-ink md:min-h-9"
              >
                <ArrowLeft aria-hidden="true" size={13} strokeWidth={1.5} />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex min-h-11 items-center gap-1 border border-ink bg-ink px-3 text-xs text-sheet hover:bg-[#2e2a24] md:min-h-9"
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
    </>
  );
}
