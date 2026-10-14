import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';

// Longest side after compression: material cards are small, gallery photos are larger
const MAX_SIDE = { material: 1100, gallery: 1600 } as const;
export type UploadKind = keyof typeof MAX_SIDE;
export const isUploadKind = (k: unknown): k is UploadKind => typeof k === 'string' && Object.hasOwn(MAX_SIDE, k);

// Any image sharp can read → WebP, EXIF rotation applied, metadata dropped.
// The name is a hash of the result, so the same photo is stored once.
export async function saveImage(input: Buffer, kind: UploadKind) {
  const { data, info } = await sharp(input, { limitInputPixels: 80e6 })
    .rotate()
    .resize({ width: MAX_SIDE[kind], height: MAX_SIDE[kind], fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  const name = createHash('sha256').update(data).digest('hex').slice(0, 32) + '.webp';
  await mkdir(config.uploadDir, { recursive: true });
  await writeFile(path.join(config.uploadDir, name), data);
  return { url: `/uploads/${name}`, width: info.width, height: info.height, bytes: data.length };
}
