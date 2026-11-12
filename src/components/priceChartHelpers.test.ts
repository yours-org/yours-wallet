import { describe, expect, test } from 'bun:test';
import {
  changePct,
  formatChange,
  formatPrice,
  layoutPoints,
  linePaths,
  nearestPoint,
  priceIn,
  widerRange,
} from './priceChartHelpers';

describe('price chart helpers', () => {
  test('points span the box in time and value, with padding above and below', () => {
    const pts = layoutPoints(
      [
        { t: 0, close: 10 },
        { t: 50, close: 30 },
        { t: 100, close: 20 },
      ],
      200,
      100,
      10,
    );
    expect(pts.map((p) => p.x)).toEqual([0, 100, 200]);
    expect(pts[0].y).toBe(90); // the low sits at the bottom pad
    expect(pts[1].y).toBe(10); // the high at the top pad
    expect(pts[2].y).toBe(50);
  });

  test('a flat series sits on the middle line and still draws', () => {
    const pts = layoutPoints(
      [
        { t: 0, close: 5 },
        { t: 10, close: 5 },
      ],
      100,
      60,
    );
    expect(pts.map((p) => p.y)).toEqual([30, 30]);
    const { line, area } = linePaths(pts, 60);
    expect(line).toBe('M0,30 L100,30');
    expect(area).toBe('M0,30 L100,30 L100,60 L0,60 Z');
  });

  test('scrub picks the nearest point', () => {
    const pts = layoutPoints(
      [
        { t: 0, close: 1 },
        { t: 1, close: 2 },
        { t: 2, close: 3 },
      ],
      200,
      100,
    );
    expect(nearestPoint(pts, 90)?.t).toBe(1);
    expect(nearestPoint([], 10)).toBeUndefined();
  });

  test('change and widening', () => {
    expect(
      changePct([
        { t: 0, close: 100 },
        { t: 1, close: 112.4 },
      ]),
    ).toBeCloseTo(12.4);
    expect(changePct([{ t: 0, close: 100 }])).toBeNull();
    expect(formatChange(12.4)).toBe('+12.4%');
    expect(formatChange(-0.5)).toBe('-0.50%');
    expect(formatChange(null)).toBe('—');
    expect(widerRange('1H')).toBe('1D');
    expect(widerRange('ALL')).toBeUndefined();
  });

  test('prices read in either currency', () => {
    expect(priceIn(423, 'BSV', 250)).toBeCloseTo(0.00000423);
    expect(priceIn(423, 'USD', 250)).toBeCloseTo(0.0010575);
    expect(formatPrice(0.0010575, 'USD')).toBe('$0.00106');
    expect(formatPrice(12.5, 'USD')).toBe('$12.50');
    expect(formatPrice(0.00000423, 'BSV')).toBe('0.00000423 BSV');
    expect(formatPrice(0, 'USD')).toBe('$0.00');
    expect(formatPrice(0.0000123456, 'USD')).toBe('$0.0₄123');
  });
});
