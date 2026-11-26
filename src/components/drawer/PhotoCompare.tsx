import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { MoveHorizontal, RotateCcw } from "lucide-react";
import type { ComparisonPair } from "../../lib/media";
import { isSafeExternalUrl } from "../../lib/validators";

export function PhotoCompare({ pair }: { pair: ComparisonPair }) {
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const updateFromClientX = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rawPct = ((clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(100, Math.max(0, Math.round(rawPct)));
    setPosition(clamped);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(event.clientX);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const archivalAttribution =
    pair.archival.attributionText ||
    [pair.archival.creator, pair.archival.license].filter(Boolean).join(" · ") ||
    "Attribution not recorded";
  const modernAttribution =
    pair.modern.attributionText ||
    [pair.modern.creator, pair.modern.license].filter(Boolean).join(" · ") ||
    "Attribution not recorded";

  return (
    <figure className="border border-rule bg-paper">
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative aspect-[4/3] cursor-ew-resize overflow-hidden select-none touch-none"
      >
        <img
          src={pair.modern.imageUrl}
          alt={pair.modern.caption}
          width={800}
          height={600}
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        <img
          src={pair.archival.imageUrl}
          alt={pair.archival.caption}
          width={800}
          height={600}
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-sheet"
          style={{ left: `${position}%` }}
        >
          <span
            className={`absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center border bg-sheet text-ink transition-colors duration-150 ${
              dragging ? "border-ochre text-ochre" : "border-ink"
            }`}
          >
            <MoveHorizontal aria-hidden="true" size={14} strokeWidth={1.5} />
          </span>
        </div>
        <span className="pointer-events-none absolute left-2 top-2 border border-rule bg-sheet/95 px-2 py-0.5 text-[11px] uppercase tracking-wider text-ink">
          Archival{pair.archival.photoYear !== null ? ` · ${pair.archival.photoYear}` : ""}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 border border-rule bg-sheet/95 px-2 py-0.5 text-[11px] uppercase tracking-wider text-ink">
          Modern{pair.modern.photoYear !== null ? ` · ${pair.modern.photoYear}` : ""}
        </span>
        <label className="sr-only" htmlFor="compare-position">
          Comparison divider position
        </label>
        <input
          id="compare-position"
          type="range"
          min={0}
          max={100}
          step={2}
          value={position}
          aria-valuetext={`${position}% archival, ${100 - position}% modern`}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="pointer-events-none absolute inset-0 size-full opacity-0 focus:pointer-events-auto"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-rule bg-sheet px-3 py-2 text-[11px] text-muted sm:grid-cols-2">
        <div>
          <p className="caption-label">
            Archival · {pair.archival.photoYear !== null ? pair.archival.photoYear : "Year unknown"}
          </p>
          <p className="mt-0.5 text-ink">{pair.archival.caption}</p>
          <p className="mt-0.5">{archivalAttribution}</p>
          {pair.archival.licenseUrl && isSafeExternalUrl(pair.archival.licenseUrl) && (
            <a
              href={pair.archival.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ochre underline underline-offset-2 hover:text-ink"
            >
              License terms
            </a>
          )}
        </div>
        <div>
          <p className="caption-label">
            Modern · {pair.modern.photoYear !== null ? pair.modern.photoYear : "Year unknown"}
          </p>
          <p className="mt-0.5 text-ink">{pair.modern.caption}</p>
          <p className="mt-0.5">{modernAttribution}</p>
          {pair.modern.licenseUrl && isSafeExternalUrl(pair.modern.licenseUrl) && (
            <a
              href={pair.modern.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ochre underline underline-offset-2 hover:text-ink"
            >
              License terms
            </a>
          )}
        </div>
      </div>

      <figcaption className="flex items-center justify-between gap-2 border-t border-rule px-3 py-2 text-[11px] text-muted">
        <span>Drag across image or use arrow keys. Viewpoints and framing may differ.</span>
        <button
          type="button"
          onClick={() => setPosition(50)}
          className="flex min-h-11 shrink-0 items-center gap-1 border border-rule px-3 py-1 text-ink transition-colors duration-150 hover:border-ink hover:bg-sheet md:min-h-0 md:px-2"
        >
          <RotateCcw aria-hidden="true" size={12} strokeWidth={1.5} /> Centre
        </button>
      </figcaption>
    </figure>
  );
}
