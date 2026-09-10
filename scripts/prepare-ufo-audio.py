"""Make the UFO ambience loop. Requires: python -m pip install soundfile numpy."""

import sys

import numpy as np
import soundfile as sf


def prepare(source, destination):
    samples, rate = sf.read(source, always_2d=True)
    # Keep the steady hum and crossfade its tail into its head for one second.
    clip = samples[rate:6 * rate]
    if len(clip) != 5 * rate:
        raise ValueError("The UFO source must contain at least six seconds.")
    fade = np.linspace(0, np.pi / 2, rate, endpoint=False)[:, None]
    seam = clip[-rate:] * np.cos(fade) + clip[:rate] * np.sin(fade)
    loop = np.concatenate((clip[rate:-rate], seam))
    peak = np.max(np.abs(loop))
    if peak > 0.98:
        loop *= 0.98 / peak
    sf.write(destination, loop, rate, subtype="PCM_16")


if __name__ == "__main__":
    prepare(sys.argv[1], sys.argv[2])
