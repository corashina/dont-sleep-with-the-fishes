const MPEG_1_LAYER_3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const MPEG_2_LAYER_3_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const MPEG_1_SAMPLE_RATES = [44_100, 48_000, 32_000];

function validFrameHeader(versionBits, layerBits, bitrateIndex, sampleRateIndex) {
  return versionBits !== 0b01
    && layerBits === 0b01
    && bitrateIndex !== 0
    && bitrateIndex !== 0b1111
    && sampleRateIndex !== 0b11;
}

function frameSampleRate(versionBits, sampleRateIndex) {
  const sampleRate = MPEG_1_SAMPLE_RATES[sampleRateIndex];
  if (versionBits === 0b10) return sampleRate / 2;
  if (versionBits === 0b00) return sampleRate / 4;
  return sampleRate;
}

function frameAt(source, offset) {
  if (offset + 4 > source.length) return null;
  const header = source.readUInt32BE(offset);
  if (((header >>> 21) & 0x7ff) !== 0x7ff) return null;
  const versionBits = (header >>> 19) & 0b11;
  const layerBits = (header >>> 17) & 0b11;
  const bitrateIndex = (header >>> 12) & 0b1111;
  const sampleRateIndex = (header >>> 10) & 0b11;
  if (!validFrameHeader(versionBits, layerBits, bitrateIndex, sampleRateIndex)) return null;
  const mpeg1 = versionBits === 0b11;
  const bitrate = (mpeg1
    ? MPEG_1_LAYER_3_BITRATES
    : MPEG_2_LAYER_3_BITRATES)[bitrateIndex];
  const sampleRate = frameSampleRate(versionBits, sampleRateIndex);
  const padding = (header >>> 9) & 1;
  const length = Math.floor(
    (mpeg1 ? 144 : 72) * bitrate * 1000 / sampleRate,
  ) + padding;
  if (offset + length > source.length) return null;
  return {
    length,
    duration: (mpeg1 ? 1152 : 576) / sampleRate,
  };
}

export function splitMp3ByWindows(source, windows) {
  const frames = [];
  let offset = 0;
  let time = 0;
  while (offset + 4 <= source.length) {
    const frame = frameAt(source, offset);
    if (frame === null) {
      offset += 1;
      continue;
    }
    frames.push({ offset, time, ...frame });
    offset += frame.length;
    time += frame.duration;
  }
  if (frames.length === 0) throw new Error('MP3 source contains no Layer III frames.');
  return windows.map(([start, end]) => {
    const selected = frames.filter((frame) => {
      const midpoint = frame.time + frame.duration / 2;
      return midpoint >= start && midpoint <= end;
    });
    if (selected.length === 0) throw new Error(`MP3 window ${start}-${end} is empty.`);
    return Buffer.concat(selected.map((frame) => (
      source.subarray(frame.offset, frame.offset + frame.length)
    )));
  });
}
