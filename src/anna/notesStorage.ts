import type { NotesDocument } from "../types/note";
import { EMPTY_NOTES_DOCUMENT } from "../types/note";
import type { AnnaRuntime } from "./runtime";

const STORAGE_KEY = "mini-notes:v1";

export async function loadNotes(anna: AnnaRuntime): Promise<NotesDocument> {
  const { value } = await anna.storage.get({ key: STORAGE_KEY });
  if (!value || typeof value !== "object") {
    return EMPTY_NOTES_DOCUMENT;
  }

  const stored = value as Partial<NotesDocument>;
  return {
    notes: Array.isArray(stored.notes)
      ? [...stored.notes].sort((left, right) => left.order - right.order)
      : [],
    nextOrder: typeof stored.nextOrder === "number" ? stored.nextOrder : 1,
  };
}

export async function saveNotes(
  anna: AnnaRuntime,
  document: NotesDocument,
): Promise<void> {
  await anna.storage.set({
    key: STORAGE_KEY,
    value: document,
  });
}
