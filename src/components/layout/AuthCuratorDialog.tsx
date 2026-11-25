import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Download, LogOut, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useAuthSession } from "../../hooks/useAuthSession";
import { signInWithEmailPassword, signOut } from "../../services/authService";
import { exportOverlayJson, getOverlayStats, resetOverlay } from "../../services/entriesService";

interface AuthCuratorDialogProps {
  open: boolean;
  onClose: () => void;
  corpusRevision?: number;
}

export function AuthCuratorDialog({ open, onClose, corpusRevision = 0 }: AuthCuratorDialogProps) {
  const { session, isLocalMode, isCurator, refresh } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [statsVersion, setStatsVersion] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setConfirmReset(false);
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      emailRef.current?.focus();
    }, 20);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  // Read live local overlay stats whenever dialog opens or corpusRevision/statsVersion increments.
  void corpusRevision;
  void statsVersion;
  const stats = getOverlayStats();

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailPassword(email, password);
      await refresh();
      setPassword("");
      setBusy(false);
      onClose();
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof Error && err.message ? err.message : "Sign-in failed.");
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      await refresh();
      setBusy(false);
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof Error && err.message ? err.message : "Sign-out failed.");
    }
  };

  const handleExportOverlay = () => {
    const json = exportOverlayJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "chronoatlas-local-overlay.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleResetOverlay = () => {
    resetOverlay();
    setConfirmReset(false);
    setStatsVersion((value) => value + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="flex w-full max-w-md flex-col border border-ink bg-sheet"
      >
        <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-3">
          <div>
            <p className="caption-label">
              {isLocalMode ? "Local archive mode" : "Account & curator access"}
            </p>
            <h2 id="auth-dialog-title" className="mt-0.5 font-display text-[24px] leading-tight">
              {isLocalMode
                ? "Local Curator Overlay"
                : session.authenticated
                  ? "Workspace Session"
                  : "Sign in to ChronoAtlas"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close workspace dialog"
            onClick={onClose}
            disabled={busy}
            className="mt-1 border border-rule p-1.5 text-muted hover:border-ink hover:text-ink disabled:opacity-50"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.5} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4 text-sm">
          {error && (
            <p
              role="alert"
              className="border border-[#b8835c] bg-[#f7e9e2] px-3 py-2 text-xs text-[#7a3720]"
            >
              {error}
            </p>
          )}

          {isLocalMode ? (
            <>
              <p className="text-xs leading-relaxed text-muted">
                Supabase environment variables are not configured in this browser, so ChronoAtlas is
                running in offline-capable local mode. Imported Wikipedia records and review toggles
                persist in your browser&apos;s local overlay.
              </p>

              <dl className="grid grid-cols-2 gap-2 border border-rule bg-paper p-3 text-xs">
                <div>
                  <dt className="caption-label">Imported entries</dt>
                  <dd className="mt-0.5 tabular text-base text-ink">{stats.importedEntries}</dd>
                </div>
                <div>
                  <dt className="caption-label">Review overrides</dt>
                  <dd className="mt-0.5 tabular text-base text-ink">{stats.reviewedOverrides}</dd>
                </div>
                <div>
                  <dt className="caption-label">Imported media</dt>
                  <dd className="mt-0.5 tabular text-base text-ink">{stats.importedMedia}</dd>
                </div>
                <div>
                  <dt className="caption-label">Imported sources</dt>
                  <dd className="mt-0.5 tabular text-base text-ink">{stats.importedSources}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportOverlay}
                  className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-xs text-sheet hover:bg-ink/90"
                >
                  <Download aria-hidden="true" size={13} strokeWidth={1.5} />
                  Export JSON
                </button>

                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    disabled={stats.importedEntries === 0 && stats.reviewedOverrides === 0}
                    className="inline-flex items-center gap-1.5 border border-rule bg-paper px-3 py-1.5 text-xs text-ink hover:border-[#7a3720] hover:text-[#7a3720] disabled:opacity-40"
                  >
                    <RotateCcw aria-hidden="true" size={13} strokeWidth={1.5} />
                    Reset local overlay
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetOverlay}
                      className="border border-[#7a3720] bg-[#f7e9e2] px-3 py-1.5 text-xs text-[#7a3720] hover:bg-[#efd8cc]"
                    >
                      Confirm reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="border border-rule px-2.5 py-1.5 text-xs text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : session.authenticated ? (
            <>
              <div className="space-y-2 border border-rule bg-paper p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="caption-label">Signed in</span>
                  <span className="inline-flex items-center gap-1 border border-rule bg-sheet px-2 py-0.5 text-[11px] uppercase tracking-wider text-ink">
                    <ShieldCheck aria-hidden="true" size={12} strokeWidth={1.5} />
                    {session.role}
                  </span>
                </div>
                <p className="font-medium text-ink">{session.email ?? "Authenticated user"}</p>
                <p className="text-muted">
                  {isCurator
                    ? "You can import Wikipedia records, toggle curator review status, and save private visited notes."
                    : "You can save private visited status and personal notes. Curator privileges are required to edit historical records."}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 border border-rule bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink disabled:opacity-50"
                >
                  <LogOut aria-hidden="true" size={13} strokeWidth={1.5} />
                  {busy ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={(event) => void handleSignIn(event)} className="space-y-3">
              <p className="text-xs leading-relaxed text-muted">
                Sign in with your Supabase account to save private visited status and notes. Curator
                or owner roles can also import and review records.
              </p>

              <div>
                <label htmlFor="auth-email" className="caption-label block">
                  Email
                </label>
                <input
                  ref={emailRef}
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-sm focus:border-ochre"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="caption-label block">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-sm focus:border-ochre"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="border border-rule bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="border border-ink bg-ink px-4 py-1.5 text-xs text-sheet hover:bg-ink/90 disabled:opacity-50"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
