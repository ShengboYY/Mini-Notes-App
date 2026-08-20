import { describe, expect, it, vi } from "vitest";
import type { AnnaRuntime } from "./runtime";
import { loadNotes, saveNotes } from "./notesStorage";

describe("notesStorage", () => {
  it("loads notes through anna.storage.get and preserves their order", async () => {
    const get = vi.fn().mockResolvedValue({
      value: {
        notes: [
          { content: "Second", order: 2 },
          { content: "First", order: 1 },
        ],
        nextOrder: 3,
      },
    });
    const anna = {
      storage: { get, set: vi.fn() },
      tools: { invoke: vi.fn() },
    } as unknown as AnnaRuntime;

    const document = await loadNotes(anna);

    expect(get).toHaveBeenCalledWith({ key: "mini-notes:v1" });
    expect(document.notes.map((note) => note.content)).toEqual(["First", "Second"]);
    expect(document.nextOrder).toBe(3);
  });

  it("saves the complete notes document through anna.storage.set", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const anna = {
      storage: { get: vi.fn(), set },
      tools: { invoke: vi.fn() },
    } as unknown as AnnaRuntime;
    const document = {
      notes: [{ content: "One", order: 1 }],
      nextOrder: 2,
    };

    await saveNotes(anna, document);

    expect(set).toHaveBeenCalledWith({ key: "mini-notes:v1", value: document });
  });
});
