# Login page background switch

Current: **marquee** (fixed MINDRAY watermark). ASCII Perlin is disabled but its code is kept; set `"random"` or `"ascii"` to re-enable.

`random` mode picks on each mount either:

- ASCII Perlin noise (`login-ascii-noise-bg.tsx`)
- Diagonal MINDRAY marquee (`login-marquee-bg.tsx`)

## Force one style (rollback / QA)

1. Open `apps/frontend/app/login/page.tsx`
2. Set `LOGIN_BG_MODE`:
   - `"random"` — 50/50 on every mount
   - `"ascii"` — always ASCII noise
   - `"marquee"` — always MINDRAY marquee (current)
3. Rebuild frontend and redeploy `mindray-web`

Do **not** delete `login-marquee-bg.tsx` or `login-ascii-noise-bg.tsx`.
