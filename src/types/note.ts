export type Note = {
  content: string;
  order: number;
};

export type NotesDocument = {
  notes: Note[];
  nextOrder: number;
};

export const EMPTY_NOTES_DOCUMENT: NotesDocument = {
  notes: [],
  nextOrder: 1,
};
