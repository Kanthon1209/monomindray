"use client";

/**
 * Diagonal scrolling "MINDRAY" watermark — ZZZ character-screen scale.
 * Sparse hero bands, huge uppercase ghost type, very slow opposite drift.
 */
const BANDS = 5;
const REPEAT = 6;
const TEXT = "MINDRAY";

export function LoginMarqueeBg() {
  return (
    <div
      aria-hidden
      className="login-marquee-bg pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="login-marquee-stage">
        {Array.from({ length: BANDS }, (_, i) => {
          const reverse = i % 2 === 1;
          // Very slow premium drift: ~100–160s
          const duration = 100 + (i % 4) * 20;
          return (
            <div
              key={i}
              className={`login-marquee-band ${reverse ? "is-reverse" : ""}`}
              style={{
                ["--band-i" as string]: String(i),
                ["--marquee-duration" as string]: `${duration}s`,
              }}
            >
              <div className="login-marquee-track">
                <span className="login-marquee-chunk">
                  {Array.from({ length: REPEAT }, (_, j) => (
                    <span key={`a-${j}`} className="login-marquee-word">
                      {TEXT}
                    </span>
                  ))}
                </span>
                <span className="login-marquee-chunk" aria-hidden>
                  {Array.from({ length: REPEAT }, (_, j) => (
                    <span key={`b-${j}`} className="login-marquee-word">
                      {TEXT}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
