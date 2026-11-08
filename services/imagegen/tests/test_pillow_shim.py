"""Pillow 13.0.0 imports numbers._IntegralLike; the package provides it (see __init__.py)."""

import importlib


def test_pillow_typing_imports_after_the_package():
    importlib.import_module("kchat_imagegen")
    typing_module = importlib.import_module("PIL._typing")
    assert typing_module.IntegralLike is not None


def test_engine_imports_with_mflux():
    # The imports the engine makes when it loads a model (engine.py).
    importlib.import_module("kchat_imagegen")
    from mflux.models.flux2.variants import Flux2Klein  # noqa: F401
