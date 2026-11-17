import { useRef } from 'preact/hooks';
import { PersonPhoto } from '../components/CastSection';
import { Icon } from '../components/Icon';
import { MediaCard } from '../components/MediaCard';
import { PullSpinner } from '../components/PullSpinner';
import { Grid } from '../components/Row';
import { GridSkeleton } from '../components/Skeleton';
import { useApp } from '../context';
import { formatBirthDate } from '../jellyfin/people';
import { useAsync } from '../useAsync';
import { useDesktop } from '../useDesktop';
import { usePullToRefresh } from '../usePullToRefresh';

/** An actor or crew member: photo, birth date and biography when Jellyfin has them, and their titles in the library. */
export function PersonScreen({ id, name, onBack }: { id: string; name: string; onBack: () => void }) {
  const { client, session } = useApp();
  const desktop = useDesktop();
  const person = useAsync(() => client.item(session.userId, id), [client, session.userId, id]);
  const titles = useAsync(() => client.personTitles(session.userId, id), [client, session.userId, id]);
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () => Promise.all([person.reload(), titles.reload()]));
  const info = person.data;
  const born = info ? formatBirthDate(info.PremiereDate) : '';
  const size = desktop ? 160 : 112;
  return (
    <div class="page person-screen" ref={pageRef}>
      <PullSpinner pull={pull} />
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" size={26} />
      </button>
      <div class="person-head">
        <PersonPhoto id={id} name={name} tag={info && info.ImageTags ? info.ImageTags.Primary : undefined} size={size} />
        <div class="person-text">
          <h1>{info ? info.Name : name}</h1>
          {born ? <p class="person-born">Born {born}</p> : null}
        </div>
      </div>
      {info && info.Overview ? <p class="person-bio">{info.Overview}</p> : null}
      <h2 class="person-titles-head">In your library</h2>
      {titles.loading && !titles.data ? desktop ? <GridSkeleton count={6} /> : <p class="hint">Loading...</p> : null}
      {titles.error ? <p class="empty">Couldn't load the titles. Check the connection.</p> : null}
      {titles.data && titles.data.length === 0 ? <p class="empty">Nothing in your library yet.</p> : null}
      {titles.data && titles.data.length > 0 ? (
        <Grid>
          {titles.data.map((item) => (
            <MediaCard key={item.Id} item={item} shape="poster" />
          ))}
        </Grid>
      ) : null}
    </div>
  );
}
