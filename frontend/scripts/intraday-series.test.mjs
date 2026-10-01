import assert from 'node:assert/strict';
import test from 'node:test';
import { inferIntradayMarket, nearestIntradayIndex, normalizeIntradayPoints } from '../src/app/watchlist/detail/intradaySeries.ts';

test('volumes retain timestamp alignment, distinguish zero from unknown, and reject invalid values', () => {
  const points = normalizeIntradayPoints([
    { timestamp: 300, price: 10, volume: 100 },
    { timestamp: 600, price: NaN, volume: 999 },
    { timestamp: 900, price: 11, volume: 0 },
    { timestamp: 1200, price: 12, volume: -1 },
    { timestamp: 1500, price: 13, volume: Infinity },
    { timestamp: 1800, price: 14, volume: null },
  ]);
  assert.deepEqual(points.map(p => [p.timestamp, p.volume]), [[300, 100], [900, 0], [1200, null], [1500, null], [1800, null]]);
});

test('bad provider points cannot introduce invalid prices or duplicate timestamps into the curve', () => {
  const points = normalizeIntradayPoints([
    { timestamp: 600, price: 12 }, { timestamp: 300, price: 10 },
    { timestamp: 600, price: 13 }, { timestamp: 400, price: NaN },
    { timestamp: Infinity, price: 14 }, { timestamp: 450, price: 0 },
  ]);
  assert.deepEqual(points, [{ timestamp: 300, price: 10 }, { timestamp: 600, price: 13 }]);
});

test('inspection uses actual timestamps across data gaps and clamps to the endpoints', () => {
  const points = [{ timestamp: 0, price: 10 }, { timestamp: 300, price: 11 }, { timestamp: 3600, price: 12 }];
  assert.equal(nearestIntradayIndex(points, 900), 1);
  assert.equal(nearestIntradayIndex(points, -100), 0);
  assert.equal(nearestIntradayIndex(points, 9999), 2);
  assert.equal(nearestIntradayIndex([], 0), -1);
});

test('fallback routing distinguishes numeric Hong Kong and mainland symbols before daily metadata arrives', () => {
  for (const [symbol, sector, expected] of [['00700', '', 'hk'], ['0700.HK', '', 'hk'], ['600519', '', 'cn'], ['000001.SZ', '', 'cn'], ['2330.TW', '', 'tw'], ['BTC-USD', '', 'crypto'], ['BTC', 'Crypto', 'crypto'], ['MSFT', '', 'us']]) {
    assert.equal(inferIntradayMarket(symbol, sector), expected);
  }
});
