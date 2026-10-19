import { useEffect, useState } from 'preact/hooks';
import { audioCall, hasAudioControl, isTizen } from '../tizen/api';
import { focusFirst, useRemote } from '../nav/useRemote';

const ACTIONS = [
  { label: 'Volume up', call: 'setVolumeUp' },
  { label: 'Volume down', call: 'setVolumeDown' },
  { label: 'Mute', call: 'mute' },
  { label: 'Unmute', call: 'unmute' },
  { label: 'Read volume', call: 'getVolume' },
  { label: 'Read mute', call: 'isMute' },
] as const;

export function VolumeScreen({ onExit }: { onExit(): void }) {
  const [log, setLog] = useState<string[]>([]);

  useRemote((key) => {
    if (key === 'back') {
      onExit();
      return true;
    }
    return false;
  });
  useEffect(() => focusFirst(), []);

  const run = (call: (typeof ACTIONS)[number]['call']) => {
    const result = audioCall(call);
    const time = new Date().toLocaleTimeString();
    setLog((old) => [`${time}  ${result.ok ? 'OK ' : 'ERR'}  ${result.message}`].concat(old).slice(0, 8));
  };

  return (
    <main class="screen volume">
      <h1>Volume test</h1>
      <p>
        Tizen: {isTizen() ? 'yes' : 'no'}. tvaudiocontrol: {hasAudioControl() ? 'available' : 'missing'}.
      </p>
      <p class="muted">
        Press the buttons and listen to the soundbar. Does the sound change, and does the soundbar show it?
      </p>
      <div class="buttons">
        {ACTIONS.map((a) => (
          <button key={a.call} data-focusable class="btn" onClick={() => run(a.call)}>
            {a.label}
          </button>
        ))}
        <button data-focusable class="btn" onClick={onExit}>
          Back
        </button>
      </div>
      <pre class="log">{log.join('\n') || 'No calls yet.'}</pre>
    </main>
  );
}
