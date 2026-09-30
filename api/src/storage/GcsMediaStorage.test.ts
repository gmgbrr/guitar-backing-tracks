import { describe, expect, it } from 'vitest';
import { GcsMediaStorage, stableExpiry } from './GcsMediaStorage';

const DAY = 24 * 60 * 60 * 1000;

describe('stableExpiry', () => {
  it('é a mesma durante o dia inteiro e fica entre 24 h e 48 h à frente', () => {
    const dayStart = Date.UTC(2026, 8, 30);
    const a = stableExpiry(dayStart + 1000);
    const b = stableExpiry(dayStart + DAY - 1000);
    expect(a).toBe(b);
    expect(a - (dayStart + DAY - 1000)).toBeGreaterThanOrEqual(DAY);
    expect(a - (dayStart + 1000)).toBeLessThanOrEqual(2 * DAY);
  });

  it('muda no dia seguinte', () => {
    const dayStart = Date.UTC(2026, 8, 30);
    expect(stableExpiry(dayStart + DAY)).toBe(stableExpiry(dayStart) + DAY);
  });
});

describe('GcsMediaStorage', () => {
  it('assina songs/<id>/<arquivo> e reaproveita a URL no mesmo dia', async () => {
    const calls: string[] = [];
    const bucket = {
      file: (key: string) => ({
        getSignedUrl: async () => {
          calls.push(key);
          return [`https://signed/${key}?n=${calls.length}`];
        },
      }),
    };
    const storage = new GcsMediaStorage(bucket as never);
    const u1 = await storage.getUrl('paranoid', 'vocals.mp3');
    const u2 = await storage.getUrl('paranoid', 'vocals.mp3');
    expect(u1).toBe('https://signed/songs/paranoid/vocals.mp3?n=1');
    expect(u2).toBe(u1);
    expect(calls).toEqual(['songs/paranoid/vocals.mp3']);
  });
});
