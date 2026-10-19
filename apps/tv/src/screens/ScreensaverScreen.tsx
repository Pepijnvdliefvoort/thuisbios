import { useEffect, useRef, useState } from 'preact/hooks';
import { CalmBackground } from '../components/CalmBackground';
import type { JellyfinClient } from '../jellyfin/client';
import type { Session } from '../jellyfin/types';
import { moveFocus, useRemote } from '../nav/useRemote';
import { activateElement, setDpadHandler } from '../nav/pointerDpad';
import { REFRESH_MS, SLIDE_H, SLIDE_MS, SLIDE_W, buildSlides, formatClock, nextSlide, type Slide } from '../screensaver/slides';

interface Props {
  client: JellyfinClient;
  session: Session;
  onSignOut(): void;
}

const MENU_MS = 10000;
const PRELOAD_TIMEOUT_MS = 8000;
const LIST_SIZE = 40;

/** One of the two stacked image layers. `n` changes per slide so the CSS animation restarts. */
interface Layer {
  slide: Slide;
  n: number;
}

function preload(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    window.setTimeout(done, PRELOAD_TIMEOUT_MS);
    img.src = url;
  });
}

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
    <path d="M11 18.5h2" />
  </svg>
);

/**
 * The TV's resting screen: a slow slideshow of library backdrops (or a calm gradient when there are
 * none). Cheap by design: two image layers, CSS animations only, one timer every 12 s.
 */
export function ScreensaverScreen({ client, session, onSignOut }: Props) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [active, setActive] = useState(0);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const menuTimer = useRef<number | undefined>(undefined);

  // The list of slides, refreshed every 30 minutes. A failed refresh keeps the old list.
  useEffect(() => {
    let alive = true;
    const load = () =>
      client
        .screensaverItems(session.userId, LIST_SIZE)
        .then((items) => {
          if (alive) setSlides(buildSlides(items, client));
        })
        .catch(() => undefined);
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [client, session.userId]);

  // The slideshow: show the first slide, then every SLIDE_MS preload the next one and crossfade.
  const slidesKey = slides.map((s) => s.id).join(',');
  useEffect(() => {
    if (slides.length === 0) {
      setLayers([]);
      return;
    }
    let alive = true;
    let timer: number | undefined;
    let index = 0;
    let n = 1;
    let front = 0;
    const show = (slide: Slide, slot: number) => {
      setLayers((old) => {
        const next = old.slice();
        next[slot] = { slide, n: n++ };
        return next;
      });
      setActive(slot);
      front = slot;
    };
    preload(slides[0].backdrop).then(() => {
      if (!alive) return;
      show(slides[0], 0);
      const tick = () => {
        timer = window.setTimeout(() => {
          const upcoming = slides[nextSlide(index, slides.length)];
          preload(upcoming.backdrop).then(() => {
            if (!alive) return;
            index = nextSlide(index, slides.length);
            show(upcoming, 1 - front);
            tick();
          });
        }, SLIDE_MS);
      };
      tick();
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // The slides only change when their ids do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slidesKey]);

  // Clock, once a few seconds (HH:MM only changes each minute).
  useEffect(() => {
    const t = window.setInterval(() => setClock(formatClock(new Date())), 5000);
    return () => window.clearInterval(t);
  }, []);

  const closeMenu = () => {
    window.clearTimeout(menuTimer.current);
    // A focused hidden button would turn the next OK press into a click on it.
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && a.blur) a.blur();
    setMenu(false);
  };
  const openMenu = () => {
    window.clearTimeout(menuTimer.current);
    menuTimer.current = window.setTimeout(closeMenu, MENU_MS);
    setMenu(true);
  };
  useEffect(() => () => window.clearTimeout(menuTimer.current), []);

  // Focus "Close" when the menu opens (the safe choice for a stray OK press).
  useEffect(() => {
    if (!menu) return;
    const el = document.querySelector('.ss-menu [data-close]') as HTMLElement | null;
    if (el) el.focus();
  }, [menu]);

  useRemote((key) => {
    if (!menuRef.current) {
      if (key === 'enter') {
        openMenu();
        return true;
      }
      // Nothing to move between while the menu is hidden.
      return key === 'up' || key === 'down' || key === 'left' || key === 'right';
    }
    // Any key keeps the menu open a little longer.
    openMenu();
    return false;
  });

  // TV browser: the pointer-as-D-pad moves between the two buttons and clicks the focused one.
  useEffect(() => {
    setDpadHandler({
      onDirection: (dir) => {
        if (menuRef.current) {
          openMenu();
          moveFocus(dir);
        }
        return true;
      },
      onClick: () => {
        const el = document.activeElement as HTMLElement | null;
        if (menuRef.current && el && el.hasAttribute && el.hasAttribute('data-focusable')) activateElement(el);
        else openMenu();
        return true;
      },
    });
    return () => setDpadHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main class="ss" onClick={() => { if (!menuRef.current) openMenu(); }}>
      {layers.length === 0 && <CalmBackground />}
      {layers.map((layer, slot) => (
        <div key={slot} class={'ss-layer' + (active === slot ? ' on' : '')}>
          <img
            key={layer.n}
            class={'ss-img ' + (layer.n % 2 === 0 ? 'ss-kb-b' : 'ss-kb-a')}
            alt=""
            width={SLIDE_W}
            height={SLIDE_H}
            src={layer.slide.backdrop}
          />
          <div class="ss-shade" />
          <div class="ss-info" key={'t' + layer.n}>
            {layer.slide.logo ? (
              <img class="ss-logo" alt={layer.slide.title} src={layer.slide.logo} />
            ) : (
              <h1 class="ss-title">{layer.slide.title}</h1>
            )}
            {layer.slide.year && <div class="ss-year">{layer.slide.year}</div>}
            {layer.slide.overview && <p class="ss-overview">{layer.slide.overview}</p>}
          </div>
        </div>
      ))}
      <div class="ss-clock">{clock}</div>
      <div class="ss-hint">
        <PhoneIcon />
        <span>Pick something to watch on your phone</span>
      </div>
      <div class={'ss-menu' + (menu ? ' on' : '')} aria-hidden={!menu}>
        <div class="ss-menu-card">
          <button class="btn" data-focusable tabIndex={menu ? 0 : -1} onClick={onSignOut}>
            Sign out
          </button>
          <button class="btn" data-focusable data-close tabIndex={menu ? 0 : -1} onClick={closeMenu}>
            Close
          </button>
        </div>
      </div>
    </main>
  );
}
