# Login page background switch

Current default: **ASCII Perlin noise** (`login-ascii-noise-bg.tsx`).

## Rollback to MINDRAY marquee

1. Open `apps/frontend/app/login/page.tsx`
2. Set `USE_ASCII_NOISE_BG = false`
3. Rebuild frontend and redeploy `mindray-web`

Do **not** delete `login-marquee-bg.tsx` or `login-ascii-noise-bg.tsx`.
