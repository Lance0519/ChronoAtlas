import { useCallback, useEffect, useRef, useState } from "react";
import {
  getProgress,
  getProgressAsync,
  isUuid,
  saveProgressAsync,
} from "../services/entriesService";
import type { PersonalProgress, UserSession } from "../types/atlas";

export type ProgressSaveState = "idle" | "saving" | "saved" | "error";

const NOTES_AUTOSAVE_MS = 600;

const progressSnapshotCache = new Map<string, PersonalProgress>();
const progressListeners = new Set<() => void>();

export function getCachedProgress(entryId: string): PersonalProgress {
  return progressSnapshotCache.get(entryId) ?? getProgress(entryId);
}

export function subscribeProgressChanges(cb: () => void): () => void {
  progressListeners.add(cb);
  return () => {
    progressListeners.delete(cb);
  };
}

function publishProgressSnapshot(entryId: string, progress: PersonalProgress): void {
  progressSnapshotCache.set(entryId, progress);
  for (const listener of progressListeners) {
    try {
      listener();
    } catch {
      // Ignore subscriber errors.
    }
  }
}

/**
 * Manages personal visited state and notes with 600ms debounced autosave,
 * immediate visited persistence, retry recovery, and unsaved-edits warning.
 */
export function usePersonalProgress(entryId: string, session: UserSession) {
  const canPersist =
    session.mode === "local" ||
    (session.mode === "supabase" && session.authenticated && isUuid(entryId));

  const [progress, setProgress] = useState<PersonalProgress>(() =>
    session.mode === "local" ? getCachedProgress(entryId) : { visited: false, notes: "" },
  );
  const [loading, setLoading] = useState(session.mode === "supabase");
  const [saveState, setSaveState] = useState<ProgressSaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const latestProgressRef = useRef(progress);
  const lastSavedNotesRef = useRef(progress.notes);
  const dirtyRef = useRef(false);

  const clearPendingTimer = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  useEffect(() => {
    const requestId = ++generationRef.current;
    const effectEntryId = entryId;
    const effectCanPersist = canPersist;
    clearPendingTimer();

    const initial =
      session.mode === "local" ? getCachedProgress(effectEntryId) : { visited: false, notes: "" };
    setProgress(initial);
    latestProgressRef.current = initial;
    lastSavedNotesRef.current = initial.notes;
    setIsDirty(false);
    dirtyRef.current = false;
    setSaveState("idle");
    setErrorMessage(null);
    setLoading(session.mode === "supabase" && session.authenticated && isUuid(effectEntryId));

    let active = true;
    void getProgressAsync(effectEntryId)
      .then((loaded) => {
        if (!active || requestId !== generationRef.current) return;
        setProgress(loaded);
        latestProgressRef.current = loaded;
        lastSavedNotesRef.current = loaded.notes;
        publishProgressSnapshot(effectEntryId, loaded);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active || requestId !== generationRef.current) return;
        setLoading(false);
        setErrorMessage(
          err instanceof Error && err.message ? err.message : "Could not load personal notes.",
        );
      });

    return () => {
      active = false;
      clearPendingTimer();
      // Flush pending local note edits if switching away before the 600ms debounce expires.
      if (dirtyRef.current && effectCanPersist) {
        const snapshot = latestProgressRef.current;
        dirtyRef.current = false;
        void saveProgressAsync(effectEntryId, { notes: snapshot.notes })
          .then((saved) => publishProgressSnapshot(effectEntryId, saved))
          .catch(() => {
            // Preserve silence on background unmount flush.
          });
      }
    };
  }, [entryId, session.mode, session.authenticated, session.userId, canPersist, clearPendingTimer]);

  useEffect(() => {
    if (!isDirty && saveState !== "saving" && saveState !== "error") return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, saveState]);

  const persistPatch = useCallback(
    async (targetEntryId: string, patch: Partial<PersonalProgress>) => {
      const requestId = generationRef.current;
      setSaveState("saving");
      setErrorMessage(null);

      try {
        const saved = await saveProgressAsync(targetEntryId, patch);
        if (requestId !== generationRef.current) return;

        publishProgressSnapshot(targetEntryId, saved);
        if (patch.notes !== undefined) {
          lastSavedNotesRef.current = saved.notes;
        }
        const stillDirty = latestProgressRef.current.notes !== lastSavedNotesRef.current;
        dirtyRef.current = stillDirty;
        setIsDirty(stillDirty);
        const merged: PersonalProgress = {
          visited: patch.visited !== undefined ? saved.visited : latestProgressRef.current.visited,
          notes: stillDirty ? latestProgressRef.current.notes : saved.notes,
          updatedAt: saved.updatedAt,
        };
        latestProgressRef.current = merged;
        setProgress(merged);
        setSaveState(stillDirty ? "saving" : "saved");
      } catch (err: unknown) {
        if (requestId !== generationRef.current) return;
        setSaveState("error");
        setErrorMessage(
          err instanceof Error && err.message ? err.message : "Failed to save personal progress.",
        );
      }
    },
    [],
  );

  const setVisited = useCallback(
    (visited: boolean) => {
      if (!canPersist) return;
      clearPendingTimer();
      const next: PersonalProgress = { ...latestProgressRef.current, visited };
      latestProgressRef.current = next;
      setProgress(next);
      publishProgressSnapshot(entryId, next);

      const patch: Partial<PersonalProgress> = dirtyRef.current
        ? { visited, notes: next.notes }
        : { visited };
      void persistPatch(entryId, patch);
    },
    [canPersist, clearPendingTimer, entryId, persistPatch],
  );

  const setNotes = useCallback(
    (notes: string) => {
      if (!canPersist) return;
      const next: PersonalProgress = { ...latestProgressRef.current, notes };
      latestProgressRef.current = next;
      setProgress(next);

      const notesChanged = notes !== lastSavedNotesRef.current;
      setIsDirty(notesChanged);
      dirtyRef.current = notesChanged;

      clearPendingTimer();
      if (!notesChanged) {
        setSaveState("idle");
        setErrorMessage(null);
        return;
      }

      setErrorMessage(null);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void persistPatch(entryId, { notes });
      }, NOTES_AUTOSAVE_MS);
    },
    [canPersist, clearPendingTimer, entryId, persistPatch],
  );

  const retrySave = useCallback(() => {
    if (!canPersist) return;
    clearPendingTimer();
    void persistPatch(entryId, {
      visited: latestProgressRef.current.visited,
      notes: latestProgressRef.current.notes,
    });
  }, [canPersist, clearPendingTimer, entryId, persistPatch]);

  return {
    progress,
    loading,
    canPersist,
    saveState,
    errorMessage,
    isDirty,
    setVisited,
    setNotes,
    retrySave,
  };
}
