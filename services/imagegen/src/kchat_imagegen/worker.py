"""Worker main loop: stdio JSON lines per PROTOCOL.md. Prompts never reach stderr or logs."""

from __future__ import annotations

import json
import os
import queue
import sys
import threading
import time
from pathlib import Path
from typing import Any, TextIO

from .engine import Cancelled, get_engine
from .protocol import (
    CancelRequest,
    GenerateRequest,
    ProtocolError,
    ShutdownRequest,
    UnloadRequest,
    parse_request,
)

_EOF = object()


class Worker:
    def __init__(self, proto: TextIO, outdir: Path) -> None:
        self.proto = proto
        self.outdir = outdir
        self.lock = threading.Lock()
        self.running_id: str | None = None
        self.cancel = threading.Event()
        self.jobs: queue.Queue[object] = queue.Queue()

    def emit(self, obj: dict[str, Any]) -> None:
        with self.lock:
            self.proto.write(json.dumps(obj, separators=(",", ":")) + "\n")
            self.proto.flush()

    def reader(self, stdin: TextIO) -> None:
        """Reads requests. cancel/busy are decided here so they work while a job runs."""
        for raw in stdin:
            line = raw.strip()
            if not line:
                continue
            try:
                req = parse_request(line)
            except ProtocolError as err:
                self.emit({"type": "error", "id": err.id, "code": err.code})
                continue
            if isinstance(req, CancelRequest):
                with self.lock:
                    if self.running_id == req.id:
                        self.cancel.set()
                continue
            if isinstance(req, GenerateRequest):
                with self.lock:
                    if self.running_id is not None:
                        busy = True
                    else:
                        busy = False
                        self.running_id = req.id
                        self.cancel.clear()
                if busy:
                    self.emit({"type": "error", "id": req.id, "code": "busy"})
                    continue
            self.jobs.put(req)
        self.jobs.put(_EOF)

    def run(self, idle_seconds: float) -> int:
        engine = get_engine()
        while True:
            try:
                req = self.jobs.get(timeout=idle_seconds)
            except queue.Empty:
                return 0  # idle: exit and free all memory
            if req is _EOF or isinstance(req, ShutdownRequest):
                return 0
            if isinstance(req, UnloadRequest):
                engine.unload()
                self.emit({"type": "unloaded"})
                return 0
            if isinstance(req, GenerateRequest):
                try:
                    self.generate(engine, req)
                finally:
                    with self.lock:
                        self.running_id = None

    def generate(self, engine: Any, req: GenerateRequest) -> None:
        # Z-Image does image-to-image in the same pipeline; FLUX.2 Klein needs its edit class.
        edit = req.image is not None and req.model == "flux2-klein-4b"
        key = (req.model, req.quantize, edit)
        if engine.loaded_key != key:
            if engine.loaded_key is not None:
                engine.unload()
            self.emit({"type": "loading", "id": req.id})
            try:
                engine.load(req.model, req.quantize, edit)
            except Exception as err:  # noqa: BLE001
                print(f"model load failed: {type(err).__name__}", file=sys.stderr)
                engine.unload()
                self.emit({"type": "error", "id": req.id, "code": "model_load_failed"})
                return
        out = (self.outdir / f"{req.id}.png").resolve()
        start = time.monotonic()
        try:
            engine.generate(
                req,
                lambda step, steps: self.emit(
                    {"type": "progress", "id": req.id, "step": step, "steps": steps}
                ),
                self.cancel.is_set,
                out,
            )
        except Cancelled:
            out.unlink(missing_ok=True)
            self.emit({"type": "error", "id": req.id, "code": "cancelled"})
            return
        except Exception as err:  # noqa: BLE001
            print(f"generation failed: {type(err).__name__}", file=sys.stderr)
            out.unlink(missing_ok=True)
            self.emit({"type": "error", "id": req.id, "code": "generation_failed"})
            return
        self.emit(
            {
                "type": "done",
                "id": req.id,
                "path": str(out),
                "seconds": round(time.monotonic() - start, 1),
            }
        )


def main() -> int:
    outdir = os.environ.get("HEMMIA_IMAGEGEN_OUTDIR", "")
    if not outdir or not Path(outdir).is_dir():
        print("HEMMIA_IMAGEGEN_OUTDIR must be an existing directory", file=sys.stderr)
        return 2
    idle = float(os.environ.get("HEMMIA_IMAGEGEN_IDLE_SECONDS", "300"))

    # stdout carries only the protocol; anything libraries print goes to stderr.
    proto = sys.stdout
    sys.stdout = sys.stderr

    worker = Worker(proto, Path(outdir).resolve())
    worker.emit({"type": "ready", "protocol": 1})
    threading.Thread(target=worker.reader, args=(sys.stdin,), daemon=True).start()
    return worker.run(idle)
