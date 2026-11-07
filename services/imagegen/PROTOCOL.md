# kchat image worker protocol (v1)

The server starts the worker as a child process and talks to it over stdin/stdout, one
JSON object per line (UTF-8, `\n`-terminated). stderr is for the worker's own diagnostics
and is **never** allowed to contain prompts. The worker has no network port.

Start: `uv run --project services/imagegen --frozen python -m kchat_imagegen`
Environment: `HEMMIA_IMAGEGEN_OUTDIR` = a private directory (mode 0700) created by the
server; the worker writes result PNGs only there. `HEMMIA_IMAGEGEN_MODEL_DIR` (default
`~/.local/share/kchat/models`): pre-quantized models saved with
`mflux-save --path <dir>/<model> --model <model> --quantize 4`; the worker loads
`<dir>/<model>` when it exists (fast, ~14–20 GiB peak) and otherwise the original weights
with on-the-fly quantization (needs ~32 GiB: avoid). `HEMMIA_IMAGEGEN_IDLE_SECONDS` (default
300): exit on its own after this long without a request. `HF_HUB_OFFLINE=1`: weights must
already be downloaded; the worker never fetches anything.

## Server → worker

```json
{"op": "generate", "id": "<job id>", "model": "z-image-turbo", "quantize": 8,
 "prompt": "...", "width": 1024, "height": 1024, "steps": 9, "seed": 1234,
 "image": "<outdir>/<job id>-src.png"}
{"op": "cancel", "id": "<job id>"}
{"op": "unload"}
{"op": "shutdown"}
```

- One `generate` at a time. A `generate` while another runs gets `error` / `busy`.
- `model` + `quantize` select the mflux model. If a different model is loaded, the worker
  unloads it first.
- `image` (optional) is a source photo to edit, written by the server into
  `HEMMIA_IMAGEGEN_OUTDIR` as `<job id>-src.png`. FLUX.2 Klein uses it as a reference image
  (edit mode); Z-Image Turbo uses it as the starting image (image-to-image, strength 0.6).
  The server deletes it after the job.
- `cancel` stops the running job between denoising steps; the worker replies `error` with
  code `cancelled` for that id.
- `unload` frees the model (the worker then exits with code 0, which returns all memory
  to macOS). `shutdown` exits immediately.

## Worker → server

```json
{"type": "ready", "protocol": 1}
{"type": "loading", "id": "<job id>"}
{"type": "progress", "id": "<job id>", "step": 3, "steps": 9}
{"type": "done", "id": "<job id>", "path": "<outdir>/<job id>.png", "seconds": 12.4}
{"type": "error", "id": "<job id or null>", "code": "bad_request|busy|model_load_failed|generation_failed|cancelled"}
{"type": "unloaded"}
```

- `ready` once at start-up, before any model is loaded.
- `loading` only when the job needs a model load.
- `done.path` is always inside `HEMMIA_IMAGEGEN_OUTDIR` and named after the job id; the
  server reads it, encrypts it, stores it and deletes the file.
- Validation (`bad_request`): id matches `^[A-Za-z0-9-]{1,64}$`; prompt 1–1000 chars;
  width/height 256–2048 and multiples of 16; steps 1–50; seed 0–2^32-1; model in the
  worker's allowlist (`z-image-turbo`, `flux2-klein-4b`); quantize one of 3,4,5,6,8 or absent;
  `image`, if present, must be `<outdir>/<job id>-src.png` and exist.
- Unparseable input lines produce `error` with id null and code `bad_request`; the worker
  keeps running.
