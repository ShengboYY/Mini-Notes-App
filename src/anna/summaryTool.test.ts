import { describe, expect, it, vi } from "vitest";
import type { AnnaRuntime } from "./runtime";
import { summarizeNotes, TOOL_ID } from "./summaryTool";

describe("summaryTool", () => {
  it("invokes the local Executa with note contents in add order", async () => {
    const invoke = vi.fn().mockResolvedValue({ summary: "Mock summary" });
    const anna = {
      storage: { get: vi.fn(), set: vi.fn() },
      tools: { invoke },
    } as unknown as AnnaRuntime;

    const result = await summarizeNotes(anna, [
      { content: "First", order: 1 },
      { content: "Second", order: 2 },
    ]);

    expect(invoke).toHaveBeenCalledWith({
      tool_id: TOOL_ID,
      method: "summarize",
      args: { notes: ["First", "Second"] },
    });
    expect(result.summary).toBe("Mock summary");
  });
});
