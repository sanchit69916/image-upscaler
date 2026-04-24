# PixelLift Photo 4K Lab

PixelLift is a resume-ready photo enhancement web app with two modes:

- `Hosted showcase mode`: deploy the static frontend to Vercel and run instant browser upscaling with 2x, 4x, and 4K export.
- `Local AI mode`: start the bundled FastAPI plus Real-ESRGAN server to push the same UI through a stronger local enhancement pipeline.

## Showcase deploy

This is the version you can put on your resume because it works as a public web app without asking the viewer to run Python locally.

1. Push the repo to GitHub
2. Import the repo into Vercel
3. Use:
   - `Build Command`: `npm run build`
   - `Output Directory`: `public`
4. Deploy

The deployed site will run in browser enhancement mode automatically.

## Local AI mode

If you want stronger enhancement for your own demos, run the local server:

1. Double-click `start-server.cmd`
2. Keep that terminal window open
3. Open `http://127.0.0.1:8000`

When the UI sees `/health`, it switches from browser mode to local Real-ESRGAN mode automatically.

## What it does

- Supports `2x`, `4x`, and exact `4K UHD` exports
- Includes fit, crop, and stretch framing for 4K
- Uses browser-side enhancement in hosted mode
- Uses bundled `realesrgan-ncnn-vulkan.exe` in local AI mode
- Keeps the same polished frontend in both modes

## Notes

- Hosted mode is easy to showcase, but it is still a browser enhancer rather than a heavyweight server-side AI model
- Local mode is free and stronger because it uses your own machine
- The bundled Python runtime is used automatically by `start-server.cmd`
