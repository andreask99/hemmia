import json
import pytest
from kchat_imagegen.protocol import parse_request, GenerateRequest, CancelRequest, UnloadRequest, ShutdownRequest, ProtocolError

def test_valid_generate():
    line = '{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "quantize": 8, "prompt": "a beautiful landscape", "width": 1024, "height": 1024, "steps": 9, "seed": 1234}'
    req = parse_request(line)
    assert isinstance(req, GenerateRequest)
    assert req.id == "test-job-123"
    assert req.model == "z-image-turbo"
    assert req.quantize == 8
    assert req.prompt == "a beautiful landscape"
    assert req.width == 1024
    assert req.height == 1024
    assert req.steps == 9
    assert req.seed == 1234

def test_invalid_json():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123"')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id is None

def test_unknown_op():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "unknown", "id": "test-job-123"}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id is None

def test_invalid_id():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request(json.dumps({"op": "generate", "id": "a" * 65, "model": "z-image-turbo", "prompt": "test", "width": 256, "height": 256, "steps": 1, "seed": 0}))
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "a" * 65

def test_invalid_prompt_length():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "prompt": "", "width": 256, "height": 256, "steps": 1, "seed": 0}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "test-job-123"

def test_invalid_width():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "prompt": "test", "width": 255, "height": 256, "steps": 1, "seed": 0}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "test-job-123"

def test_invalid_height():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "prompt": "test", "width": 256, "height": 255, "steps": 1, "seed": 0}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "test-job-123"

def test_invalid_steps():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "prompt": "test", "width": 256, "height": 256, "steps": 0, "seed": 0}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "test-job-123"

def test_invalid_seed():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "prompt": "test", "width": 256, "height": 256, "steps": 1, "seed": -1}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "test-job-123"

def test_invalid_model():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "invalid-model", "prompt": "test", "width": 256, "height": 256, "steps": 1, "seed": 0}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "test-job-123"

def test_invalid_quantize():
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "quantize": 7, "prompt": "test", "width": 256, "height": 256, "steps": 1, "seed": 0}')
    assert exc_info.value.code == "bad_request"
    assert exc_info.value.id == "test-job-123"

def test_cancel_request():
    line = '{"op": "cancel", "id": "test-job-123"}'
    req = parse_request(line)
    assert isinstance(req, CancelRequest)
    assert req.id == "test-job-123"

def test_unload_request():
    line = '{"op": "unload"}'
    req = parse_request(line)
    assert isinstance(req, UnloadRequest)

def test_shutdown_request():
    line = '{"op": "shutdown"}'
    req = parse_request(line)
    assert isinstance(req, ShutdownRequest)

def test_boolean_values_rejected():
    # Test that boolean values are rejected for int fields
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "prompt": "test", "width": true, "height": 256, "steps": 1, "seed": 0}')
    assert exc_info.value.code == "bad_request"
    
    with pytest.raises(ProtocolError) as exc_info:
        parse_request('{"op": "generate", "id": "test-job-123", "model": "z-image-turbo", "prompt": "test", "width": 256, "height": 256, "steps": true, "seed": 0}')
    assert exc_info.value.code == "bad_request"