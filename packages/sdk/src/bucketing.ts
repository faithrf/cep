// Pure module: hashing and variant assignment. No DOM, no storage.

/** murmur3 32-bit over the UTF-8 bytes of `str`. */
export function murmur3(str: string, seed = 0): number {
  const data = new TextEncoder().encode(str);
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h = seed >>> 0;
  const nblocks = data.length >> 2;

  for (let i = 0; i < nblocks; i++) {
    const j = i * 4;
    let k = data[j] | (data[j + 1] << 8) | (data[j + 2] << 16) | (data[j + 3] << 24);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }

  const tail = nblocks * 4;
  let k = 0;
  switch (data.length & 3) {
    case 3: k ^= data[tail + 2] << 16; // fallthrough
    case 2: k ^= data[tail + 1] << 8; // fallthrough
    case 1:
      k ^= data[tail];
      k = Math.imul(k, c1);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, c2);
      h ^= k;
  }

  h ^= data.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface WeightedVariant {
  key: string;
  /** basis points; all weights should sum to 10000 */
  weight: number;
}

/** Deterministically pick a variant key, or null if buckets don't cover the slot. */
export function bucket(
  unitId: string,
  experimentKey: string,
  salt: string,
  variants: WeightedVariant[],
): string | null {
  const slot = murmur3(`${unitId}:${experimentKey}:${salt}`) % 10000;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (slot < cumulative) return v.key;
  }
  return null;
}
