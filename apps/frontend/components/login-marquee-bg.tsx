"use client";

/**
 * Diagonal MINDRAY watermark — ZZZ official-site display typography vibe:
 * condensed heavy uppercase, tight tracking, sparse slow bands.
 */
const BANDS = 5;
const REPEAT = 8;
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
          const duration = 96 + (i % 4) * 18;
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
