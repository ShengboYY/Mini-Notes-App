#!/usr/bin/env python3
"""Exercise initialize, describe, invoke, and reverse sampling over stdio."""

from __future__ import annotations

import json
import queue
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXECUTA_DIR = ROOT / "executas" / "notes-summarizer"
EXPECTED_SUMMARY = "Protocol test summary returned by sampling."


def write_message(process: subprocess.Popen[str], message: dict) -> None:
    assert process.stdin is not None
    process.stdin.write(json.dumps(message) + "\n")
    process.stdin.flush()


def main() -> int:
    process = subprocess.Popen(
        [
            sys.executable,
            str(EXECUTA_DIR / "notes_summarizer.py"),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None

    messages: queue.Queue[dict] = queue.Queue()

    def read_stdout() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            messages.put(json.loads(line))

    reader = threading.Thread(target=read_stdout, daemon=True)
    reader.start()

    try:
        write_message(
            process,
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2.0"},
            },
        )
        initialized = messages.get(timeout=15)
        assert initialized["result"]["protocolVersion"] == "2.0"
        assert initialized["result"]["client_capabilities"]["sampling"] == {}

        write_message(process, {"jsonrpc": "2.0", "id": 2, "method": "describe"})
        described = messages.get(timeout=15)
        assert described["result"]["name"] == "tool-dev-notes-summarizer"
        assert described["result"]["host_capabilities"] == ["llm.sample"]

        write_message(
            process,
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "invoke",
                "params": {
                    "tool": "summarize",
                    "arguments": {"notes": ["Call the client", "Fix login"]},
                    "context": {"invoke_id": "protocol-test-invoke"},
                },
            },
        )
        sampling_request = messages.get(timeout=15)
        assert sampling_request["method"] == "sampling/createMessage"
        assert (
            sampling_request["params"]["metadata"]["executa_invoke_id"]
            == "protocol-test-invoke"
        )

        write_message(
            process,
            {
                "jsonrpc": "2.0",
                "id": sampling_request["id"],
                "result": {
                    "role": "assistant",
                    "content": {"type": "text", "text": EXPECTED_SUMMARY},
                    "model": "protocol-mock-model",
                    "stopReason": "endTurn",
                },
            },
        )
        invoked = messages.get(timeout=15)
        assert invoked["id"] == 3
        assert invoked["result"]["success"] is True
        assert invoked["result"]["data"]["summary"] == EXPECTED_SUMMARY

        print("Protocol test passed: initialize -> describe -> invoke -> sampling -> result")
        return 0
    finally:
        if process.stdin:
            process.stdin.close()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=5)
        if process.returncode not in (0, None):
            stderr = process.stderr.read() if process.stderr else ""
            print(stderr, file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
