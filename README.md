# PixelLift Photo 4K Lab

Free local photo enhancement app using FastAPI and Real-ESRGAN.

## Run

1. Double-click `start-server.cmd`
2. Keep that terminal window open
3. Open `http://127.0.0.1:8000`

## What it does

- Runs Real-ESRGAN locally using the bundled `realesrgan-ncnn-vulkan.exe`
- Supports `2x`, `4x`, and exact `4K UHD` output
- Includes fit, crop, and stretch framing for 4K exports
- Adds a light realistic finishing pass after the AI upscale

## Notes

- This uses your local machine, so no paid API credit is required
- The bundled Python runtime is used automatically by `start-server.cmd`
- The current local runtime does not include true face restoration, so the face toggle is just UI for now
