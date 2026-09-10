# Audio size audit — 2026-09-10

The largest savings come from shorter recordings. Lower bitrates reduce downloads, but do not reduce decoded buffer memory.

No audio files or runtime code changed during this audit. No listening test or transcode test was performed.

## Measured baseline

- 80 files: 79 MP3 files and one WAV file.
- Total: **43,661,805 bytes** = **43.66 MB** = **41.64 MiB**.
- Total duration: **1,844.57 seconds**, or **30.74 minutes**.
- Channels: 60 stereo files and 20 mono files.
- Estimated float32 PCM: **563.07 MiB** at source sample rates; **586.82 MiB** at 48 kHz.
- The five largest files contain **20.30 MB**, or **46.5%** of all audio bytes.

These memory totals describe all source files decoded once. They are not measured browser memory or simultaneous gameplay residency.
They exclude browser overhead, transient decode buffers, and duplicate buffers for sound aliases.

MP3 durations come from summed MPEG Layer III frame durations, using the frame rules in `scripts/split-mp3.mjs`.
Channel mode and sample rate come from frame headers. WAV values come from its RIFF format and data chunks.
MP3 frame lengths cover every MP3 byte in this inventory. The WAV has a 44-byte header.
Encoder delay and padding can make actual decoded durations slightly different.

Memory estimate: `duration × sampleRate × channels × 4` bytes.
The backend uses `decodeAudioData`, which resamples decoded data to the audio context rate.
Thus, lowering only the encoded sample rate does not ensure a smaller decoded buffer.
See the [Web Audio specification](https://www.w3.org/TR/webaudio/#dom-baseaudiocontext-decodeaudiodata).

## Largest files

MB uses 1,000,000 bytes. PCM uses MiB and source sample rates. Bitrate is the whole-file average.

| File | MB | Seconds | Channels | Hz | kb/s | PCM MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| rain.mp3 | 7.529 | 316.06 | 2 | 48000 | 190.6 | 115.74 |
| calmOcean.mp3 | 4.107 | 179.76 | 2 | 48000 | 182.8 | 65.83 |
| roughOcean.mp3 | 3.348 | 148.42 | 1 | 48000 | 180.5 | 27.18 |
| menuAmbient.mp3 | 2.915 | 120.06 | 2 | 44100 | 194.3 | 40.39 |
| tentacleMovement.mp3 | 2.402 | 87.77 | 1 | 44100 | 218.9 | 14.77 |
| scavengeChase.mp3 | 2.157 | 91.35 | 2 | 44100 | 188.9 | 30.74 |
| bucketRain.mp3 | 1.657 | 69.77 | 2 | 48000 | 190.0 | 25.55 |
| roomTone.mp3 | 1.616 | 70.32 | 2 | 48000 | 183.9 | 25.75 |
| dawn.wav | 1.536 | 8.00 | 2 | 48000 | 1536.0 | 2.93 |
| lightWaveImpact.mp3 | 1.335 | 58.42 | 1 | 48000 | 182.9 | 10.70 |
| radioSignal.mp3 | 1.228 | 66.09 | 1 | 22050 | 148.6 | 5.56 |
| strongWind.mp3 | 1.226 | 55.12 | 2 | 44100 | 177.9 | 18.54 |
| eerieMelody.mp3 | 1.222 | 54.60 | 2 | 44100 | 179.0 | 18.37 |
| tornadoWind.mp3 | 1.055 | 45.62 | 2 | 48000 | 185.0 | 16.71 |
| rescueEnding.mp3 | 0.996 | 43.82 | 2 | 48000 | 181.8 | 16.05 |
| thunderLightning.mp3 | 0.902 | 40.39 | 2 | 44100 | 178.6 | 13.59 |
| hardWaveImpact.mp3 | 0.836 | 36.74 | 1 | 48000 | 182.1 | 6.73 |
| underwaterMovement.mp3 | 0.830 | 47.33 | 2 | 44100 | 140.2 | 15.93 |
| leak.mp3 | 0.602 | 20.87 | 2 | 44100 | 230.9 | 7.02 |
| checkBackAnglerfish.mp3 | 0.443 | 21.21 | 2 | 44100 | 166.9 | 7.14 |

## Highest-impact changes

### 1. Edit shorter ambience loops

All six files below already loop in `audioManifest.ts`.
These lengths are trial targets, not approved edits or measured quality results.
Choose stable sections, join the ends with a crossfade, then listen for clicks and obvious repetition.

| File | Trial duration | Estimated file saving | PCM saving at 48 kHz |
| --- | ---: | ---: | ---: |
| rain.mp3 | 30 s | 6.81 MB | 104.76 MiB |
| calmOcean.mp3 | 30 s | 3.42 MB | 54.84 MiB |
| roughOcean.mp3 | 30 s | 2.67 MB | 21.68 MiB |
| menuAmbient.mp3 | 30 s | 2.19 MB | 32.98 MiB |
| tentacleMovement.mp3 | 20 s | 1.85 MB | 12.41 MiB |
| roomTone.mp3 | 20 s | 1.16 MB | 18.43 MiB |
| **Total** | **160 s** | **18.11 MB** | **245.10 MiB** |

File estimates preserve each current average bitrate. Actual output depends on the selected section and encoder.
This scenario reduces the full audio inventory to about **25.56 MB**, before other changes.
Do not treat a raw MP3 frame cut as proof of a clean loop. Decode and check the final joined loop.

### 2. Remove unused tails and isolate effects

- `scavengeChase.mp3` lasts 91.35 seconds. `ScavengeAudio.startCountdown` stops it at 50 seconds with a 0.08-second fade.
  Check a 50.1-second export. The estimated saving is **0.97 MB** and **15.11 MiB** at 48 kHz.
- `bucketRain.mp3` lasts 69.77 seconds, but plays as an effect. Review a short action clip.
- `lightWaveImpact.mp3` lasts 58.42 seconds. The game triggers it every eight seconds, with two voices maximum.
- `hardWaveImpact.mp3` lasts 36.74 seconds. The game triggers it every four seconds, with two voices maximum.
  Review isolated wave impacts for both files. Keep the useful attack and decay.
- Review `junkCatch.mp3` (18.98 seconds) and `anchorChain.mp3` (13.82 seconds) against their action durations.

No silence intervals were measured. File duration does not prove silence.
Use threshold detection to locate possible silence, then inspect and listen before trimming.
FFmpeg provides `silencedetect`; its threshold can mistake quiet ambience for silence.
See the [FFmpeg filter documentation](https://ffmpeg.org/ffmpeg-filters.html#silencedetect).

Keep `radioSignal.mp3` timing intact. `SurvivalPhase.beginRadioSignal` expires the available radio action when playback ends.
Shortening this file also shortens that action window unless gameplay timing changes.
Keep music structure and deliberate effect tails during review.

### 3. Encode the WAV and test lower bitrates

`dawn.wav` stores eight seconds as 16-bit stereo PCM at 48 kHz.
At 128 kb/s, its payload would be about **128 KB**, saving about **1.41 MB**, or **91.7%**.
This does not reduce its decoded PCM size. Confirm the attack, decay, and audible quality after encoding.

Start with MP3 at 128 kb/s for listening comparisons. The current loader already accepts MP3.
Trial 96 kb/s Opus as a separate comparison if more savings are needed.
An Opus change needs a chosen container, loader support, and decode tests on supported browsers.
No codec quality or browser compatibility was verified in this audit.

For unchanged durations, the arithmetic below applies a target bitrate only when it makes a file smaller.
It includes WAV conversion and excludes container overhead. These are size estimates, not encoder results.

| Target average bitrate | Estimated inventory | Estimated saving |
| --- | ---: | ---: |
| 128 kb/s | 29.46 MB | 14.20 MB / 32.5% |
| 96 kb/s | 22.13 MB | 21.54 MB / 49.3% |

Do not add these savings to loop savings directly; the changes affect the same bytes.
Do not re-encode files already below the target bitrate without a separate reason.
Use original Freesound source files when available. Re-encoding an MP3 adds another lossy generation.

Mono exports can halve decoded memory for selected stereo effects.
Check phase cancellation and spatial character before conversion. File savings depend on the chosen encoder bitrate.
The large `roughOcean` and `tentacleMovement` files are already mono.

### 4. Remove one unused asset

`midnightMonsterRun.mp3` uses **317,373 bytes** and lasts **13.40 seconds**.
Its only text references under `src`, `scripts`, and `tests` are attribution and the fetch list.
It has no sound ID or playback reference.
The existing build includes `dist/assets/midnightMonsterRun-BxVTiTK3.mp3` because the audio glob includes every audio file.

Remove the asset and fetch entry together when applying cleanup. Update attribution to match the remaining assets.
This saves about **0.32 MB** in the build. It does not save a currently acquired gameplay buffer.

## Reproducible asset workflow

The fetch script saves whole Freesound HQ MP3 previews for most entries.
Its current exceptions include the dive lead-in trim and seven extracted cat meows.
Keep each approved trim window and encoding choice in the asset preparation workflow.
Otherwise, a forced fetch can restore a large source file over an edited asset.

Recommended order: remove the unused file, encode `dawn`, trim the chase tail, then edit and compare ambience loops.
Review effect trims and codec changes after those reductions.

FFmpeg and FFprobe were not available on PATH. No encoder was installed and no external audio was downloaded.
The audit used local Node.js to read headers and file sizes, plus source inspection for playback behavior.
