"""Runs the real worker as a subprocess with the stub engine."""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import pytest
from PIL import Image


class Proc:
    def __init__(self, outdir: Path, idle: str = "5") -> None:
        env = {
            **os.environ,
            "HEMMIA_IMAGEGEN_STUB": "1",
            "HEMMIA_IMAGEGEN_OUTDIR": str(outdir),
            "HEMMIA_IMAGEGEN_IDLE_SECONDS": idle,
        }
        self.p = subprocess.Popen(
            [sys.executable, "-m", "kchat_imagegen"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        self.lines: queue.Queue[dict[str, Any]] = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        assert self.p.stdout
        for line in self.p.stdout:
            self.lines.put(json.loads(line))

    def send(self, obj: object) -> None:
        assert self.p.stdin
        self.p.stdin.write((obj if isinstance(obj, str) else json.dumps(obj)) + "\n")
        self.p.stdin.flush()

    def next(self, timeout: float = 5) -> dict[str, Any]:
        return self.lines.get(timeout=timeout)

    def until(self, type_: str, timeout: float = 10) -> list[dict[str, Any]]:
        seen = []
        deadline = time.monotonic() + timeout
        while True:
            m = self.next(max(0.1, deadline - time.monotonic()))
            seen.append(m)
            if m["type"] == type_ or (type_ != "error" and m["type"] == "error"):
                return seen

    def close(self) -> None:
        if self.p.poll() is None:
            self.p.kill()
        self.p.wait(5)


def gen(id_: str, steps: int = 3, prompt: str = "a red square") -> dict[str, Any]:
    return {"op": "generate", "id": id_, "model": "flux2-klein-4b", "prompt": prompt,
            "width": 256, "height": 256, "steps": steps, "seed": 7}


@pytest.fixture
def proc(tmp_path: Path):  # type: ignore[no-untyped-def]
    p = Proc(tmp_path)
    assert p.next() == {"type": "ready", "protocol": 1}
    yield p
    p.close()


def test_generate_and_reuse_model(proc: Proc, tmp_path: Path) -> None:
    proc.send(gen("job-1"))
    msgs = proc.until("done")
    assert [m["type"] for m in msgs] == ["loading", "progress", "progress", "progress", "done"]
    path = Path(msgs[-1]["path"])
    assert path.parent == tmp_path.resolve()
    assert Image.open(path).size == (256, 256)
    proc.send(gen("job-2"))
    assert "loading" not in [m["type"] for m in proc.until("done")]


def test_cancel(proc: Proc, tmp_path: Path) -> None:
    proc.send(gen("job-1", steps=40))
    proc.until("progress")
    proc.send({"op": "cancel", "id": "job-1"})
    msgs = proc.until("error")
    assert msgs[-1] == {"type": "error", "id": "job-1", "code": "cancelled"}
    assert list(tmp_path.iterdir()) == []


def test_busy(proc: Proc) -> None:
    proc.send(gen("job-1", steps=20))
    proc.until("progress")
    proc.send(gen("job-2"))
    assert proc.until("error") [-1] == {"type": "error", "id": "job-2", "code": "busy"}
    assert proc.until("done", timeout=15)[-1]["id"] == "job-1"


def test_bad_input_keeps_running(proc: Proc) -> None:
    proc.send("not json")
    assert proc.next() == {"type": "error", "id": None, "code": "bad_request"}
    proc.send({**gen("job-1"), "width": True})
    assert proc.next() == {"type": "error", "id": "job-1", "code": "bad_request"}
    proc.send(gen("job-2"))
    assert proc.until("done")[-1]["type"] == "done"


def test_prompt_never_on_stderr(tmp_path: Path) -> None:
    p = Proc(tmp_path)
    p.next()
    p.send(gen("job-1", prompt="SECRET-PROMPT-123"))
    p.until("done")
    p.send({"op": "shutdown"})
    assert p.p.wait(5) == 0
    assert p.p.stderr and "SECRET-PROMPT" not in p.p.stderr.read()


def test_unload_and_eof_exit_cleanly(tmp_path: Path) -> None:
    p = Proc(tmp_path)
    p.next()
    p.send({"op": "unload"})
    assert p.next() == {"type": "unloaded"}
    assert p.p.wait(5) == 0
    q = Proc(tmp_path)
    q.next()
    assert q.p.stdin
    q.p.stdin.close()
    assert q.p.wait(5) == 0


def test_idle_exit(tmp_path: Path) -> None:
    p = Proc(tmp_path, idle="1")
    p.next()
    assert p.p.wait(4) == 0


def test_edit_uses_source_image(proc: Proc, tmp_path: Path) -> None:
    src = tmp_path / "job-9-src.png"
    Image.new("RGB", (64, 64), (10, 200, 30)).save(src)
    proc.send({**gen("job-9"), "image": str(src)})
    done = proc.until("done")[-1]
    with Image.open(done["path"]) as out:
        assert out.getpixel((10, 10)) == (10, 200, 30)


def test_rejects_foreign_source_paths(proc: Proc, tmp_path: Path) -> None:
    proc.send({**gen("job-1"), "image": "/etc/passwd"})
    assert proc.next() == {"type": "error", "id": "job-1", "code": "bad_request"}
    proc.send({**gen("job-2"), "image": str(tmp_path / "job-2-src.png")})  # missing file
    assert proc.next() == {"type": "error", "id": "job-2", "code": "bad_request"}
