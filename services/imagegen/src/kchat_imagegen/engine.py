"""Image engines: the real mflux engine and a stub for tests."""

from __future__ import annotations

import gc
import os
import time
from pathlib import Path
from typing import Callable, Optional, Protocol, Tuple

from PIL import Image

from .protocol import GenerateRequest

StepFn = Callable[[int, int], None]
StopFn = Callable[[], bool]


class Cancelled(Exception):
    pass


# (model, quantize, edit): FLUX.2 Klein needs a different pipeline class for edits.
Key = Tuple[str, Optional[int], bool]


class Engine(Protocol):
    @property
    def loaded_key(self) -> Optional[Key]: ...

    def load(self, model: str, quantize: Optional[int], edit: bool = False) -> None: ...

    def generate(self, req: GenerateRequest, on_step: StepFn, should_stop: StopFn, out_path: Path) -> None: ...

    def unload(self) -> None: ...


class StubEngine:
    """No ML: fast fake steps and a solid-colour PNG."""

    def __init__(self) -> None:
        self._key: Optional[Key] = None

    @property
    def loaded_key(self) -> Optional[Key]:
        return self._key

    def load(self, model: str, quantize: Optional[int], edit: bool = False) -> None:
        time.sleep(0.05)
        self._key = (model, quantize, edit)

    def generate(self, req: GenerateRequest, on_step: StepFn, should_stop: StopFn, out_path: Path) -> None:
        for i in range(1, req.steps + 1):
            time.sleep(0.02)
            if should_stop():
                raise Cancelled()
            on_step(i, req.steps)
        colour = (req.seed % 256, (req.seed // 256) % 256, (req.seed // 65536) % 256)
        if req.image:
            # Prove the source was readable: tint it instead of a plain colour.
            with Image.open(req.image) as src:
                src.convert("RGB").resize((req.width, req.height)).save(out_path, format="PNG")
            return
        Image.new("RGB", (req.width, req.height), colour).save(out_path, format="PNG")

    def unload(self) -> None:
        self._key = None


class MfluxEngine:
    def __init__(self) -> None:
        self._model: object | None = None
        self._key: Optional[Key] = None
        self._hooks: Optional[Tuple[StepFn, StopFn]] = None

    @property
    def loaded_key(self) -> Optional[Key]:
        return self._key

    def load(self, model: str, quantize: Optional[int], edit: bool = False) -> None:
        from mflux.models.common.config.model_config import ModelConfig
        from mflux.models.flux2.variants import Flux2Klein, Flux2KleinEdit
        from mflux.models.z_image.variants.z_image import ZImage
        from mflux.utils.exceptions import StopImageGenerationException

        model_dir = Path(os.path.expanduser(os.environ.get("HEMMIA_IMAGEGEN_MODEL_DIR", "~/.local/share/kchat/models")))
        saved = model_dir / model
        path = str(saved) if saved.is_dir() else None
        q = None if path else quantize
        if model == "z-image-turbo":
            m = ZImage(quantize=q, model_path=path, model_config=ModelConfig.z_image_turbo())
        elif model == "flux2-klein-4b":
            # The edit pipeline needs a reference image; plain generation uses Flux2Klein.
            cls = Flux2KleinEdit if edit else Flux2Klein
            m = cls(quantize=q, model_path=path, model_config=ModelConfig.flux2_klein_4b())
        else:
            raise ValueError("unknown model")

        engine = self

        class _Progress:
            # mflux can't unregister callbacks, so one per loaded model forwards to the current job.
            def call_in_loop(self, t, seed, prompt, latents, config, time_steps):  # type: ignore[no-untyped-def]
                hooks = engine._hooks
                if hooks is None:
                    return
                on_step, should_stop = hooks
                on_step(t + 1, config.num_inference_steps)
                if should_stop():
                    raise StopImageGenerationException()

        m.callbacks.register(_Progress())
        self._model = m
        self._key = (model, quantize, edit)

    def generate(self, req: GenerateRequest, on_step: StepFn, should_stop: StopFn, out_path: Path) -> None:
        from mflux.utils.exceptions import StopImageGenerationException

        if self._model is None:
            raise RuntimeError("no model loaded")
        self._hooks = (on_step, should_stop)
        try:
            extra: dict[str, object] = {}
            if req.model == "flux2-klein-4b":
                extra["guidance"] = 1.0
                if req.image:
                    extra["image_paths"] = [req.image]
            elif req.image:
                extra["image_path"] = req.image
                extra["image_strength"] = 0.6
            image = self._model.generate_image(  # type: ignore[attr-defined]
                seed=req.seed,
                prompt=req.prompt,
                num_inference_steps=req.steps,
                width=req.width,
                height=req.height,
                **extra,
            )
            image.save(path=str(out_path), export_json_metadata=False)
        except StopImageGenerationException as err:
            raise Cancelled() from err
        finally:
            self._hooks = None

    def unload(self) -> None:
        self._model = None
        self._key = None
        gc.collect()
        try:
            import mlx.core as mx

            clear = getattr(mx, "clear_cache", None)
            if clear:
                clear()
        except ImportError:
            pass


def get_engine() -> Engine:
    return StubEngine() if os.environ.get("HEMMIA_IMAGEGEN_STUB") == "1" else MfluxEngine()
