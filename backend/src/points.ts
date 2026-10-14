import { pool } from './db.js';
import type { Lang } from './slots.js';

// Map area (same bounds as the map image)
const LAT: [number, number] = [39, 43.6], LON: [number, number] = [69, 80.6];

export type Point = { id: number; lat: number; lon: number; name: string; name_ky: string | null; houses: number; area: number };

const SELECT = 'SELECT id, lat, lon, name, name_ky, houses, area::float AS area FROM map_points ORDER BY name';

export const listPoints = async () => (await pool.query<Point>(SELECT)).rows;

// For the page: one name in the page language (Russian while there is no Kyrgyz one)
export async function listPointsFor(lang: Lang) {
  return (await listPoints()).map(({ name, name_ky, ...p }) => ({ ...p, name: lang === 'ky' ? name_ky || name : name }));
}

// Returns [clean values, errors]
export function cleanPoint(b: Record<string, unknown>): [Omit<Point, 'id'>, string[]] {
  const errors: string[] = [];
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN);
  const lat = num(b.lat), lon = num(b.lon), houses = num(b.houses), area = num(b.area);
  const name = typeof b.name === 'string' ? b.name.trim() : '', nameKy = typeof b.name_ky === 'string' ? b.name_ky.trim() : '';
  if (!(lat >= LAT[0] && lat <= LAT[1]) || !(lon >= LON[0] && lon <= LON[1])) errors.push('Точка должна быть на карте Кыргызстана');
  if (!name || name.length > 80) errors.push('Название: от 1 до 80 символов');
  if (nameKy.length > 80) errors.push('Название (кыр): до 80 символов');
  if (!Number.isInteger(houses) || houses < 0 || houses > 100000) errors.push('Домов построено: целое число ≥ 0');
  if (!(area >= 0 && area < 1e8)) errors.push('Общая площадь: число ≥ 0');
  return [{ lat, lon, name, name_ky: nameKy || null, houses, area: Math.round(area * 10) / 10 }, errors];
}

export async function savePoint(p: Omit<Point, 'id'>, user: string, id?: number) {
  const vals = [p.lat, p.lon, p.name, p.name_ky, p.houses, p.area, user];
  const { rows } = id
    ? await pool.query<{ id: number }>('UPDATE map_points SET lat=$1, lon=$2, name=$3, name_ky=$4, houses=$5, area=$6, updated_by=$7, updated_at=now() WHERE id=$8 RETURNING id', [...vals, id])
    : await pool.query<{ id: number }>('INSERT INTO map_points (lat, lon, name, name_ky, houses, area, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', vals);
  return rows[0]?.id ?? null;
}

export const deletePoint = async (id: number) => (await pool.query('DELETE FROM map_points WHERE id = $1', [id])).rowCount ?? 0;
