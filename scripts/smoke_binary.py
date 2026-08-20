#!/usr/bin/env python3
"""Send describe to a built binary and validate its identity."""

from __future__ import annotations

import argparse
import json
import subprocess


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", required=True)
    args = parser.parse_args()

    completed = subprocess.run(
        [args.binary],
        input='{"jsonrpc":"2.0","id":1,"method":"describe"}\n',
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )
    response = json.loads(completed.stdout.strip())
    assert response["result"]["name"] == "tool-dev-notes-summarizer"
    assert response["result"]["tools"][0]["name"] == "summarize"
    print("Binary describe smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
