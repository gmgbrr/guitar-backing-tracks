import type { StemPlayer, StemState } from '../audio/StemPlayer';

interface Props {
  player: StemPlayer | null;
  stems: StemState[];
  masterVolume: number;
}

const LABELS: Record<string, string> = {
  vocals: 'Voz',
  drums: 'Bateria',
  bass: 'Baixo',
  guitar: 'Guitarra',
  piano: 'Piano',
  other: 'Outros',
};

export function StemMixer({ player, stems, masterVolume }: Props) {
  const anySolo = stems.some((s) => s.solo);
  return (
    <section className="mixer">
      <header>
        <h2>Mixer</h2>
        <button className="link" onClick={() => player?.resetMix()} disabled={!player}>
          Resetar
        </button>
      </header>

      {stems.map((s) => {
        const silent = anySolo ? !s.solo : s.muted;
        return (
          <div key={s.name} className={`channel ${silent ? 'silent' : ''}`}>
            <span className="name">{LABELS[s.name] ?? s.name}</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={s.volume}
              onChange={(e) => player?.setVolume(s.name, Number(e.target.value))}
              onDoubleClick={() => player?.setVolume(s.name, 1)}
              style={{ '--progress': `${(s.volume / 1.5) * 100}%` } as React.CSSProperties}
              aria-label={`Volume ${s.name}`}
              title="Duplo clique volta para 100%"
            />
            <span className="pct">{Math.round(s.volume * 100)}%</span>
            <button
              className={`toggle mute ${s.muted ? 'on' : ''}`}
              onClick={() => player?.toggleMute(s.name)}
              title="Mudo"
            >
              M
            </button>
            <button
              className={`toggle solo ${s.solo ? 'on' : ''}`}
              onClick={() => player?.toggleSolo(s.name)}
              title="Solo"
            >
              S
            </button>
          </div>
        );
      })}

      <div className="channel master">
        <span className="name">Master</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={masterVolume}
          onChange={(e) => player?.setMasterVolume(Number(e.target.value))}
          onDoubleClick={() => player?.setMasterVolume(1)}
          style={{ '--progress': `${(masterVolume / 1.5) * 100}%` } as React.CSSProperties}
          aria-label="Volume master"
        />
        <span className="pct">{Math.round(masterVolume * 100)}%</span>
      </div>
    </section>
  );
}
