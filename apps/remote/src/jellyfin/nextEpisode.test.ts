import { describe, expect, it } from 'vitest';
import type { MediaSegment } from './segments';
import { FALLBACK_LEAD_SECONDS, OUTRO_COUNTDOWN_SECONDS, nextArmedAt, nextEpisodeCard, planNextEpisode } from './nextEpisode';

const sec = 10000000;
const outro = (start: number, end: number): MediaSegment => ({ type: 'Outro', startTicks: start * sec, endTicks: end * sec });

describe('planNextEpisode', () => {
  it('starts the card at the outro with the outro countdown', () => {
    expect(planNextEpisode([outro(1300, 1400)], 1440)).toEqual({ showAt: 1300, end: 1440, countdown: OUTRO_COUNTDOWN_SECONDS });
  });
  it('uses the outro that starts last, and ignores one in the first half', () => {
    const plan = planNextEpisode([outro(1200, 1250), outro(1350, 1400)], 1440);
    expect(plan && plan.showAt).toBe(1350);
    expect(planNextEpisode([outro(100, 200)], 1440)).toEqual({ showAt: 1440 - FALLBACK_LEAD_SECONDS, end: 1440, countdown: null });
  });
  it('ignores other segment types', () => {
    const intro: MediaSegment = { type: 'Intro', startTicks: 1300 * sec, endTicks: 1350 * sec };
    expect(planNextEpisode([intro], 1440)).toEqual({ showAt: 1440 - FALLBACK_LEAD_SECONDS, end: 1440, countdown: null });
  });
  it('shows FALLBACK_LEAD_SECONDS before the end without an outro', () => {
    expect(planNextEpisode([], 1440)).toEqual({ showAt: 1440 - FALLBACK_LEAD_SECONDS, end: 1440, countdown: null });
  });
  it('needs a known runtime', () => {
    expect(planNextEpisode([], 0)).toBeNull();
    expect(planNextEpisode([], NaN)).toBeNull();
  });
});

describe('nextArmedAt', () => {
  const plan = { showAt: 1300, end: 1440, countdown: OUTRO_COUNTDOWN_SECONDS };
  it('arms when the position enters the zone, by playing, seeking or resuming', () => {
    expect(nextArmedAt(plan, null, 1299.8, 1300.1)).toBe(1300.1);
    expect(nextArmedAt(plan, null, 600, 1350)).toBe(1350);
    expect(nextArmedAt(plan, null, null, 1400)).toBe(1400);
  });
  it('keeps the arm point during normal playback', () => {
    expect(nextArmedAt(plan, 1300.1, 1300.1, 1300.6)).toBe(1300.1);
    expect(nextArmedAt(plan, 1300.1, 1301.5, 1303.4)).toBe(1300.1);
  });
  it('re-arms on a jump of more than 2 s inside the zone', () => {
    expect(nextArmedAt(plan, 1300, 1305, 1330)).toBe(1330);
    expect(nextArmedAt(plan, 1300, 1330, 1310)).toBe(1310);
  });
  it('clears when the position leaves the zone', () => {
    expect(nextArmedAt(plan, 1300, 1305, 1100)).toBeNull();
    expect(nextArmedAt(plan, 1300, 1439, 1440)).toBeNull();
    expect(nextArmedAt(null, 1300, 1305, 1306)).toBeNull();
  });
});

describe('nextEpisodeCard', () => {
  const early = { showAt: 1300, end: 1440, countdown: OUTRO_COUNTDOWN_SECONDS };
  const late = { showAt: 1440 - FALLBACK_LEAD_SECONDS, end: 1440, countdown: null };
  it('is hidden before the card starts and without a plan', () => {
    expect(nextEpisodeCard(early, 1299.9, null).show).toBe(false);
    expect(nextEpisodeCard(null, 1300, null).show).toBe(false);
  });
  it('counts down from the arm point', () => {
    expect(nextEpisodeCard(early, 1300, 1300)).toEqual({ show: true, remaining: OUTRO_COUNTDOWN_SECONDS, due: false });
    expect(nextEpisodeCard(early, 1302.2, 1300)).toEqual({ show: true, remaining: OUTRO_COUNTDOWN_SECONDS - 2, due: false });
    expect(nextEpisodeCard(early, 1300 + OUTRO_COUNTDOWN_SECONDS - 0.1, 1300)).toEqual({ show: true, remaining: 1, due: false });
  });
  it('is due the countdown after the arm point, not at the outro start', () => {
    expect(nextEpisodeCard(early, 1300 + OUTRO_COUNTDOWN_SECONDS, 1300)).toEqual({ show: false, remaining: 0, due: true });
    expect(nextEpisodeCard(early, 1400, 1400)).toEqual({ show: true, remaining: OUTRO_COUNTDOWN_SECONDS, due: false });
  });
  it('clamps to the natural end', () => {
    expect(nextEpisodeCard(early, 1438, 1438)).toEqual({ show: true, remaining: 2, due: false });
    expect(nextEpisodeCard(early, 1440, 1438)).toEqual({ show: false, remaining: 0, due: false });
  });
  it('counts to the end without credits markers, never due', () => {
    expect(nextEpisodeCard(late, late.showAt, late.showAt).remaining).toBe(FALLBACK_LEAD_SECONDS);
    expect(nextEpisodeCard(late, late.showAt + 2, late.showAt).remaining).toBe(FALLBACK_LEAD_SECONDS - 2);
    expect(nextEpisodeCard(late, 1440, late.showAt)).toEqual({ show: false, remaining: 0, due: false });
  });
});
