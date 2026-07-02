import DualRange from "./components/DualRange.jsx";
import {
  useClipper,
  VIDEO_QUALITIES,
  AUDIO_QUALITIES,
} from "./hooks/useClipper.js";
import { formatTimestamp } from "./lib/clip.js";

const QUALITY_LABELS = {
  best: "Best",
  1080: "1080p",
  720: "720p",
  480: "480p",
  360: "360p",
  320: "320 kbps",
  192: "192 kbps",
  128: "128 kbps",
};

export default function App() {
  const {
    url,
    setUrl,
    info,
    startText,
    setStartText,
    endText,
    setEndText,
    format,
    setFormat,
    quality,
    setQuality,
    loadingInfo,
    downloading,
    error,
    videoId,
    duration,
    start,
    end,
    validationError,
    loadInfo,
    download,
    pasteInto,
    setStartFromSeconds,
    setEndFromSeconds,
    showTranscript,
    toggleTranscript,
    loadingTranscript,
    transcript,
    rangeTranscript,
    copyTranscript,
  } = useClipper();

  const qualityOptions = format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;

  const urlField = (
    <div className="url-row">
      <input
        type="url"
        placeholder="Paste a YouTube URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={loadInfo}
        onKeyDown={(e) => {
          if (e.key === "Enter") loadInfo();
        }}
      />
    </div>
  );

  const timestampField = (label, value, setter, placeholder, disabled) => (
    <label className="ts-field">
      <span className="ts-label">{label}</span>
      <div className="ts-input">
        <input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setter(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="paste-btn"
          onClick={() => pasteInto(setter)}
          disabled={disabled}
        >
          Paste
        </button>
      </div>
    </label>
  );

  return (
    <main className="app">
      <div className="url-mobile">{urlField}</div>

      <div className="grid">
        <h1 className="title">YouTube Clipper</h1>
        <section className="panel form-col">
          <div className="url-desktop">{urlField}</div>

          <div className="controls">
            <div className="meta">
              {loadingInfo
                ? "Loading video info…"
                : info
                  ? `${info.title} · ${formatTimestamp(duration)}`
                  : "Paste a URL to begin"}
            </div>

            <div className="ts-fields">
              {timestampField(
                "Start",
                startText,
                setStartText,
                "00:00:00",
                !info,
              )}
              {timestampField(
                "End",
                endText,
                setEndText,
                info ? formatTimestamp(duration) : "00:00:00",
                !info,
              )}
            </div>

            <div className="range">
              <DualRange
                min={0}
                max={duration || 1}
                start={start}
                end={end}
                onStart={setStartFromSeconds}
                onEnd={setEndFromSeconds}
                disabled={!info}
              />
              <div className="timestamps">
                <span>{formatTimestamp(start)}</span>
                <span>{formatTimestamp(end - start)} selected</span>
                <span>{formatTimestamp(end)}</span>
              </div>
            </div>

            <div className="options">
              <label className="option-field">
                <span className="ts-label">Format</span>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  disabled={!info}
                >
                  <option value="mp4">MP4 (video)</option>
                  <option value="mp3">MP3 (audio)</option>
                </select>
              </label>

              <label className="option-field">
                <span className="ts-label">Quality</span>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  disabled={!info}
                >
                  {qualityOptions.map((q) => (
                    <option key={q} value={q}>
                      {QUALITY_LABELS[q] || q}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={download}
              disabled={!info || downloading || Boolean(validationError)}
            >
              {downloading
                ? "Downloading…"
                : `Download ${format.toUpperCase()}`}
            </button>

            {downloading && (
              <div
                className="progress"
                role="progressbar"
                aria-label="Downloading clip"
              >
                <div className="progress-bar" />
                <span className="progress-label">Downloading clip…</span>
              </div>
            )}
            {error && <div className="error">{error}</div>}
          </div>
        </section>

        <section className="panel preview-col">
          <div className="preview-header">
            <button
              type="button"
              className="toggle-btn"
              onClick={toggleTranscript}
              disabled={!info}
            >
              {showTranscript ? "View video" : "View transcript"}
            </button>
            {showTranscript && (
              <button
                type="button"
                className="toggle-btn"
                onClick={copyTranscript}
                disabled={rangeTranscript.length === 0}
              >
                Copy
              </button>
            )}
          </div>

          {showTranscript ? (
            <div className="transcript">
              {loadingTranscript ? (
                <span className="transcript-status">Loading transcript…</span>
              ) : rangeTranscript.length > 0 ? (
                <>
                  {rangeTranscript.map((l, i) => (
                    <p key={i} className="transcript-line">
                      <span className="transcript-ts">
                        {formatTimestamp(l.start)}
                      </span>{" "}
                      {l.text}
                    </p>
                  ))}
                  <p className="transcript-note">
                    Auto-generated by YouTube — may contain errors.
                  </p>
                </>
              ) : transcript && transcript.length === 0 ? (
                <span className="transcript-status">
                  No transcript available for this video.
                </span>
              ) : (
                <span className="transcript-status">
                  No lines in the selected range.
                </span>
              )}
            </div>
          ) : (
            <div className="preview">
              {videoId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <span>preview</span>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
