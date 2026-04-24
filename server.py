import math
import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parent
TMP_ROOT = ROOT / ".tmp"
TMP_ROOT.mkdir(exist_ok=True)
TOOLS_DIR = ROOT / "tools" / "realesrgan"
EXECUTABLE = TOOLS_DIR / "realesrgan-ncnn-vulkan.exe"
OUTPUTS_DIR = ROOT / "outputs"
OUTPUTS_DIR.mkdir(exist_ok=True)

PORT = 8000
MAX_UPLOAD_MB = 30
UHD_WIDTH = 3840
UHD_HEIGHT = 2160

app = FastAPI(title="PixelLift Local Photo Lab")


@app.get("/")
async def home():
    return FileResponse(ROOT / "index.html")


@app.get("/health")
async def health():
    return {"ok": True, "runtime": EXECUTABLE.exists()}


@app.get("/styles.css")
async def styles():
    return FileResponse(ROOT / "styles.css")


@app.get("/app.js")
async def app_js():
    return FileResponse(ROOT / "app.js")


@app.get("/manifest.json")
async def manifest():
    return FileResponse(ROOT / "manifest.json")


@app.get("/sw.js")
async def sw():
    return FileResponse(ROOT / "sw.js")


@app.post("/api/upscale")
async def upscale_image(
    file: UploadFile = File(...),
    preset: str = Form("4x"),
    fit_mode: str = Form("contain"),
    output_format: str = Form("png"),
    detail_strength: float = Form(0.72),
    face_enhance: str = Form("0"),
):
    if not EXECUTABLE.exists():
        raise HTTPException(status_code=503, detail="Real-ESRGAN runtime is missing from tools/realesrgan.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Image file is required.")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image is too large. Limit is {MAX_UPLOAD_MB}MB.")

    preset = preset if preset in {"2x", "4x", "4k"} else "4x"
    fit_mode = fit_mode if fit_mode in {"contain", "cover", "stretch"} else "contain"
    output_format = output_format if output_format in {"png", "jpg", "webp"} else "png"
    detail_strength = clamp_float(detail_strength, 0.35, 1.0)

    temp_id = uuid.uuid4().hex
    input_suffix = normalize_suffix(file.filename)
    input_path = TMP_ROOT / f"{temp_id}-input{input_suffix}"
    sr_path = TMP_ROOT / f"{temp_id}-sr.{output_format}"
    photo_path = TMP_ROOT / f"{temp_id}-photo.{output_format}"
    final_path = photo_path

    try:
        input_path.write_bytes(data)
        process = subprocess.run(
            [
                str(EXECUTABLE),
                "-i",
                str(input_path),
                "-o",
                str(sr_path),
                "-n",
                "realesrgan-x4plus",
                "-s",
                str(2 if preset == "2x" else 4),
                "-f",
                output_format,
            ],
            capture_output=True,
            text=True,
            cwd=str(TOOLS_DIR),
        )

        if process.returncode != 0 or not sr_path.exists():
            detail = process.stderr.strip() or process.stdout.strip() or "Real-ESRGAN inference failed."
            raise HTTPException(status_code=500, detail=detail)

        apply_realistic_finish(input_path, sr_path, photo_path, detail_strength)

        if preset == "4k":
            final_path = render_4k_frame(photo_path, fit_mode, output_format)

        output_name = build_output_name(file.filename, output_format)
        saved_output = OUTPUTS_DIR / output_name
        shutil.copyfile(final_path, saved_output)
        return FileResponse(saved_output, media_type=get_media_type(output_format), filename=output_name)
    finally:
        cleanup_file(input_path)
        cleanup_file(sr_path)
        cleanup_file(photo_path)
        if final_path != photo_path:
            cleanup_file(final_path)


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


def apply_realistic_finish(original_path: Path, sr_path: Path, photo_path: Path, detail_strength: float) -> None:
    original = Image.open(original_path).convert("RGB")
    sr_image = Image.open(sr_path).convert("RGB")

    baseline = original.resize(sr_image.size, Image.Resampling.LANCZOS)
    sr_image = ImageEnhance.Contrast(sr_image).enhance(1.02 + detail_strength * 0.04)
    sr_image = sr_image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=int(55 + detail_strength * 45), threshold=4))
    sr_image = match_color_statistics(sr_image, baseline)

    detail_mask = build_detail_mask(original, sr_image.size)
    blended = Image.composite(
        Image.blend(baseline, sr_image, detail_strength),
        baseline,
        detail_mask,
    )
    blended.save(photo_path, format=save_format_for(photo_path.suffix[1:]), quality=96)


def build_detail_mask(original: Image.Image, target_size: tuple[int, int]) -> Image.Image:
    gray = ImageOps.grayscale(original)
    edges = gray.filter(ImageFilter.FIND_EDGES)
    local_contrast = ImageOps.autocontrast(ImageChops_difference(gray, gray.filter(ImageFilter.GaussianBlur(radius=2.0))))
    mask = Image.blend(edges, local_contrast, 0.45)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.5))
    mask = ImageEnhance.Contrast(mask).enhance(1.8)
    return mask.resize(target_size, Image.Resampling.BICUBIC)


def match_color_statistics(source: Image.Image, reference: Image.Image) -> Image.Image:
    source_channels = source.split()
    reference_channels = reference.split()
    output_channels = []
    for source_channel, reference_channel in zip(source_channels, reference_channels):
        src_stat = ImageStat.Stat(source_channel)
        ref_stat = ImageStat.Stat(reference_channel)
        src_mean = src_stat.mean[0]
        ref_mean = ref_stat.mean[0]
        src_std = max(src_stat.stddev[0], 1.0)
        ref_std = max(ref_stat.stddev[0], 1.0)
        scale = min(max(ref_std / src_std, 0.85), 1.15)
        offset = ref_mean - src_mean * scale
        output_channels.append(source_channel.point(lambda value, s=scale, o=offset: clamp_byte(value * s + o)))
    return Image.merge("RGB", output_channels)


def render_4k_frame(source_path: Path, fit_mode: str, output_format: str) -> Path:
    image = Image.open(source_path).convert("RGB")
    target = Image.new("RGB", (UHD_WIDTH, UHD_HEIGHT), (15, 19, 24))

    if fit_mode == "stretch":
        resized = image.resize((UHD_WIDTH, UHD_HEIGHT), Image.Resampling.LANCZOS)
        target.paste(resized, (0, 0))
    else:
        source_ratio = image.width / image.height
        target_ratio = UHD_WIDTH / UHD_HEIGHT
        if fit_mode == "cover":
            if source_ratio > target_ratio:
                scaled_height = UHD_HEIGHT
                scaled_width = round(UHD_HEIGHT * source_ratio)
            else:
                scaled_width = UHD_WIDTH
                scaled_height = round(UHD_WIDTH / source_ratio)
        else:
            if source_ratio > target_ratio:
                scaled_width = UHD_WIDTH
                scaled_height = round(UHD_WIDTH / source_ratio)
            else:
                scaled_height = UHD_HEIGHT
                scaled_width = round(UHD_HEIGHT * source_ratio)

        resized = image.resize((scaled_width, scaled_height), Image.Resampling.LANCZOS)
        offset_x = math.floor((UHD_WIDTH - scaled_width) / 2)
        offset_y = math.floor((UHD_HEIGHT - scaled_height) / 2)
        target.paste(resized, (offset_x, offset_y))

    final_path = source_path.with_name(f"{source_path.stem}-4k.{output_format}")
    target.save(final_path, format=save_format_for(output_format), quality=96)
    return final_path


def build_output_name(original_name: str | None, output_format: str) -> str:
    stem = Path(original_name or "enhanced").stem
    safe_stem = stem.replace(" ", "-")
    return f"{safe_stem}-enhanced.{output_format}"


def get_media_type(output_format: str) -> str:
    if output_format == "jpg":
        return "image/jpeg"
    if output_format == "webp":
        return "image/webp"
    return "image/png"


def save_format_for(output_format: str) -> str:
    if output_format == "jpg":
        return "JPEG"
    if output_format == "webp":
        return "WEBP"
    return "PNG"


def normalize_suffix(filename: str | None) -> str:
    suffix = Path(filename or "upload.png").suffix.lower()
    return suffix if suffix in {".png", ".jpg", ".jpeg", ".webp"} else ".png"


def clamp_float(value: float, minimum: float, maximum: float) -> float:
    try:
        return max(minimum, min(maximum, float(value)))
    except (TypeError, ValueError):
        return minimum


def clamp_byte(value: float) -> int:
    return int(max(0, min(255, round(value))))


def cleanup_file(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


def ImageChops_difference(image_a: Image.Image, image_b: Image.Image) -> Image.Image:
    from PIL import ImageChops
    return ImageChops.difference(image_a, image_b)
