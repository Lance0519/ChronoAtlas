import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Columns2, Maximize2, X } from "lucide-react";
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setActiveIndex(0);
    setCompare(false);
    setLightboxOpen(false);
  }, [entryId, media]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setLightboxOpen(false);
      } else if (event.key === "ArrowRight" && media.length > 1) {
        setActiveIndex((current) => (current + 1) % media.length);
      } else if (event.key === "ArrowLeft" && media.length > 1) {
        setActiveIndex((current) => (current - 1 + media.length) % media.length);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxOpen, media.length]);

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
  const isPlaceholder = active.imageUrl.endsWith("/evidence-placeholder.svg");

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
        <div className="flex items-center gap-1.5">
          {!compare && !isBroken && !isPlaceholder && (
            <button
              type="button"
              aria-label="Inspect full-size image"
              onClick={() => setLightboxOpen(true)}
              className="flex min-h-11 items-center gap-1 border border-rule px-2.5 py-1 text-[11px] text-muted transition-colors duration-150 hover:border-ink hover:text-ink md:min-h-0 md:px-2"
            >
              <Maximize2 aria-hidden="true" size={12} strokeWidth={1.5} />
              Inspect
            </button>
          )}
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
      </div>

      {compare && pair ? (
        <PhotoCompare pair={pair} />
      ) : (
        <>
          <div className="group relative border border-rule bg-paper">
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
                onClick={() => {
                  if (!isPlaceholder) setLightboxOpen(true);
                }}
                onError={() => setBroken((current) => new Set(current).add(active.id))}
                className={`aspect-[4/3] w-full bg-[#e5e0d4] object-cover ${
                  !isPlaceholder ? "cursor-zoom-in" : ""
                }`}
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
                    className={`size-14 border p-0.5 transition-colors duration-150 ${
                      index === safeIndex ? "border-ochre" : "border-rule hover:border-muted"
                    }`}
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

      {lightboxOpen && !isBroken && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-size media viewer"
          className="fixed inset-0 z-50 flex flex-col justify-between bg-ink/85 p-4 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLightboxOpen(false);
          }}
        >
          <div className="flex items-center justify-between gap-3 border border-rule bg-sheet px-4 py-2.5">
            <span className="caption-label">
              Archival Plate {media.length > 1 ? `· ${safeIndex + 1} of ${media.length}` : ""}
            </span>
            <button
              type="button"
              aria-label="Close media viewer"
              onClick={() => setLightboxOpen(false)}
              className="grid size-9 place-items-center border border-rule text-ink hover:border-ink hover:bg-paper"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className="relative my-3 flex min-h-0 flex-1 items-center justify-center">
            {media.length > 1 && (
              <button
                type="button"
                aria-label="Previous image"
                onClick={() => setActiveIndex((safeIndex - 1 + media.length) % media.length)}
                className="absolute left-2 z-10 grid size-11 place-items-center border border-ink bg-sheet text-ink hover:bg-paper"
              >
                <ChevronLeft aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
            )}
            <img
              src={active.imageUrl}
              alt={active.caption}
              className="max-h-full max-w-full border border-rule bg-sheet object-contain"
            />
            {media.length > 1 && (
              <button
                type="button"
                aria-label="Next image"
                onClick={() => setActiveIndex((safeIndex + 1) % media.length)}
                className="absolute right-2 z-10 grid size-11 place-items-center border border-ink bg-sheet text-ink hover:bg-paper"
              >
                <ChevronRight aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
            )}
          </div>

          <div className="border border-rule bg-sheet px-4 py-3 text-xs">
            <p className="text-ink">{active.caption}</p>
            <p className="mt-1 text-[11px] text-muted">
              Period: {active.period}
              {active.photoYear !== null ? ` · ${active.photoYear}` : " · year unknown"}
              {active.creator ? ` · ${active.creator}` : ""}
              {active.license ? ` · ${active.license}` : ""}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
