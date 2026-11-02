// Builds dev/sample-usb, a fake USB drive for testing in the browser:
// real photos (from picsum.photos, Unsplash licence) in nested folders, with
// EXIF capture dates and one "sideways phone photo" whose pixels are rotated
// and fixed only by its EXIF Orientation flag, to exercise the rotation code.
//
//   node dev/make-samples.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'sample-usb');
const cache = join(here, '.state', 'picsum');

// [folder, picsum id, width, height, capture date, orientation]
const today = new Date();
const md = (y, offsetDays = 0) => {
  const d = new Date(y, today.getMonth(), today.getDate() + offsetDays, 15, 20, 0);
  return d;
};
const PHOTOS = [
  ['DCIM/Vacation 2023', 10, 1920, 1280, new Date(2023, 6, 8, 10, 12)],
  ['DCIM/Vacation 2023', 11, 1920, 1280, new Date(2023, 6, 8, 18, 40)],
  ['DCIM/Vacation 2023', 15, 1920, 1280, new Date(2023, 6, 9, 9, 5)],
  ['DCIM/Vacation 2023', 16, 1920, 1280, new Date(2023, 6, 10, 14, 30)],
  ['DCIM/Vacation 2023', 28, 1920, 1280, new Date(2023, 6, 11, 7, 45)],
  ['DCIM/Vacation 2023', 29, 1920, 1280, new Date(2023, 6, 12, 19, 55)],
  ['DCIM/Vacation 2023', 1015, 1920, 1280, new Date(2023, 6, 13, 12, 0)],
  ['DCIM/Vacation 2023', 1018, 1920, 1280, new Date(2023, 6, 14, 16, 20)],
  ['DCIM/Family', 64, 1080, 1440, md(2019)],
  ['DCIM/Family', 65, 1080, 1440, md(2019)],
  ['DCIM/Family', 91, 1080, 1440, md(2021, 2)],
  ['DCIM/Family', 177, 1080, 1440, md(2022, -1)],
  ['DCIM/Family', 338, 1920, 1280, md(2022, -1)],
  ['DCIM/Family', 1011, 1920, 1280, new Date(2020, 1, 14, 13, 0)],
  ['DCIM/Family', 1027, 1080, 1440, new Date(2020, 3, 2, 11, 0), 6],
  ['DCIM/Family', 1025, 1080, 1440, md(2024, 4)],
  ['Nature', 1036, 1920, 1280, new Date(2018, 0, 20)],
  ['Nature', 1039, 1920, 1280, new Date(2018, 1, 3)],
  ['Nature', 1043, 1080, 1440, new Date(2018, 2, 19)],
  ['Nature', 1044, 1920, 1280, new Date(2019, 4, 1)],
  ['Nature', 1047, 1920, 1280, md(2020, 10)],
  ['Nature', 1050, 1080, 1440, new Date(2021, 8, 8)],
  ['Nature', 1067, 1920, 1280, new Date(2022, 3, 30)],
  ['Nature/Mountains', 1080, 1080, 1440, new Date(2024, 0, 5)],
  ['Nature/Mountains', 1084, 1920, 1280, new Date(2024, 0, 6)],
  ['Nature/Mountains', 1016, 1920, 1280, new Date(2024, 0, 7)],
];

const pad = (n) => String(n).padStart(2, '0');
const exifDate = (d) =>
  `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** A little-endian EXIF APP1 segment with Orientation and DateTimeOriginal. */
function exifSegment(date, orientation) {
  const dateBytes = Buffer.from(`${exifDate(date)}\0`, 'ascii'); // 20 bytes
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 2 + 12 + 4 + dateBytes.length);
  let o = 0;
  tiff.write('II', o); o += 2;
  tiff.writeUInt16LE(42, o); o += 2;
  tiff.writeUInt32LE(8, o); o += 4;
  // IFD0: Orientation, ExifIFDPointer
  tiff.writeUInt16LE(2, o); o += 2;
  tiff.writeUInt16LE(0x0112, o); tiff.writeUInt16LE(3, o + 2); tiff.writeUInt32LE(1, o + 4); tiff.writeUInt16LE(orientation, o + 8); o += 12;
  const exifIfdOffset = 8 + 2 + 24 + 4;
  tiff.writeUInt16LE(0x8769, o); tiff.writeUInt16LE(4, o + 2); tiff.writeUInt32LE(1, o + 4); tiff.writeUInt32LE(exifIfdOffset, o + 8); o += 12;
  tiff.writeUInt32LE(0, o); o += 4;
  // Exif IFD: DateTimeOriginal
  tiff.writeUInt16LE(1, o); o += 2;
  const dateOffset = exifIfdOffset + 2 + 12 + 4;
  tiff.writeUInt16LE(0x9003, o); tiff.writeUInt16LE(2, o + 2); tiff.writeUInt32LE(dateBytes.length, o + 4); tiff.writeUInt32LE(dateOffset, o + 8); o += 12;
  tiff.writeUInt32LE(0, o); o += 4;
  dateBytes.copy(tiff, o);

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** Replaces any APP1 segments in a JPEG with ours. */
function withExif(jpeg, date, orientation) {
  if (jpeg.readUInt16BE(0) !== 0xffd8) throw new Error('not a JPEG');
  const parts = [jpeg.subarray(0, 2), exifSegment(date, orientation)];
  let o = 2;
  while (o < jpeg.length) {
    const marker = jpeg.readUInt16BE(o);
    if (marker === 0xffda) break;
    const len = jpeg.readUInt16BE(o + 2);
    if (marker !== 0xffe1) parts.push(jpeg.subarray(o, o + 2 + len));
    o += 2 + len;
  }
  parts.push(jpeg.subarray(o));
  return Buffer.concat(parts);
}

mkdirSync(cache, { recursive: true });
rmSync(root, { recursive: true, force: true });

let n = 0;
for (const [folder, id, w, h, date, orientation = 1] of PHOTOS) {
  const cached = join(cache, `${id}-${w}x${h}.jpg`);
  if (!existsSync(cached)) {
    const res = await fetch(`https://picsum.photos/id/${id}/${w}/${h}.jpg`);
    if (!res.ok) {
      console.warn(`skip picsum ${id}: HTTP ${res.status}`);
      continue;
    }
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  let jpeg = readFileSync(cached);
  if (orientation === 6) {
    // Store the pixels rotated 90° counter-clockwise, like a phone held
    // sideways; Orientation=6 tells viewers to turn it back clockwise.
    jpeg = execFileSync('magick', ['jpg:-', '-rotate', '-90', '-strip', 'jpg:-'], { input: jpeg });
  }
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  const name = `IMG_${String(4000 + n++).padStart(4, '0')}.jpg`;
  writeFileSync(join(dir, name), withExif(jpeg, date, orientation));
}
console.log(`Wrote ${n} photos to ${root}`);
