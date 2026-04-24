const elements = {
  fileInput: document.getElementById("fileInput"),
  dropzone: document.getElementById("dropzone"),
  preset: document.getElementById("preset"),
  fitMode: document.getElementById("fitMode"),
  model: document.getElementById("model"),
  realismStrength: document.getElementById("realismStrength"),
  outputFormat: document.getElementById("outputFormat"),
  faceEnhance: document.getElementById("faceEnhance"),
  compareSlider: document.getElementById("compareSlider"),
  compareReadout: document.getElementById("compareReadout"),
  compareFrame: document.getElementById("compareFrame"),
  compareOverlay: document.getElementById("compareOverlay"),
  compareDivider: document.getElementById("compareDivider"),
  basePreview: document.getElementById("basePreview"),
  resultPreview: document.getElementById("resultPreview"),
  sourceInfo: document.getElementById("sourceInfo"),
  targetInfo: document.getElementById("targetInfo"),
  pipelineInfo: document.getElementById("pipelineInfo"),
  framingInfo: document.getElementById("framingInfo"),
  exportInfo: document.getElementById("exportInfo"),
  detailInfo: document.getElementById("detailInfo"),
  realismStrengthValue: document.getElementById("realismStrengthValue"),
  upscaleButton: document.getElementById("upscaleButton"),
  downloadButton: document.getElementById("downloadButton"),
  status: document.getElementById("statusMessage"),
  apiState: document.getElementById("apiState")
};

const state = {
  file: null,
  sourceUrl: "",
  resultUrl: "",
  downloadName: "enhanced-photo.png",
  busy: false,
  sourceImage: null,
  backendAvailable: false
};

wireEvents();
syncUi();
checkHealth();

function wireEvents() {
  elements.fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) loadImageFile(file);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add("is-active");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove("is-active");
    });
  });

  elements.dropzone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file && file.type.startsWith("image/")) loadImageFile(file);
  });

  [
    elements.preset,
    elements.fitMode,
    elements.model,
    elements.realismStrength,
    elements.outputFormat,
    elements.faceEnhance
  ].forEach((input) => {
    input.addEventListener("change", syncUi);
    input.addEventListener("input", syncUi);
  });

  elements.compareSlider.addEventListener("input", updateCompareView);
  elements.upscaleButton.addEventListener("click", enhancePhoto);
  elements.downloadButton.addEventListener("click", downloadResult);
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    const data = await response.json();
    if (response.ok && data.ok) {
      state.backendAvailable = true;
      elements.apiState.textContent = "Local Real-ESRGAN server connected.";
      elements.upscaleButton.disabled = !state.file;
      return;
    }
  } catch {}
  state.backendAvailable = false;
  elements.apiState.textContent = "Browser enhancement mode active. Start the local server for stronger AI upscale.";
}

function loadImageFile(file) {
  resetResult();
  revokeSourceUrl();
  state.file = file;
  state.sourceUrl = URL.createObjectURL(file);
  elements.basePreview.src = state.sourceUrl;
  elements.compareFrame.classList.add("has-image");

  const image = new Image();
  image.onload = () => {
    state.sourceImage = image;
    elements.sourceInfo.textContent = `${image.naturalWidth} x ${image.naturalHeight}`;
    setStatus(`Loaded ${file.name}`);
    syncUi();
  };
  image.onerror = () => setStatus("That file could not be opened as an image.");
  image.src = state.sourceUrl;
}

async function enhancePhoto() {
  if (!state.file || state.busy) return;

  state.busy = true;
  syncUi();
  setStatus(state.backendAvailable ? "Uploading image to the local enhancer..." : "Running browser enhancement...");

  try {
    if (!state.backendAvailable) {
      await enhancePhotoInBrowser();
      return;
    }

    const formData = new FormData();
    formData.append("file", state.file);
    formData.append("preset", elements.preset.value);
    formData.append("fit_mode", elements.fitMode.value);
    formData.append("output_format", elements.outputFormat.value);
    formData.append("detail_strength", String(Number(elements.realismStrength.value) / 100));
    formData.append("face_enhance", elements.faceEnhance.checked ? "1" : "0");

    const response = await fetch("/api/upscale", {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Local enhancement failed.");
    }

    const blob = await response.blob();
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(blob);
    state.downloadName = `${safeBaseName(state.file.name)}-enhanced.${elements.outputFormat.value}`;
    elements.resultPreview.src = state.resultUrl;
    elements.downloadButton.disabled = false;
    updateCompareView();
    setStatus("Enhancement complete.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Enhancement failed.");
  } finally {
    state.busy = false;
    syncUi();
  }
}

async function enhancePhotoInBrowser() {
  const source = state.sourceImage;
  if (!source) {
    throw new Error("Load an image first.");
  }

  const { width, height, exportWidth, exportHeight } = getTargetSizing(
    source.naturalWidth,
    source.naturalHeight,
    elements.preset.value
  );

  setStatus("Upscaling in the browser...");
  let canvas = progressiveUpscale(source, width, height);
  canvas = applyLocalFinish(canvas, Number(elements.realismStrength.value) / 100);
  canvas = composeOutput(canvas, exportWidth, exportHeight, elements.fitMode.value);

  const blob = await canvasToBlob(canvas, elements.outputFormat.value);
  if (state.resultUrl) {
    URL.revokeObjectURL(state.resultUrl);
  }
  state.resultUrl = URL.createObjectURL(blob);
  state.downloadName = `${safeBaseName(state.file.name)}-enhanced.${elements.outputFormat.value}`;
  elements.resultPreview.src = state.resultUrl;
  elements.downloadButton.disabled = false;
  updateCompareView();
  setStatus("Browser enhancement complete.");
}

function syncUi() {
  updateCompareView();
  elements.pipelineInfo.textContent = state.backendAvailable ? "Local Real-ESRGAN x4" : "Browser HD enhancer";
  elements.framingInfo.textContent = getFitLabel(elements.fitMode.value);
  elements.exportInfo.textContent = getFormatLabel(elements.outputFormat.value);
  elements.realismStrengthValue.textContent = `${elements.realismStrength.value}%`;
  elements.detailInfo.textContent = elements.faceEnhance.checked
    ? (state.backendAvailable ? "Portrait restore enabled" : "Portrait-friendly detail mode")
    : `${elements.realismStrength.value}% detail pass`;

  if (!state.file) {
    elements.sourceInfo.textContent = "No image loaded";
    elements.targetInfo.textContent = "Waiting for input";
    elements.upscaleButton.disabled = true;
    return;
  }

  elements.targetInfo.textContent = elements.preset.value === "4k"
    ? `3840 x 2160 ${state.backendAvailable ? "local" : "browser"} output`
    : `${elements.preset.value} ${state.backendAvailable ? "local" : "browser"} upscale`;
  elements.upscaleButton.disabled = state.busy;
}

function updateCompareView() {
  const percent = Number(elements.compareSlider.value);
  elements.compareOverlay.style.width = `${percent}%`;
  elements.compareDivider.style.left = `${percent}%`;
  elements.compareReadout.textContent = `${percent}%`;
}

function downloadResult() {
  if (!state.resultUrl) return;
  const anchor = document.createElement("a");
  anchor.href = state.resultUrl;
  anchor.download = state.downloadName;
  anchor.click();
}

function resetResult() {
  if (state.resultUrl) {
    URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = "";
  }
  elements.resultPreview.removeAttribute("src");
  elements.downloadButton.disabled = true;
}

function revokeSourceUrl() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = "";
}

function getFitLabel(mode) {
  if (mode === "cover") return "Fill and crop to 4K";
  if (mode === "stretch") return "Stretch to exact 4K";
  return "Fit inside 4K";
}

function getFormatLabel(format) {
  if (format === "jpg") return "JPEG export";
  if (format === "webp") return "WEBP export";
  return "PNG export";
}

function setStatus(message) {
  elements.status.textContent = message;
}

function safeBaseName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "enhanced-photo";
}

function getTargetSizing(width, height, preset) {
  if (preset === "2x") {
    return { width: width * 2, height: height * 2, exportWidth: width * 2, exportHeight: height * 2 };
  }
  if (preset === "4x") {
    return { width: width * 4, height: height * 4, exportWidth: width * 4, exportHeight: height * 4 };
  }

  const imageRatio = width / height;
  const targetRatio = 3840 / 2160;
  if (imageRatio > targetRatio) {
    return {
      width: 3840,
      height: Math.round(3840 / imageRatio),
      exportWidth: 3840,
      exportHeight: 2160
    };
  }
  return {
    width: Math.round(2160 * imageRatio),
    height: 2160,
    exportWidth: 3840,
    exportHeight: 2160
  };
}

function progressiveUpscale(image, targetWidth, targetHeight) {
  let currentCanvas = document.createElement("canvas");
  currentCanvas.width = image.naturalWidth;
  currentCanvas.height = image.naturalHeight;
  let context = currentCanvas.getContext("2d", { willReadFrequently: true });
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
    nextContext.drawImage(currentCanvas, 0, 0, width, height);
    currentCanvas = nextCanvas;
    context = nextContext;
  }

  return currentCanvas;
}

function applyLocalFinish(canvas, strength) {
  const width = canvas.width;
  const height = canvas.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, width, height);
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const sharpenAmount = 0.35 + strength * 1.25;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const center = source[index + c];
        const top = source[index - width * 4 + c];
        const bottom = source[index + width * 4 + c];
        const left = source[index - 4 + c];
        const right = source[index + 4 + c];
        const edge = center * 5 - top - bottom - left - right;
        const contrast = ((center - 128) * (1 + strength * 0.18)) + 128;
        output[index + c] = clampByte(contrast + (edge - center) * sharpenAmount * 0.18);
      }
      output[index + 3] = 255;
    }
  }

  const result = new ImageData(output, width, height);
  const nextCanvas = document.createElement("canvas");
  nextCanvas.width = width;
  nextCanvas.height = height;
  nextCanvas.getContext("2d").putImageData(result, 0, 0);
  return nextCanvas;
}

function composeOutput(canvas, exportWidth, exportHeight, fitMode) {
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
  const cover = fitMode === "cover";
  const fitWidth = cover ? sourceRatio < targetRatio : sourceRatio > targetRatio;
  const drawWidth = fitWidth ? exportWidth : Math.round(exportHeight * sourceRatio);
  const drawHeight = fitWidth ? Math.round(exportWidth / sourceRatio) : exportHeight;
  const offsetX = Math.round((exportWidth - drawWidth) / 2);
  const offsetY = Math.round((exportHeight - drawHeight) / 2);
  context.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);
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
