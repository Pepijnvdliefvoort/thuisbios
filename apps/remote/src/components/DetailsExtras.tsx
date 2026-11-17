import { Icon } from './Icon';
import { Row } from './Row';
import { useApp } from '../context';
import { collectionIndex, collectionOf } from '../jellyfin/collections';
import type { BaseItem } from '../jellyfin/types';
import { useAsync } from '../useAsync';

/** How many similar titles "More like this" shows. */
const SIMILAR_LIMIT = 12;

/** Online-only rows at the bottom of a movie's or series' details: its collection and similar titles. */
export function DetailsExtras({ item }: { item: BaseItem }) {
  const { offline } = useApp();
  if (offline || (item.Type !== 'Movie' && item.Type !== 'Series')) return null;
  return (
    <>
      {item.Type === 'Movie' ? <CollectionRow item={item} /> : null}
      <SimilarRow item={item} />
    </>
  );
}

/** The films of the collection `item` belongs to, release order, with the current film marked. Quiet on errors. */
function CollectionRow({ item }: { item: BaseItem }) {
  const { client, session, openItem } = useApp();
  const found = useAsync(
    () => collectionIndex(client, session.userId).then((index) => collectionOf(index, item.Id)),
    [client, session.userId, item.Id],
  );
  const hit = found.data;
  if (!hit || hit.films.length === 0) return null;
  return (
    <Row
      title={hit.box.Name}
      heading={
        <button type="button" class="row-link" onClick={() => openItem(hit.box.Id)}>
          {hit.box.Name} <Icon name="chevron" size={18} />
        </button>
      }
      items={hit.films}
      shape="poster"
      currentId={item.Id}
      showWatched
    />
  );
}

/** Up to 12 titles like `item`. Hidden while loading, on an error and when there are none. */
function SimilarRow({ item }: { item: BaseItem }) {
  const { client, session } = useApp();
  const similar = useAsync(() => client.similar(session.userId, item.Id, SIMILAR_LIMIT), [client, session.userId, item.Id]);
  return <Row title="More like this" items={similar.data || []} shape="poster" />;
}
