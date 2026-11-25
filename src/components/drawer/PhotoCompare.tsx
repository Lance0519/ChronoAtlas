import { useState } from "react";
import { MoveHorizontal, RotateCcw } from "lucide-react";
import type { ComparisonPair } from "../../lib/media";
import { isSafeExternalUrl } from "../../lib/validators";

export function PhotoCompare({ pair }: { pair: ComparisonPair }) {
  const [position, setPosition] = useState(50);

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
      <div className="relative aspect-[4/3] overflow-hidden select-none">
        <img
          src={pair.modern.imageUrl}
          alt={pair.modern.caption}
          width={800}
          height={600}
          className="absolute inset-0 size-full object-cover"
        />
        <img
          src={pair.archival.imageUrl}
          alt={pair.archival.caption}
          width={800}
          height={600}
          className="absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-sheet"
          style={{ left: `${position}%` }}
        >
          <span className="absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center border border-ink bg-sheet text-ink">
            <MoveHorizontal aria-hidden="true" size={14} strokeWidth={1.5} />
          </span>
        </div>
        <span className="absolute left-2 top-2 border border-rule bg-sheet/95 px-2 py-0.5 text-[11px] uppercase tracking-wider text-ink">
          Archival{pair.archival.photoYear !== null ? ` · ${pair.archival.photoYear}` : ""}
        </span>
        <span className="absolute right-2 top-2 border border-rule bg-sheet/95 px-2 py-0.5 text-[11px] uppercase tracking-wider text-ink">
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
          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
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
        <span>Drag or use arrow keys. Viewpoints and framing may differ.</span>
        <button
          type="button"
          onClick={() => setPosition(50)}
          className="flex min-h-11 shrink-0 items-center gap-1 border border-rule px-3 py-1 text-ink hover:border-ink hover:bg-sheet md:min-h-0 md:px-2"
        >
          <RotateCcw aria-hidden="true" size={12} strokeWidth={1.5} /> Centre
        </button>
      </figcaption>
    </figure>
  );
}
