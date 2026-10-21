import { useState, type FormEvent } from 'react';
import { readVideoInput } from './videoInput.ts';

type Props = {
  onLoad: (videoId: string) => void;
};

/** 링크나 영상 ID 입력란. 잘못된 입력은 여기서 안내하고, 이미 불러온 영상은 그대로 둔다 */
export function VideoInputForm({ onLoad }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = readVideoInput(value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onLoad(result.videoId);
  }

  return (
    <form className="video-input" onSubmit={handleSubmit} noValidate>
      <label htmlFor="video-input">YouTube 링크나 영상 ID</label>
      <div className="video-input__row">
        <input
          id="video-input"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? 'video-input-error' : undefined}
        />
        <button type="submit">불러오기</button>
      </div>
      {error && (
        <p id="video-input-error" className="message message--error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
