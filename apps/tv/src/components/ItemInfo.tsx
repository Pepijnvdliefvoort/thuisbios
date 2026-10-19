import type { JellyfinClient } from '../jellyfin/client';
import { artFor, artUrl } from '../jellyfin/art';
import { displayTitle, episodeSubtitle, metaParts } from '../jellyfin/itemInfo';
import type { BaseItem } from '../jellyfin/types';

const LOGO_W = 520;
const LOGO_H = 140;

interface Props {
  client: JellyfinClient;
  item: BaseItem;
  /** Show the genres line (details page). */
  genres?: boolean;
}

/** Title (logo image when there is one), episode line, meta line, optional genres and the overview. */
export function ItemInfo({ client, item, genres }: Props) {
  const logo = artUrl(client, artFor(item, 'logo'), LOGO_W, LOGO_H);
  const subtitle = episodeSubtitle(item);
  const meta = metaParts(item);
  return (
    <div class="info">
      {logo ? (
        <img key={logo} class="logo" alt={displayTitle(item)} src={logo} />
      ) : (
        <h1 class="info-title">{displayTitle(item)}</h1>
      )}
      {subtitle && <div class="info-sub">{subtitle}</div>}
      {meta.length > 0 && <div class="info-meta">{meta.join('  ·  ')}</div>}
      {genres && item.Genres && item.Genres.length > 0 && <div class="info-genres">{item.Genres.join(', ')}</div>}
      {item.Overview && <p class="info-overview">{item.Overview}</p>}
    </div>
  );
}
