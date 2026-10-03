import { NOTE_NAMES, STANDARD_TUNING, TUNING_PRESETS, tuningLabel, type NoteName, type Tuning } from '@backing-tracks/shared';

interface Props {
  custom: boolean;
  tuning: Tuning;
  onChange: (custom: boolean, tuning: Tuning) => void;
  disabled?: boolean;
}

/** Escolha de afinação: padrão, ou customizada com a nota de cada corda (6ª → 1ª). */
export function TuningPicker({ custom, tuning, onChange, disabled }: Props) {
  const setString = (i: number, note: NoteName) => onChange(true, tuning.map((n, j) => (j === i ? note : n)));
  const presetName = TUNING_PRESETS.find((p) => p.notes.every((n, i) => n === tuning[i]))?.name ?? '';

  return (
    <fieldset className="tuning-picker" disabled={disabled}>
      <legend>Afinação</legend>
      <div className="tuning-mode">
        <label>
          <input type="radio" name="tuning-mode" checked={!custom} onChange={() => onChange(false, STANDARD_TUNING)} />
          Padrão <span className="muted">(E A D G B E)</span>
        </label>
        <label>
          <input type="radio" name="tuning-mode" checked={custom} onChange={() => onChange(true, tuning)} />
          Customizada
        </label>
      </div>

      {custom && (
        <>
          <label className="tuning-preset">
            Atalho
            <select
              value={presetName}
              onChange={(e) => {
                const preset = TUNING_PRESETS.find((p) => p.name === e.target.value);
                if (preset) onChange(true, [...preset.notes]);
              }}
            >
              <option value="">Personalizada ({tuningLabel(tuning)})</option>
              {TUNING_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} — {p.notes.join(' ')}
                </option>
              ))}
            </select>
          </label>

          <div className="tuning-strings">
            {tuning.map((note, i) => (
              <label key={i}>
                <span>
                  {6 - i}ª{i === 0 ? ' (grave)' : i === 5 ? ' (aguda)' : ''}
                </span>
                <select value={note} onChange={(e) => setString(i, e.target.value as NoteName)} aria-label={`Corda ${6 - i}`}>
                  {NOTE_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}
