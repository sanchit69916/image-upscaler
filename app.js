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
  sourceImage: null
};

wireEvents();
syncUi();

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
  setStatus("Preparing image for cloud enhancement...");

  try {
    const imageData = await prepareImageDataUri();
    setStatus("Starting Real-ESRGAN enhancement...");

    const created = await postJson("/api/upscale", {
      image: imageData,
      scale: getScale(),
      faceEnhance: elements.faceEnhance.checked,
      target: elements.preset.value,
      detailStrength: Number(elements.realismStrength.value)
    });

    const prediction = await waitForPrediction(created.id);
    const outputUrl = normalizeOutputUrl(prediction.output);
    if (!outputUrl) throw new Error("The model did not return an output image.");

    setStatus("Preparing final export...");
    const finalBlob = await renderFinalExport(outputUrl);
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(finalBlob);
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

async function waitForPrediction(id) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const prediction = await postJson("/api/prediction", { id });
    if (prediction.status === "succeeded" || prediction.status === "successful") {
      return prediction;
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(prediction.error || "The enhancement job failed.");
    }
    setStatus(`Enhancing photo in the cloud... ${prediction.status || "processing"}`);
    await sleep(1500);
  }
  throw new Error("The enhancement job took too long. Try a smaller image.");
}

async function prepareImageDataUri() {
  const image = state.sourceImage;
  const target = getUploadSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, target.width, target.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function getUploadSize(width, height) {
  if (elements.preset.value === "4k") {
    const detail = Number(elements.realismStrength.value) / 100;
    return fitWithin(width, height, Math.round(760 + detail * 360), Math.round(428 + detail * 202));
  }
  if (elements.preset.value === "2x") {
    const detail = Number(elements.realismStrength.value) / 100;
    return fitWithin(width, height, Math.round(1200 + detail * 800), Math.round(1200 + detail * 800));
  }
  const detail = Number(elements.realismStrength.value) / 100;
  return fitWithin(width, height, Math.round(1000 + detail * 700), Math.round(1000 + detail * 700));
}

function fitWithin(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function getScale() {
  if (elements.preset.value === "2x") return 2;
  return 4;
}

async function renderFinalExport(outputUrl) {
  const imageUrl = await fetchSameOriginImage(outputUrl);
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");

  if (elements.preset.value === "4k") {
    canvas.width = 3840;
    canvas.height = 2160;
    drawFramedImage(canvas, image);
  } else {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
  }

  URL.revokeObjectURL(imageUrl);
  return canvasToBlob(canvas, elements.outputFormat.value);
}

async function fetchSameOriginImage(outputUrl) {
  const response = await fetch(`/api/image?url=${encodeURIComponent(outputUrl)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Could not fetch enhanced image.");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function drawFramedImage(canvas, image) {
  const context = canvas.getContext("2d");
  context.fillStyle = "#0f1318";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (elements.fitMode.value === "stretch") {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return;
  }

  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = canvas.width / canvas.height;
  const cover = elements.fitMode.value === "cover";
  const fitWidth = cover ? sourceRatio < canvasRatio : sourceRatio > canvasRatio;
  const drawWidth = fitWidth ? canvas.width : Math.round(canvas.height * sourceRatio);
  const drawHeight = fitWidth ? Math.round(canvas.width / sourceRatio) : canvas.height;
  const offsetX = Math.round((canvas.width - drawWidth) / 2);
  const offsetY = Math.round((canvas.height - drawHeight) / 2);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || "Request failed.");
  }
  return data;
}

function normalizeOutputUrl(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output[0];
  if (output && typeof output.url === "string") return output.url;
  return "";
}

function syncUi() {
  updateCompareView();
  elements.apiState.textContent = "Cloud Real-ESRGAN API ready after deployment.";
  elements.pipelineInfo.textContent = "Real-ESRGAN cloud model";
  elements.framingInfo.textContent = getFitLabel(elements.fitMode.value);
  elements.exportInfo.textContent = getFormatLabel(elements.outputFormat.value);
  elements.realismStrengthValue.textContent = `${elements.realismStrength.value}%`;
  elements.detailInfo.textContent = elements.faceEnhance.checked
    ? "GFPGAN face restore enabled"
    : `${elements.realismStrength.value}% source detail`;

  if (!state.file) {
    elements.sourceInfo.textContent = "No image loaded";
    elements.targetInfo.textContent = "Waiting for input";
    elements.upscaleButton.disabled = true;
    return;
  }

  elements.targetInfo.textContent = elements.preset.value === "4k"
    ? "Cloud-enhanced 4K output"
    : `${elements.preset.value} cloud upscale`;
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
  state.resultUrl = "";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
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
      reject(new Error("Could not export final image."));
    }, mimeType, quality);
  });
}
