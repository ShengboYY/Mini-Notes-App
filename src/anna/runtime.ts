export type AnnaRuntime = {
  storage: {
    get(args: { key: string }): Promise<{ value?: unknown }>;
    set(args: { key: string; value: unknown }): Promise<unknown>;
  };
  tools: {
    invoke(args: {
      tool_id: string;
      method: string;
      args: Record<string, unknown>;
    }): Promise<unknown>;
  };
};

type AnnaRuntimeModule = {
  AnnaAppRuntime: {
    connect(): Promise<AnnaRuntime>;
  };
};

const RUNTIME_SDK_URL = "/static/anna-apps/_sdk/latest/index.js";

export async function connectAnna(): Promise<AnnaRuntime> {
  // The SDK is served by the Anna harness, not bundled by Vite.
  const runtimeModule = (await import(
    /* @vite-ignore */ RUNTIME_SDK_URL
  )) as AnnaRuntimeModule;

  return runtimeModule.AnnaAppRuntime.connect();
}
