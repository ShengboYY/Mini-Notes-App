#!/usr/bin/env python3
"""Mini Notes Executa: JSON-RPC 2.0 over line-delimited stdio."""

from __future__ import annotations

import json
import sys
import uuid

TOOL_ID = "tool-dev-notes-summarizer"

MANIFEST = {
    "name": TOOL_ID,
    "display_name": "Notes Summarizer",
    "version": "1.0.0",
    "description": "Summarizes notes in their original order using the host LLM.",
    "host_capabilities": ["llm.sample"],
    "tools": [
        {
            "name": "summarize",
            "description": "Summarize the supplied notes into one concise paragraph.",
            "parameters": [
                {
                    "name": "notes",
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Note contents in their original order.",
                    "required": True,
                }
            ],
        }
    ],
    # Local development launches this source plugin through uv.
    "runtime": {"type": "uv", "min_version": "0.1.0"},
}


class RpcError(Exception):
    def __init__(self, code: int, message: str, data: dict | None = None):
        super().__init__(message)
        self.code = code
        self.data = data or {}


def write(message: dict) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def response(request_id, *, result=None, error=None) -> dict:
    envelope = {"jsonrpc": "2.0", "id": request_id}
    envelope["error" if error else "result"] = error or result
    return envelope


def request_sampling(notes: list[str], invoke_id: str) -> dict:
    request_id = uuid.uuid4().hex
    ordered_notes = "\n".join(
        f"{index}. {note}" for index, note in enumerate(notes, start=1)
    )
    write(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "sampling/createMessage",
            "params": {
                "messages": [
                    {
                        "role": "user",
                        "content": {
                            "type": "text",
                            "text": (
                                "Summarize the following notes into one concise paragraph. "
                                "Preserve important actions and decisions. Return only the summary.\n\n"
                                + ordered_notes
                            ),
                        },
                    }
                ],
                "maxTokens": 400,
                "metadata": {"executa_invoke_id": invoke_id},
            },
        }
    )

    # The same stdin carries Host requests and replies to our reverse RPC.
    for line in sys.stdin:
        if not (line := line.strip()):
            continue
        message = json.loads(line)
        if message.get("id") == request_id and "method" not in message:
            if error := message.get("error"):
                raise RpcError(
                    int(error.get("code", -32603)),
                    str(error.get("message", "sampling failed")),
                    error.get("data"),
                )
            return message.get("result") or {}
        dispatch(message)
    raise RpcError(-32603, "stdin closed before sampling returned")


def invoke(params: dict) -> dict:
    if params.get("tool") != "summarize":
        raise RpcError(-32601, f"Unknown tool: {params.get('tool')}")

    arguments = params.get("arguments") or {}
    raw_notes = arguments.get("notes")
    if not isinstance(raw_notes, list):
        raise RpcError(-32602, "notes must be an array")
    notes = [note.strip() for note in raw_notes if isinstance(note, str) and note.strip()]
    if not notes:
        raise RpcError(-32602, "notes must contain at least one non-empty string")

    context = params.get("context") if isinstance(params.get("context"), dict) else {}
    invoke_id = context.get("invoke_id") or params.get("invoke_id") or "local-invoke"
    sampled = request_sampling(notes, invoke_id)
    content = sampled.get("content") or {}
    return {
        "success": True,
        "tool": "summarize",
        "data": {
            "summary": content.get("text", "") if isinstance(content, dict) else "",
        },
    }


def dispatch(message: dict) -> None:
    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}
    try:
        if method == "initialize":
            if params.get("protocolVersion") != "2.0":
                raise RpcError(-32008, "sampling requires Executa protocol 2.0")
            result = {
                "protocolVersion": "2.0",
                "serverInfo": {"name": TOOL_ID, "version": MANIFEST["version"]},
                "client_capabilities": {"sampling": {}},
                "capabilities": {},
            }
        elif method == "describe":
            result = MANIFEST
        elif method == "invoke":
            result = invoke(params)
        elif method == "health":
            result = {"status": "healthy"}
        elif method == "shutdown":
            result = {"ok": True}
        else:
            raise RpcError(-32601, f"Method not found: {method}")
        envelope = response(request_id, result=result)
    except RpcError as error:
        envelope = response(
            request_id,
            error={"code": error.code, "message": str(error), "data": error.data},
        )
    except Exception as error:  # Keep protocol errors on stdout; logs stay on stderr.
        envelope = response(
            request_id,
            error={"code": -32603, "message": f"Tool execution failed: {error}"},
        )

    if request_id is not None:
        write(envelope)


def main() -> None:
    for line in sys.stdin:
        if line := line.strip():
            try:
                dispatch(json.loads(line))
            except json.JSONDecodeError:
                write(response(None, error={"code": -32700, "message": "Parse error"}))


if __name__ == "__main__":
    main()
