#!/usr/bin/env python3
"""Build and package the Executa for the current supported platform."""

from __future__ import annotations

import hashlib
import json
import platform
import shutil
import subprocess
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXECUTA_DIR = ROOT / "executas" / "notes-summarizer"
DIST_DIR = EXECUTA_DIR / "dist"
ANNA_DIST_DIR = EXECUTA_DIR / "dist-anna"


def platform_key() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    aliases = {"amd64": "x86_64", "x64": "x86_64", "aarch64": "arm64"}
    machine = aliases.get(machine, machine)
    key = f"{system}-{machine}"
    supported = {"darwin-arm64", "darwin-x86_64", "windows-x86_64"}
    if key not in supported:
        raise SystemExit(f"Unsupported platform {key}; supported: {sorted(supported)}")
    return key


def describe(binary: Path) -> dict:
    """Use the built binary as the single source of manifest metadata."""
    completed = subprocess.run(
        [binary],
        input='{"jsonrpc":"2.0","id":1,"method":"describe"}\n',
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )
    return json.loads(completed.stdout)["result"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    key = platform_key()
    subprocess.run(
        [
            "uv",
            "run",
            "--project",
            str(EXECUTA_DIR),
            "--extra",
            "build",
            "pyinstaller",
            "--clean",
            "--noconfirm",
            "--onefile",
            "--specpath",
            "build",
            "--name",
            "notes-summarizer",
            "notes_summarizer.py",
        ],
        cwd=EXECUTA_DIR,
        check=True,
    )

    binary_name = "notes-summarizer.exe" if key.startswith("windows-") else "notes-summarizer"
    built_binary = DIST_DIR / binary_name
    if not built_binary.is_file():
        raise SystemExit(f"PyInstaller output not found: {built_binary}")

    staging = ANNA_DIST_DIR / f"staging-{key}"
    if staging.exists():
        shutil.rmtree(staging)
    (staging / "bin").mkdir(parents=True)
    staged_binary = staging / "bin" / binary_name
    shutil.copy2(built_binary, staged_binary)
    if not key.startswith("windows-"):
        staged_binary.chmod(0o755)

    entrypoint = f"bin/{binary_name}"
    manifest = describe(built_binary)
    manifest["runtime"] = {
        "binary": {
            "entrypoint": {"default": entrypoint},
            "permissions": (
                {entrypoint: "0o755"} if not key.startswith("windows-") else {}
            ),
        }
    }
    (staging / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    ANNA_DIST_DIR.mkdir(parents=True, exist_ok=True)
    if key.startswith("windows-"):
        archive = ANNA_DIST_DIR / f"notes-summarizer-{key}.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for path in sorted(staging.rglob("*")):
                if path.is_file():
                    output.write(path, path.relative_to(staging))
    else:
        archive = ANNA_DIST_DIR / f"notes-summarizer-{key}.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            output.add(staging / "manifest.json", arcname="manifest.json")
            output.add(staging / "bin", arcname="bin")

    print(f"Built: {archive}")
    print(f"Platform: {key}")
    print(f"SHA-256: {sha256(archive)}")
    print(f"Size: {archive.stat().st_size} bytes")
    print("Archive root: manifest.json, bin/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
