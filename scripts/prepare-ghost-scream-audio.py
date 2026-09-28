"""Prepare the CC0 onderwish scream for the ghosts' first contact."""

import sys

import numpy as np
import soundfile as sf


audio, rate = sf.read(sys.argv[1], always_2d=True)
# Remove the silent lead-in. Keep one scream through the final ghost's pass.
audio = audio[round(1.05 * rate):round(3.35 * rate)].copy()
attack = round(0.012 * rate)
release = round(0.35 * rate)
audio[:attack] *= np.linspace(0, 1, attack)[:, None]
audio[-release:] *= np.linspace(1, 0, release)[:, None]
sf.write(sys.argv[2], audio, rate, subtype="PCM_16")
