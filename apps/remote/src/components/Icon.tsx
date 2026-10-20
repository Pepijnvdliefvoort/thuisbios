const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  stop: 'M6 6h12v12H6z',
  next: 'M6 18l8.5-6L6 6zM16 6h2v12h-2z',
  prev: 'M6 6h2v12H6zM9.5 12l8.5 6V6z',
  back: 'M15.4 5.4L14 4l-8 8 8 8 1.4-1.4L8.8 12z',
  home: 'M12 3l9 8h-2.5v9h-5v-6h-3v6h-5v-9H3z',
  search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.3 4.6l3.9-1 3.6 15.3-3.9 1z',
  request: 'M14 10H3v2h11zm0-4H3v2h11zM3 16h7v-2H3zm11-2v3h-3v2h3v3h2v-3h3v-2h-3v-3z',
  tv: 'M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18z',
  eye: 'M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  restart: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
  rewind10: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8zM10.9 16h-1v-3.7l-.9.3v-.8l1.8-.6h.1zm3.6-2.3c0 .9-.4 1.4-1.2 1.4s-1.2-.5-1.2-1.4v-.6c0-.9.4-1.4 1.2-1.4s1.2.5 1.2 1.4zm-1 -.6c0-.4-.1-.6-.2-.6s-.2.2-.2.6v.7c0 .4.1.6.2.6s.2-.2.2-.6z',
  forward10: 'M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8zM10.9 16h-1v-3.7l-.9.3v-.8l1.8-.6h.1zm3.6-2.3c0 .9-.4 1.4-1.2 1.4s-1.2-.5-1.2-1.4v-.6c0-.9.4-1.4 1.2-1.4s1.2.5 1.2 1.4zm-1 -.6c0-.4-.1-.6-.2-.6s-.2.2-.2.6v.7c0 .4.1.6.2.6s.2-.2.2-.6z',
  check: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  chevron: 'M7 10l5 5 5-5z',
  qr: 'M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3z',
  signout: 'M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z',
  volumeDown: 'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z',
  volumeUp: 'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  volumeMute: 'M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.5zM19 12a6.9 6.9 0 0 1-.9 3.4l1.5 1.5A8.9 8.9 0 0 0 21 12a9 9 0 0 0-7-8.8v2.1A7 7 0 0 1 19 12zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3c-.7.5-1.4.9-2.3 1.2v2.1a9 9 0 0 0 3.7-1.9l2 2 1.3-1.3L4.3 3zM12 4L9.9 6.1 12 8.2z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}
