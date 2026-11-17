import { describe, expect, it } from 'vitest';
import { asTrailerItem, trailerSource, youtubeEmbedUrl, youtubeId } from './trailers';

const ID = 'dQw4w9WgXcQ';

describe('youtubeId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=10s`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}?rel=0`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])('finds the id in %s', (url) => expect(youtubeId(url)).toBe(ID));

  it.each([
    [''],
    ['not a url'],
    ['https://vimeo.com/123456789'],
    ['https://www.youtube.com/watch'],
    ['https://www.youtube.com/watch?v=short'],
    ['https://www.youtube.com/playlist?list=PL123'],
    ['https://youtu.be/'],
    ['https://notyoutube.com/watch?v=dQw4w9WgXcQ'],
    ['https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ'],
    ['javascript:alert(1)'],
  ])('rejects %s', (url) => expect(youtubeId(url)).toBeNull());

  it('handles missing values', () => {
    expect(youtubeId(undefined)).toBeNull();
    expect(youtubeId(null)).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  it('uses the no-cookie host with the inline autoplay options', () => {
    expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&playsinline=1&rel=0`);
  });
});

describe('trailerSource', () => {
  it('prefers a stored trailer', () => {
    expect(trailerSource({ LocalTrailerCount: 1, RemoteTrailers: [{ Url: `https://youtu.be/${ID}` }] })).toEqual({ kind: 'local' });
  });
  it('falls back to the first YouTube link', () => {
    expect(trailerSource({ LocalTrailerCount: 0, RemoteTrailers: [{ Url: 'https://vimeo.com/1' }, { Url: `https://youtu.be/${ID}` }] })).toEqual({ kind: 'youtube', id: ID });
  });
  it('opens other links in a tab', () => {
    expect(trailerSource({ RemoteTrailers: [{ Url: 'https://vimeo.com/1' }] })).toEqual({ kind: 'link', url: 'https://vimeo.com/1' });
  });
  it('ignores unusable links and missing data', () => {
    expect(trailerSource({})).toBeNull();
    expect(trailerSource({ RemoteTrailers: [{}, { Url: 'javascript:alert(1)' }] })).toBeNull();
  });
});

describe('asTrailerItem', () => {
  it('forces the Trailer type and keeps the rest', () => {
    expect(asTrailerItem({ Id: 't', Name: 'T', Type: 'Video' })).toEqual({ Id: 't', Name: 'T', Type: 'Trailer' });
  });
});
