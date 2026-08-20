import { useEffect, useState } from "react";
import { loadNotes, saveNotes } from "./anna/notesStorage";
import { connectAnna, type AnnaRuntime } from "./anna/runtime";
import { summarizeNotes } from "./anna/summaryTool";
import { EMPTY_NOTES_DOCUMENT, type NotesDocument } from "./types/note";

type BusyAction = "connecting" | "saving" | "deleting" | "summarizing" | null;

const MAX_LENGTH = 240;

export default function App() {
  const [anna, setAnna] = useState<AnnaRuntime | null>(null);
  const [document, setDocument] = useState<NotesDocument>(EMPTY_NOTES_DOCUMENT);
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<BusyAction>("connecting");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const runtime = await connectAnna();
        const storedDocument = await loadNotes(runtime);
        if (!cancelled) {
          setAnna(runtime);
          setDocument(storedDocument);
          setError("");
        }
      } catch (caught) {
        if (!cancelled) setError(messageFrom(caught));
      } finally {
        if (!cancelled) setBusy(null);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addNote() {
    if (!anna) return;
    const content = input.trim();
    if (!content) return;

    const nextDocument = {
      notes: [...document.notes, { content, order: document.nextOrder }],
      nextOrder: document.nextOrder + 1,
    };

    setBusy("saving");
    setError("");
    try {
      // Persist through Anna before presenting the note as saved.
      await saveNotes(anna, nextDocument);
      setDocument(nextDocument);
      setInput("");
      setSummary("");
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function deleteNote(order: number) {
    if (!anna) return;
    const previousDocument = document;
    const nextDocument = {
      ...document,
      notes: document.notes.filter((note) => note.order !== order),
    };

    // Update immediately, then roll back if Host storage rejects the write.
    setDocument(nextDocument);
    setBusy("deleting");
    setError("");
    try {
      await saveNotes(anna, nextDocument);
      setSummary("");
    } catch (caught) {
      setDocument(previousDocument);
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function summarize() {
    if (!anna) return;

    setBusy("summarizing");
    setError("");
    setSummary("");
    try {
      // Reload to make the storage -> tool path visible in harness RPC logs.
      const storedDocument = await loadNotes(anna);
      setDocument(storedDocument);
      if (storedDocument.notes.length === 0) {
        throw new Error("Add at least one note before summarizing.");
      }

      const result = await summarizeNotes(anna, storedDocument.notes);
      setSummary(result.summary);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  const isConnected = anna !== null;
  const isBusy = busy !== null;
  const noteCount = document.notes.length;
  // Newest first, so the freshest thought sits at the top of the flow.
  const orderedNotes = [...document.notes].reverse();

  return (
    <div className="app-shell">
      <aside className="rail">
        <h1>Mini Notes</h1>
        <p className="tagline">A quiet place for things worth keeping.</p>

        <div className="composer">
          <label className="field-label" htmlFor="note-input">
            Capture a thought
          </label>
          <textarea
            id="note-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void addNote();
              }
            }}
            placeholder="What should you remember?"
            maxLength={MAX_LENGTH}
            disabled={!isConnected || isBusy}
          />
          <div className="composer-meta">
            <span className="counter">{MAX_LENGTH - input.length} left</span>
            <button
              className="btn btn-accent"
              type="button"
              onClick={() => void addNote()}
              disabled={!isConnected || !input.trim() || isBusy}
            >
              {busy === "saving" ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>

        <div className="rail-spacer" />

        <button
          className="btn summarize"
          type="button"
          onClick={() => void summarize()}
          disabled={!isConnected || noteCount === 0 || isBusy}
        >
          {busy === "summarizing" ? "Summarizing…" : "Summarize"}
        </button>
      </aside>

      <main className="canvas">
        <div className="canvas-inner">
          <div className="canvas-head">
            <h2>Your notes</h2>
            <span className="count">
              {noteCount === 1 ? "1 note" : `${noteCount} notes`}
            </span>
          </div>

          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}

          <div aria-live="polite">
            {summary ? (
              <div className="summary-card">
                <p>{summary}</p>
              </div>
            ) : null}
          </div>

          {noteCount === 0 ? (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">
                ✦
              </span>
              <p>Nothing here yet</p>
              <span>Your first thought can be tiny.</span>
            </div>
          ) : (
            <ul className="notes-grid">
              {orderedNotes.map((note) => (
                <li key={note.order} className="note-card">
                  <span className="note-order">
                    {String(note.order).padStart(2, "0")}
                  </span>
                  <p>{note.content}</p>
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => void deleteNote(note.order)}
                    disabled={!isConnected || isBusy}
                    aria-label={`Delete note ${note.order}`}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function messageFrom(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
