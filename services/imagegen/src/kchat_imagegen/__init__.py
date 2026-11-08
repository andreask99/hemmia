"""kchat image worker."""

import numbers as _numbers

# Pillow 13.0.0's PIL/_typing.py does `from numbers import _IntegralLike`, which no released
# Python has (it counts on Python 3.15's lazy imports). The name is only a type-hint alias, so
# provide it before anything imports Pillow; otherwise every picture fails with ImportError.
# Remove once Pillow ships a fix (found 2026-11-08; Pillow 13 is kept for its security fixes).
if not hasattr(_numbers, "_IntegralLike"):
    _numbers._IntegralLike = _numbers.Integral  # type: ignore[attr-defined]
