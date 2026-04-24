const $ = (id) => document.getElementById(id);

const ui = {
  fileInput: $("fileInput"),
  dropzone: $("dropzone"),
  preset: $("preset"),
  fitMode: $("fitMode"),
  detailStrength: $("realismStrength"),
  format: $("outputFormat"),
  faceEnhance: $("faceEnhance"),
  compareSlider: $("compareSlider"),
  compareReadout: $("compareReadout"),
  compareFrame: $("compareFrame"),
  compareOverlay: $("compareOverlay"),
  compareDivider: $("compareDivider"),
  basePreview: $("basePreview"),
  resultPreview: $("resultPreview"),
  sourceInfo: $("sourceInfo"),
  targetInfo: $("targetInfo"),
  pipelineInfo: $("pipelineInfo"),
  framingInfo: $("framingInfo"),
  exportInfo: $("exportInfo"),
  detailInfo: $("detailInfo"),
  detailStrengthValue: $("realismStrengthValue"),
  enhanceButton: $("upscaleButton"),
  downloadButton: $("downloadButton"),
  status: $("statusMessage"),
  apiState: $("apiState")
};

const app = {
  file: null,
  sourceImage: null,
  sourceUrl: "",
  resultUrl: "",
  downloadName: "enhanced-photo.png",
  busy: false,
  hasLocalBackend: false
};

boot();

function boot() {
  bindFileInput();
  bindDropzone();
  bindControls();
  render();
  detectBackend();
}

function bindFileInput() {
  ui.fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      openFile(file);
    }
  });
}

function bindDropzone() {
  const activate = (event) => {
    event.preventDefault();
    ui.dropzone.classList.add("is-active");
  };

  const deactivate = (event) => {
    event.preventDefault();
    ui.dropzone.classList.remove("is-active");
  };

  ["dragenter", "dragover"].forEach((name) => {
    ui.dropzone.addEventListener(name, activate);
  });

  ["dragleave", "drop"].forEach((name) => {
    ui.dropzone.addEventListener(name, deactivate);
  });

  ui.dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      openFile(file);
    }
  });
}

function bindControls() {
  [
    ui.preset,
    ui.fitMode,
    ui.detailStrength,
    ui.format,
    ui.faceEnhance
  ].forEach((control) => {
    control.addEventListener("change", render);
    control.addEventListener("input", render);
  });

  ui.compareSlider.addEventListener("input", updateCompareView);
  ui.enhanceButton.addEventListener("click", enhanceImage);
  ui.downloadButton.addEventListener("click", downloadResult);
}

async function detectBackend() {
  try {
    const response = await fetch("/health");
    const data = await response.json();
    app.hasLocalBackend = Boolean(response.ok && data.ok);
  } catch {
    app.hasLocalBackend = false;
  }

  ui.apiState.textContent = app.hasLocalBackend
    ? "Local Real-ESRGAN server connected."
    : "Browser enhancement mode active. Start the local server for a stronger upscale.";

  render();
}

function openFile(file) {
  clearResult();
  releaseSource();

  app.file = file;
  app.sourceUrl = URL.createObjectURL(file);
  ui.basePreview.src = app.sourceUrl;
  ui.compareFrame.classList.add("has-image");

  const image = new Image();
  image.onload = () => {
    app.sourceImage = image;
    ui.sourceInfo.textContent = `${image.naturalWidth} x ${image.naturalHeight}`;
    setStatus(`Loaded ${file.name}`);
    render();
  };
  image.onerror = () => {
    setStatus("That file could not be opened as an image.");
  };
  image.src = app.sourceUrl;
}

async function enhanceImage() {
  if (!app.file || app.busy) {
    return;
  }

  app.busy = true;
  render();
  setStatus(app.hasLocalBackend ? "Uploading to the local enhancer..." : "Enhancing in the browser...");

  try {
    if (app.hasLocalBackend) {
      await runLocalEnhancer();
    } else {
      await runBrowserEnhancer();
    }

    setStatus("Enhancement complete.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Enhancement failed.");
  } finally {
    app.busy = false;
    render();
  }
}

async function runLocalEnhancer() {
  const formData = new FormData();
  formData.append("file", app.file);
  formData.append("preset", ui.preset.value);
  formData.append("fit_mode", ui.fitMode.value);
  formData.append("output_format", ui.format.value);
  formData.append("detail_strength", String(Number(ui.detailStrength.value) / 100));
  formData.append("face_enhance", ui.faceEnhance.checked ? "1" : "0");

  const response = await fetch("/api/upscale", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Local enhancement failed.");
  }

  const blob = await response.blob();
  setResult(blob);
}

async function runBrowserEnhancer() {
  if (!app.sourceImage) {
    throw new Error("Load an image first.");
  }

  const size = getTargetSize(app.sourceImage.naturalWidth, app.sourceImage.naturalHeight, ui.preset.value);
  let canvas = upscaleInSteps(app.sourceImage, size.width, size.height);
  canvas = addDetailPass(canvas, Number(ui.detailStrength.value) / 100);
  canvas = frameOutput(canvas, size.exportWidth, size.exportHeight, ui.fitMode.value);

  const blob = await canvasToBlob(canvas, ui.format.value);
  setResult(blob);
}

function setResult(blob) {
  clearResult();
  app.resultUrl = URL.createObjectURL(blob);
  app.downloadName = `${makeSafeName(app.file?.name || "enhanced-photo")}-enhanced.${ui.format.value}`;
  ui.resultPreview.src = app.resultUrl;
  ui.downloadButton.disabled = false;
  updateCompareView();
}

function clearResult() {
  if (app.resultUrl) {
    URL.revokeObjectURL(app.resultUrl);
    app.resultUrl = "";
  }

  ui.resultPreview.removeAttribute("src");
  ui.downloadButton.disabled = true;
}

function releaseSource() {
  if (app.sourceUrl) {
    URL.revokeObjectURL(app.sourceUrl);
    app.sourceUrl = "";
  }
}

function render() {
  updateCompareView();

  ui.pipelineInfo.textContent = app.hasLocalBackend ? "Local Real-ESRGAN x4" : "Browser HD enhancer";
  ui.framingInfo.textContent = getFitLabel(ui.fitMode.value);
  ui.exportInfo.textContent = getFormatLabel(ui.format.value);
  ui.detailStrengthValue.textContent = `${ui.detailStrength.value}%`;
  ui.detailInfo.textContent = getDetailLabel();

  if (!app.file) {
    ui.sourceInfo.textContent = "No image loaded";
    ui.targetInfo.textContent = "Waiting for input";
    ui.enhanceButton.disabled = true;
    return;
  }

  ui.targetInfo.textContent = getTargetLabel();
  ui.enhanceButton.disabled = app.busy;
}

function getDetailLabel() {
  if (ui.faceEnhance.checked) {
    return app.hasLocalBackend ? "Portrait restore enabled" : "Portrait-friendly detail mode";
  }

  return `${ui.detailStrength.value}% detail pass`;
}

function getTargetLabel() {
  const mode = app.hasLocalBackend ? "local" : "browser";
  if (ui.preset.value === "4k") {
    return `3840 x 2160 ${mode} output`;
  }

  return `${ui.preset.value} ${mode} upscale`;
}

function updateCompareView() {
  const value = Number(ui.compareSlider.value);
  ui.compareOverlay.style.width = `${value}%`;
  ui.compareDivider.style.left = `${value}%`;
  ui.compareReadout.textContent = `${value}%`;
}

function downloadResult() {
  if (!app.resultUrl) {
    return;
  }

  const link = document.createElement("a");
  link.href = app.resultUrl;
  link.download = app.downloadName;
  link.click();
}

function getFitLabel(mode) {
  switch (mode) {
    case "cover":
      return "Fill and crop to 4K";
    case "stretch":
      return "Stretch to exact 4K";
    default:
      return "Fit inside 4K";
  }
}

function getFormatLabel(format) {
  switch (format) {
    case "jpg":
      return "JPEG export";
    case "webp":
      return "WEBP export";
    default:
      return "PNG export";
  }
}

function setStatus(message) {
  ui.status.textContent = message;
}

function makeSafeName(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "enhanced-photo";
}

function getTargetSize(width, height, preset) {
  if (preset === "2x") {
    return { width: width * 2, height: height * 2, exportWidth: width * 2, exportHeight: height * 2 };
  }

  if (preset === "4x") {
    return { width: width * 4, height: height * 4, exportWidth: width * 4, exportHeight: height * 4 };
  }

  const sourceRatio = width / height;
  const frameRatio = 3840 / 2160;

  if (sourceRatio > frameRatio) {
    return {
      width: 3840,
      height: Math.round(3840 / sourceRatio),
      exportWidth: 3840,
      exportHeight: 2160
    };
  }

  return {
    width: Math.round(2160 * sourceRatio),
    height: 2160,
    exportWidth: 3840,
    exportHeight: 2160
  };
}

function upscaleInSteps(image, targetWidth, targetHeight) {
  let canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  let context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0);

  let width = image.naturalWidth;
  let height = image.naturalHeight;

  while (width < targetWidth || height < targetHeight) {
    width = Math.min(targetWidth, Math.max(width + 1, Math.round(width * 1.55)));
    height = Math.min(targetHeight, Math.max(height + 1, Math.round(height * 1.55)));

    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = width;
    nextCanvas.height = height;

    const nextContext = nextCanvas.getContext("2d", { willReadFrequently: true });
    nextContext.imageSmoothingEnabled = true;
    nextContext.imageSmoothingQuality = "high";
    nextContext.drawImage(canvas, 0, 0, width, height);

    canvas = nextCanvas;
    context = nextContext;
  }

  return canvas;
}

function addDetailPass(canvas, strength) {
  const width = canvas.width;
  const height = canvas.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, width, height);
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const sharpen = 0.35 + strength * 1.25;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[offset + channel];
        const top = source[offset - width * 4 + channel];
        const bottom = source[offset + width * 4 + channel];
        const left = source[offset - 4 + channel];
        const right = source[offset + 4 + channel];
        const edge = center * 5 - top - bottom - left - right;
        const contrast = ((center - 128) * (1 + strength * 0.18)) + 128;

        output[offset + channel] = clampByte(contrast + (edge - center) * sharpen * 0.18);
      }

      output[offset + 3] = 255;
    }
  }

  const result = new ImageData(output, width, height);
  const nextCanvas = document.createElement("canvas");
  nextCanvas.width = width;
  nextCanvas.height = height;
  nextCanvas.getContext("2d").putImageData(result, 0, 0);
  return nextCanvas;
}

function frameOutput(canvas, exportWidth, exportHeight, fitMode) {
  if (canvas.width === exportWidth && canvas.height === exportHeight) {
    return canvas;
  }

  const output = document.createElement("canvas");
  output.width = exportWidth;
  output.height = exportHeight;

  const context = output.getContext("2d");
  context.fillStyle = "#0f1318";
  context.fillRect(0, 0, exportWidth, exportHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (fitMode === "stretch") {
    context.drawImage(canvas, 0, 0, exportWidth, exportHeight);
    return output;
  }

  const sourceRatio = canvas.width / canvas.height;
  const targetRatio = exportWidth / exportHeight;
  const shouldFillWidth = fitMode === "cover" ? sourceRatio < targetRatio : sourceRatio > targetRatio;
  const drawWidth = shouldFillWidth ? exportWidth : Math.round(exportHeight * sourceRatio);
  const drawHeight = shouldFillWidth ? Math.round(exportWidth / sourceRatio) : exportHeight;
  const x = Math.round((exportWidth - drawWidth) / 2);
  const y = Math.round((exportHeight - drawHeight) / 2);

  context.drawImage(canvas, x, y, drawWidth, drawHeight);
  return output;
}

function canvasToBlob(canvas, format) {
  const mimeType = format === "jpg" ? "image/jpeg" : `image/${format}`;
  const quality = format === "png" ? undefined : 0.95;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Could not export image."));
    }, mimeType, quality);
  });
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
