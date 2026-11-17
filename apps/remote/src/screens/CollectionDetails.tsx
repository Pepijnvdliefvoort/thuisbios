import { useRegisterReload, useAsync, type Reloaders } from '../useAsync';
import { BackdropImg, Img } from '../components/Img';
import { Grid } from '../components/Row';
import { MediaCard } from '../components/MediaCard';
import { useApp } from '../context';
import { artUrl, artUrls } from '../jellyfin/art';
import { releaseOrder } from '../jellyfin/collections';
import type { BaseItem } from '../jellyfin/types';
import { useDesktop } from '../useDesktop';

/** A collection (BoxSet) in the details screen: backdrop, title, overview and its films in release order. */
export function CollectionDetails({ item, reloaders }: { item: BaseItem; reloaders: Reloaders }) {
  const { client, session } = useApp();
  const desktop = useDesktop();
  const films = useAsync<BaseItem[]>(
    () => client.boxSetItems(session.userId, item.Id).then(releaseOrder),
    [client, session.userId, item.Id],
  );
  useRegisterReload(reloaders, films.reload);
  const list = films.data || [];
  const [backdropW, backdropH] = desktop ? [1920, 1080] : [780, 440];
  const count = list.length > 0 ? `${list.length} ${list.length === 1 ? 'film' : 'films'}` : '';
  const overview = item.Overview ? <p class="overview">{item.Overview}</p> : null;
  const grid = (
    <section class="collection-films">
      {films.loading && !films.data ? <p class="hint">Loading...</p> : null}
      {films.error ? <p class="empty">Couldn't load this collection.</p> : null}
      {films.data && list.length === 0 ? <p class="empty">This collection is empty.</p> : null}
      {list.length > 0 ? (
        <Grid>
          {list.map((film) => (
            <MediaCard key={film.Id} item={film} shape="poster" showWatched />
          ))}
        </Grid>
      ) : null}
    </section>
  );
  if (desktop) {
    return (
      <>
        <div class="details-hero">
          <BackdropImg
            class="hero-img"
            blurClass="hero-blur"
            backdrops={artUrls(client.serverUrl, item, 'backdrop', backdropW, backdropH)}
            poster={artUrl(client.serverUrl, item, 'poster', 480, 720)}
          />
          <div class="hero-fade" />
          <div class="details-hero-body">
            <p class="eyebrow">Collection</p>
            <h1>{item.Name}</h1>
            {count ? (
              <p class="meta meta-badges">
                <span>{count}</span>
              </p>
            ) : null}
            {overview}
          </div>
        </div>
        <div class="details-content">{grid}</div>
      </>
    );
  }
  return (
    <>
      <div class="hero">
        <Img class="hero-img" src={artUrls(client.serverUrl, item, 'backdrop', backdropW, backdropH)} />
        <div class="hero-fade" />
      </div>
      <div class="details-content">
        <div class="details-head">
          <div class="details-main">
            <Img class="poster" src={artUrl(client.serverUrl, item, 'poster', 240, 360)} />
            <div class="details-text">
              <p class="eyebrow">Collection</p>
              <h1>{item.Name}</h1>
              <p class="meta">{count}</p>
            </div>
          </div>
        </div>
        {overview}
        {grid}
      </div>
    </>
  );
}
