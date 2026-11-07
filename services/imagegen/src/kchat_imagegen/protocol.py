import os
import json
import re
from dataclasses import dataclass
from typing import Optional, Union

# Allowed models
ALLOWED_MODELS = {'z-image-turbo', 'flux2-klein-4b'}

@dataclass
class GenerateRequest:
    id: str
    model: str
    quantize: Optional[int]
    prompt: str
    width: int
    height: int
    steps: int
    seed: int
    image: Optional[str] = None

@dataclass
class CancelRequest:
    id: str

@dataclass
class UnloadRequest:
    pass

@dataclass
class ShutdownRequest:
    pass

Request = Union[GenerateRequest, CancelRequest, UnloadRequest, ShutdownRequest]

class ProtocolError(Exception):
    def __init__(self, code: str, id: Optional[str] = None):
        self.code = code
        self.id = id
        super().__init__(f"Protocol error {code}")

def parse_request(line: str) -> Request:
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        raise ProtocolError("bad_request", None)

    if not isinstance(data, dict):
        raise ProtocolError("bad_request", None)
    op = data.get('op')
    if op is None:
        raise ProtocolError("bad_request", None)

    if op == "generate":
        return _parse_generate_request(data)
    elif op == "cancel":
        return _parse_cancel_request(data)
    elif op == "unload":
        return UnloadRequest()
    elif op == "shutdown":
        return ShutdownRequest()
    else:
        raise ProtocolError("bad_request", None)

def _is_int(value: object) -> bool:
    # bool is a subclass of int in Python; the protocol doesn't accept true/false as numbers.
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_generate_request(data: dict) -> GenerateRequest:
    # Validate id
    req_id = data.get('id')
    if not isinstance(req_id, str):
        raise ProtocolError("bad_request", None)
    if not re.match(r'^[A-Za-z0-9-]{1,64}$', req_id):
        raise ProtocolError("bad_request", req_id)

    # Validate model
    model = data.get('model')
    if not isinstance(model, str) or model not in ALLOWED_MODELS:
        raise ProtocolError("bad_request", req_id)

    # Validate quantize - must be int or None, no booleans allowed
    quantize = data.get('quantize')
    if quantize is not None and not _is_int(quantize):
        raise ProtocolError("bad_request", req_id)
    if quantize is not None and quantize not in [3, 4, 5, 6, 8]:
        raise ProtocolError("bad_request", req_id)

    # Validate prompt
    prompt = data.get('prompt')
    if not isinstance(prompt, str):
        raise ProtocolError("bad_request", req_id)
    prompt = prompt.strip()
    if len(prompt) < 1 or len(prompt) > 1000:
        raise ProtocolError("bad_request", req_id)

    # Validate width - must be int, no booleans allowed
    width = data.get('width')
    if not _is_int(width):
        raise ProtocolError("bad_request", req_id)
    if width < 256 or width > 2048 or width % 16 != 0:
        raise ProtocolError("bad_request", req_id)

    # Validate height - must be int, no booleans allowed
    height = data.get('height')
    if not _is_int(height):
        raise ProtocolError("bad_request", req_id)
    if height < 256 or height > 2048 or height % 16 != 0:
        raise ProtocolError("bad_request", req_id)

    # Validate steps - must be int, no booleans allowed
    steps = data.get('steps')
    if not _is_int(steps):
        raise ProtocolError("bad_request", req_id)
    if steps < 1 or steps > 50:
        raise ProtocolError("bad_request", req_id)

    # Validate seed - must be int, no booleans allowed
    seed = data.get('seed')
    if not _is_int(seed):
        raise ProtocolError("bad_request", req_id)
    if seed < 0 or seed >= (2**32):
        raise ProtocolError("bad_request", req_id)

    # Optional source photo: only the server-written file for this job, inside the out dir.
    image = data.get('image')
    if image is not None:
        if not isinstance(image, str):
            raise ProtocolError("bad_request", req_id)
        outdir = os.path.realpath(os.environ.get('HEMMIA_IMAGEGEN_OUTDIR', ''))
        expected = os.path.join(outdir, f"{req_id}-src.png")
        if os.path.realpath(image) != expected or not os.path.isfile(expected):
            raise ProtocolError("bad_request", req_id)

    return GenerateRequest(
        image=image,
        id=req_id,
        model=model,
        quantize=quantize,
        prompt=prompt,
        width=width,
        height=height,
        steps=steps,
        seed=seed
    )

def _parse_cancel_request(data: dict) -> CancelRequest:
    req_id = data.get('id')
    if not isinstance(req_id, str):
        raise ProtocolError("bad_request", None)
    if not re.match(r'^[A-Za-z0-9-]{1,64}$', req_id):
        raise ProtocolError("bad_request", req_id)
    return CancelRequest(id=req_id)