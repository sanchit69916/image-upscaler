# PixelLift Photo 4K Lab

PixelLift Photo 4K Lab is a photo enhancement web application designed for realistic upscaling and 4K-ready exports.

The project ships with two execution paths:

- `Hosted web app`: a deployable static frontend that performs browser-based enhancement for immediate public demos
- `Local AI mode`: an optional FastAPI plus Real-ESRGAN pipeline for stronger enhancement on a local machine

This structure keeps the project easy to deploy and share while still supporting a heavier local inference workflow.

## Features

- Image upload with drag-and-drop support
- `2x`, `4x`, and exact `4K UHD` export modes
- `Fit`, `Cover`, and `Stretch` framing for 4K output
- Before and after comparison slider
- Export to `PNG`, `JPG`, or `WEBP`
- Browser enhancement path for hosted deployments
- Optional local Real-ESRGAN enhancement path for stronger results
- Consistent frontend experience across hosted and local modes

## Architecture

### Hosted mode

The deployed Vercel version is a static web app. It performs enhancement directly in the browser using a progressive upscale plus sharpening and local detail finishing pass.

This mode is useful for:

- public demos
- portfolio links
- resume projects
- environments where no backend runtime should be required

### Local AI mode

When the local FastAPI server is running, the app detects `/health` and routes enhancement requests through the bundled Real-ESRGAN runtime.

The local pipeline:

1. accepts an uploaded image
2. runs Real-ESRGAN `x4`
3. applies a light realistic finishing pass
4. optionally frames the result to exact `3840 x 2160`
5. returns the final enhanced image

## Tech stack

- Frontend: HTML, CSS, vanilla JavaScript
- Hosted deployment: Vercel static output
- Local backend: FastAPI
- Local AI runtime: Real-ESRGAN ncnn Vulkan executable
- Image processing: Pillow

## Project structure

```text
.
|-- app.js
|-- index.html
|-- styles.css
|-- manifest.json
|-- sw.js
|-- server.py
|-- start-server.cmd
|-- scripts/
|   `-- build-public.mjs
|-- tools/
|   `-- realesrgan/
`-- public/  (generated during build)
```

## Running locally

### Option 1: Hosted-style frontend only

This is the easiest way to preview the deployable version.

```powershell
cd "C:\Users\sanchit\OneDrive\Documents\image upscaler"
npm run build
```

After building, deploy `public/` through Vercel or another static host.

### Option 2: Local AI mode

Run the bundled local server to enable the stronger Real-ESRGAN pipeline.

1. Double-click `start-server.cmd`
2. Keep the terminal window open
3. Open `http://127.0.0.1:8000`

## Deployment

The hosted version is designed to deploy as a static site.

### Vercel

Use the following project settings:

- `Build Command`: `npm run build`
- `Output Directory`: `public`

No paid API keys are required for the deployed browser version.

## How enhancement works

### Browser mode

The hosted app enhances images by combining:

- progressive canvas upscaling
- high-quality browser resampling
- edge-aware sharpening
- local contrast and texture finishing
- optional 4K framing and export

This produces a visibly sharper and cleaner image, but it is still a browser-side enhancement pipeline rather than full server-side super-resolution inference.

### Local AI mode

The local backend uses Real-ESRGAN for stronger super-resolution, followed by a finishing pass to keep output more natural and reduce overprocessed areas.

## Limitations

- The hosted version is not as strong as dedicated server-side AI inference
- Very low-resolution or heavily compressed source images cannot be perfectly reconstructed
- The strongest results in this project come from the optional local Real-ESRGAN mode
- Face restoration is currently presented as a UI-oriented enhancement mode rather than a separate dedicated facial restoration model

## Use cases

- photo enhancement demos
- frontend plus AI workflow portfolios
- image processing projects
- local versus hosted architecture demonstrations
- 4K export and framing tools

## Future improvements

- dedicated face restoration model integration
- batch processing
- stronger browser inference path
- history or project gallery
- side-by-side export presets for social, wallpaper, and print outputs

## License

This repository does not currently include a license file. Add one if you want to publish it for open reuse.
