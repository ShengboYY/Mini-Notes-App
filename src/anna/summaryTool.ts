import type { Note } from "../types/note";
import type { AnnaRuntime } from "./runtime";

export const TOOL_ID = "tool-dev-notes-summarizer";

export type SummaryResult = {
  summary: string;
};

export async function summarizeNotes(
  anna: AnnaRuntime,
  notes: Note[],
): Promise<SummaryResult> {
  const result = await anna.tools.invoke({
    tool_id: TOOL_ID,
    method: "summarize",
    args: {
      notes: notes.map((note) => note.content),
    },
  });

  if (!result || typeof result !== "object") {
    throw new Error("The summarizer returned an invalid response.");
  }

  const summary = (result as Partial<SummaryResult>).summary;
  if (typeof summary !== "string") {
    throw new Error("The summarizer response did not include summary text.");
  }

  return { summary };
}
