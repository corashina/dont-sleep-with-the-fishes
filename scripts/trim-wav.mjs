import { readFile, writeFile } from 'node:fs/promises';

const [, , inputPath, outputPath, secondsText] = process.argv;
const seconds = Number(secondsText);

if (inputPath === undefined || outputPath === undefined || !Number.isFinite(seconds) || seconds <= 0) {
  throw new Error('Usage: node scripts/trim-wav.mjs <input> <output> <seconds>');
}

const source = await readFile(inputPath);
if (source.toString('ascii', 0, 4) !== 'RIFF' || source.toString('ascii', 8, 12) !== 'WAVE') {
  throw new Error('Input is not a RIFF WAVE file');
}

let offset = 12;
let format = null;
let dataOffset = -1;
let dataSize = 0;

while (offset + 8 <= source.length) {
  const id = source.toString('ascii', offset, offset + 4);
  const size = source.readUInt32LE(offset + 4);
  const contentOffset = offset + 8;
  if (id === 'fmt ') {
    format = {
      audioFormat: source.readUInt16LE(contentOffset),
      channels: source.readUInt16LE(contentOffset + 2),
      sampleRate: source.readUInt32LE(contentOffset + 4),
      byteRate: source.readUInt32LE(contentOffset + 8),
      blockAlign: source.readUInt16LE(contentOffset + 12),
      bitsPerSample: source.readUInt16LE(contentOffset + 14),
    };
  } else if (id === 'data') {
    dataOffset = contentOffset;
    dataSize = Math.min(size, source.length - contentOffset);
    break;
  }
  offset = contentOffset + size + (size % 2);
}

if (format === null || dataOffset < 0 || format.audioFormat !== 1) {
  throw new Error('Only uncompressed PCM WAVE files are supported');
}

const requestedBytes = Math.floor(seconds * format.byteRate);
const alignedBytes = Math.floor(
  Math.min(dataSize, requestedBytes) / format.blockAlign,
) * format.blockAlign;
const output = Buffer.allocUnsafe(44 + alignedBytes);

output.write('RIFF', 0, 'ascii');
output.writeUInt32LE(output.length - 8, 4);
output.write('WAVE', 8, 'ascii');
output.write('fmt ', 12, 'ascii');
output.writeUInt32LE(16, 16);
output.writeUInt16LE(format.audioFormat, 20);
output.writeUInt16LE(format.channels, 22);
output.writeUInt32LE(format.sampleRate, 24);
output.writeUInt32LE(format.byteRate, 28);
output.writeUInt16LE(format.blockAlign, 32);
output.writeUInt16LE(format.bitsPerSample, 34);
output.write('data', 36, 'ascii');
output.writeUInt32LE(alignedBytes, 40);
source.copy(output, 44, dataOffset, dataOffset + alignedBytes);

await writeFile(outputPath, output);
