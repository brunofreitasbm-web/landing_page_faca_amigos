// Dimensões reais das imagens de public/ lidas no build (sharp), para <img width height> sem layout shift.
import sharp from 'sharp';
import { join } from 'node:path';

const cache = new Map<string, { width: number; height: number }>();

export async function dims(src: string) {
  const rel = src.replace(/^\//, '');
  const hit = cache.get(rel);
  if (hit) return hit;
  const meta = await sharp(join(process.cwd(), 'public', rel)).metadata();
  const d = { width: meta.width ?? 0, height: meta.height ?? 0 };
  cache.set(rel, d);
  return d;
}
