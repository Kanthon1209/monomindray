# Login page background switch

Default: **random** — each time the login page mounts, pick either:

- ASCII Perlin noise (`login-ascii-noise-bg.tsx`)
- Diagonal MINDRAY marquee (`login-marquee-bg.tsx`)

## Force one style (rollback / QA)

1. Open `apps/frontend/app/login/page.tsx`
2. Set `LOGIN_BG_MODE`:
   - `"random"` — 50/50 on every mount (default)
   - `"ascii"` — always ASCII noise
   - `"marquee"` — always MINDRAY marquee
3. Rebuild frontend and redeploy `mindray-web`

Do **not** delete `login-marquee-bg.tsx` or `login-ascii-noise-bg.tsx`.
