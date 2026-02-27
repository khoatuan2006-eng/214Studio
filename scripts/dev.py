#!/usr/bin/env python3
"""
scripts/dev.sh equivalent — Python cross-platform dev launcher.

Usage:
    python scripts/dev.py

Starts both the FastAPI backend AND the React frontend dev server
in parallel, with clean shutdown on Ctrl+C.
"""

import subprocess
import sys
import time
import signal
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent
BACKEND_CMD = [sys.executable, str(ROOT / "backend" / "main.py")]
FRONTEND_CMD = ["npm", "run", "dev"]
FRONTEND_CWD = str(ROOT / "frontend-react")


def main():
    print("🚀 AnimeStudio Dev Launcher")
    print("=" * 40)

    processes = []

    try:
        print("[backend] Starting FastAPI on http://localhost:8001 ...")
        be = subprocess.Popen(BACKEND_CMD, cwd=str(ROOT))
        processes.append(be)
        time.sleep(1.5)

        print("[frontend] Starting React Dev Server on http://localhost:5173 ...")
        fe = subprocess.Popen(FRONTEND_CMD, cwd=FRONTEND_CWD, shell=(os.name == "nt"))
        processes.append(fe)

        print("\n✅ Both servers running. Press Ctrl+C to stop.\n")

        for p in processes:
            p.wait()

    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
        for p in processes:
            p.terminate()
        print("✅ All processes stopped.")


if __name__ == "__main__":
    main()
