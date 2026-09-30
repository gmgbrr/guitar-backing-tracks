/** Qualquer coisa posicionada no tempo (ex.: linha de letra). */
export interface Timed {
  time: number; // segundos
}

/** Índice do item ativo no tempo `t` (último com time <= t), ou -1 antes do primeiro. `items` ordenado. */
export function activeLineIndex(items: readonly Timed[], t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
