import { describe, expect, it } from 'vitest';
import { decideResume, describeDownloadError, HttpError, MAX_RETRIES, PlanError, retryDelayMs, stripToken } from './downloadResume';

describe('decideResume', () => {
  it('continues at the same segment when the count matches', () => {
    expect(decideResume(120, 120, 37)).toEqual({ action: 'continue', from: 37 });
  });
  it('restarts when the count differs', () => {
    expect(decideResume(120, 121, 37)).toEqual({ action: 'restart' });
    expect(decideResume(120, 60, 37)).toEqual({ action: 'restart' });
  });
  it('fails on an empty playlist', () => {
    expect(decideResume(120, 0, 37)).toEqual({ action: 'fail' });
  });
  it('restarts when no saved count is known', () => {
    expect(decideResume(0, 50, 0)).toEqual({ action: 'restart' });
  });
  it('keeps the position inside the playlist', () => {
    expect(decideResume(10, 10, 99)).toEqual({ action: 'continue', from: 10 });
  });
});

describe('retry backoff', () => {
  it('doubles each time and is capped', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
  it('retries a few times', () => {
    expect(MAX_RETRIES).toBe(3);
  });
});

describe('describeDownloadError', () => {
  it('explains http errors in plain words', () => {
    expect(describeDownloadError(new HttpError(401, 'x'))).toContain('signing in');
    expect(describeDownloadError(new HttpError(404, 'x'))).toBe('The server no longer has this video.');
    expect(describeDownloadError(new HttpError(500, 'x'))).toContain('error 500');
  });
  it('explains a full phone', () => {
    const e = new Error('full');
    e.name = 'QuotaExceededError';
    expect(describeDownloadError(e)).toContain('out of storage');
  });
  it('keeps the message of a plan problem', () => {
    expect(describeDownloadError(new PlanError('The server sent an empty video to download.'))).toBe('The server sent an empty video to download.');
  });
  it('treats anything else as a dropped connection', () => {
    expect(describeDownloadError(new TypeError('Load failed'))).toContain('connection dropped');
  });
});

describe('stripToken', () => {
  it('removes the access token parameters', () => {
    expect(stripToken('http://pc/videos/1/hls1/main/0.ts?DeviceId=d&api_key=T&ApiKey=T&PlaySessionId=p')).toBe('http://pc/videos/1/hls1/main/0.ts?DeviceId=d&PlaySessionId=p');
  });
  it('drops the query when nothing else is left', () => {
    expect(stripToken('http://pc/a.ts?api_key=T')).toBe('http://pc/a.ts');
    expect(stripToken('http://pc/a.ts')).toBe('http://pc/a.ts');
  });
});
