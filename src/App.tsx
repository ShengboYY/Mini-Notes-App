import { useEffect, useState } from "react";
import { loadNotes, saveNotes } from "./anna/notesStorage";
import { connectAnna, type AnnaRuntime } from "./anna/runtime";
import { summarizeNotes } from "./anna/summaryTool";
import { EMPTY_NOTES_DOCUMENT, type NotesDocument } from "./types/note";

type BusyAction = "connecting" | "saving" | "deleting" | "summarizing" | null;

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

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>Mini Notes</h1>
        <p className="subtitle">
          Capture the small things. Ask Anna for the useful shape of them.
        </p>
      </header>

      <section className="composer" aria-labelledby="new-note-title">
        <div className="section-heading">
          <h2 id="new-note-title">New note</h2>
        </div>
        <div className="composer-row">
          <label className="sr-only" htmlFor="note-input">
            Note content
          </label>
          <input
            id="note-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addNote();
            }}
            placeholder="What should you remember?"
            maxLength={240}
            disabled={!isConnected || isBusy}
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => void addNote()}
            disabled={!isConnected || !input.trim() || isBusy}
          >
            {busy === "saving" ? "Saving…" : "Add"}
          </button>
        </div>
      </section>

      {error ? <p className="error-message" role="alert">{error}</p> : null}

      <section className="notes-section" aria-labelledby="notes-title">
        <div className="section-heading">
          <h2 id="notes-title">Notes</h2>
          <span className="count">{document.notes.length}</span>
        </div>

        {document.notes.length === 0 ? (
          <p className="empty-state">No notes yet.</p>
        ) : (
          <ol className="notes-list">
            {document.notes.map((note) => (
              <li key={note.order} className="note-card">
                <span className="order" aria-label={`Note ${note.order}`}>
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
                  Delete
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="summary-section" aria-labelledby="summary-title">
        <div className="section-heading">
          <h2 id="summary-title">Summary</h2>
          <button
            className="summary-button"
            type="button"
            onClick={() => void summarize()}
            disabled={!isConnected || document.notes.length === 0 || isBusy}
          >
            {busy === "summarizing" ? "Summarizing…" : "Summarize"}
          </button>
        </div>

        <div className="summary-output" aria-live="polite">
          <p className={summary ? "" : "summary-placeholder"}>
            {summary || "Your LLM summary will appear here."}
          </p>
        </div>
      </section>
    </main>
  );
}

function messageFrom(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
