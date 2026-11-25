import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Columns2 } from "lucide-react";
import type { ComparisonPair } from "../../lib/media";
import { isSafeExternalUrl } from "../../lib/validators";
import type { MediaItem } from "../../types/atlas";
import { PhotoCompare } from "./PhotoCompare";

export function PhotoGallery({
  entryId,
  media,
  pair,
}: {
  entryId?: string;
  media: MediaItem[];
  pair: ComparisonPair | null;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [compare, setCompare] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setActiveIndex(0);
    setCompare(false);
  }, [entryId, media]);

  if (media.length === 0) {
    return (
      <section aria-label="Media" className="border-y border-rule py-4">
        <h3 className="caption-label">Media</h3>
        <p className="mt-2 text-sm text-muted">No media has been recorded for this entry.</p>
      </section>
    );
  }

  const safeIndex = Math.min(activeIndex, media.length - 1);
  const active = media[safeIndex];
  const isBroken = broken.has(active.id);

  const handleThumbKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (media.length <= 1) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (safeIndex + 1) % media.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (safeIndex - 1 + media.length) % media.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = media.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      thumbRefs.current[nextIndex]?.focus();
    }
  };

  const hasSafeSource = isSafeExternalUrl(active.sourceUrl);
  const hasSafeLicense = Boolean(active.licenseUrl && isSafeExternalUrl(active.licenseUrl));

  return (
    <section aria-label="Media" className="border-y border-rule py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="caption-label">Media</h3>
        {pair && (
          <button
            type="button"
            aria-pressed={compare}
            onClick={() => setCompare((value) => !value)}
            className={`flex min-h-11 items-center gap-1 border px-3 py-1 text-[11px] transition-colors duration-150 md:min-h-0 md:px-2 ${
              compare ? "border-ochre text-ochre" : "border-rule text-muted hover:text-ink"
            }`}
          >
            <Columns2 aria-hidden="true" size={12} strokeWidth={1.5} />
            {compare ? "Gallery" : "Compare"}
          </button>
        )}
      </div>

      {compare && pair ? (
        <PhotoCompare pair={pair} />
      ) : (
        <>
          <div className="border border-rule bg-paper">
            {isBroken ? (
              <p
                role="status"
                className="grid aspect-[4/3] place-items-center px-6 text-center text-sm text-muted"
              >
                Image unavailable. Open the source page linked below.
              </p>
            ) : (
              <img
                key={active.id}
                src={active.imageUrl}
                alt={active.caption}
                width={800}
                height={600}
                loading={safeIndex === 0 ? "eager" : "lazy"}
                onError={() => setBroken((current) => new Set(current).add(active.id))}
                className="aspect-[4/3] w-full bg-[#e5e0d4] object-cover"
              />
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink">{active.caption}</p>
          <p className="mt-1 text-[11px] text-muted">
            Period: {active.period}
            {active.photoYear !== null ? ` · ${active.photoYear}` : " · year unknown"}
            {active.creator ? ` · ${active.creator}` : " · creator not recorded"}
            {active.license ? ` · ${active.license}` : " · license not recorded"}
          </p>
          {active.attributionText && (
            <p className="mt-1 text-[11px] text-muted">Attribution: {active.attributionText}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {hasSafeSource && (
              <a
                href={active.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ochre underline underline-offset-2 hover:text-ink"
              >
                View source and license
              </a>
            )}
            {hasSafeLicense && active.licenseUrl && (
              <a
                href={active.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ochre underline underline-offset-2 hover:text-ink"
              >
                License details
              </a>
            )}
          </div>

          {media.length > 1 && (
            <ul
              onKeyDown={handleThumbKeyDown}
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
              aria-label="Media thumbnails"
            >
              {media.map((item, index) => (
                <li key={item.id}>
                  <button
                    ref={(el) => {
                      thumbRefs.current[index] = el;
                    }}
                    type="button"
                    aria-label={`Show image ${index + 1}: ${item.caption}`}
                    aria-current={index === safeIndex ? "true" : undefined}
                    onClick={() => setActiveIndex(index)}
                    className={`size-14 border p-0.5 ${index === safeIndex ? "border-ochre" : "border-rule hover:border-muted"}`}
                  >
                    {broken.has(item.id) ? (
                      <span className="grid size-full place-items-center text-[10px] text-muted">
                        N/A
                      </span>
                    ) : (
                      <img
                        src={item.imageUrl}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!pair && (
        <p className="mt-3 text-[11px] italic text-muted">
          No reviewed archival and modern pair, so comparison is unavailable.
        </p>
      )}
    </section>
  );
}
