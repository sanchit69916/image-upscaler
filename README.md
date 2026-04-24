# PixelLift Photo 4K Lab

Hosted image enhancement app for realistic photo upscaling.

## Architecture

- Frontend: static HTML/CSS/JS, deployable on Vercel
- API: Vercel serverless functions in `api/`
- AI model: Replicate `nightmareai/real-esrgan`
- Enhancement: Real-ESRGAN upscaling with optional GFPGAN face restoration
- Final export: browser renders the returned AI image into PNG/JPG/WEBP, including exact `3840 x 2160` for 4K mode

## Required Environment Variable

Set this in Vercel:

```text
REPLICATE_API_TOKEN=your_replicate_token
```

Get a token from Replicate account settings.

## Run Locally With Vercel

```powershell
npm install
npx vercel dev
```

Then open:

```text
http://localhost:3000
```

## Deploy

```powershell
npx vercel
```

After deployment, add `REPLICATE_API_TOKEN` in the Vercel dashboard and redeploy.

## Notes

- The browser sends a compressed image data URI to `/api/upscale`.
- `/api/upscale` starts a Replicate prediction.
- `/api/prediction` polls the prediction until the result is ready.
- `/api/image` safely proxies the Replicate output so the browser can create the final downloadable image.
- `4K UHD` mode exports an exact `3840 x 2160` image using the selected fit/crop/stretch framing.
