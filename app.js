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
      elements.apiState.textContent = "Local Real-ESRGAN server connected.";
      elements.upscaleButton.disabled = !state.file;
      return;
    }
  } catch {}
  elements.apiState.textContent = "Start the local server to enable enhancement.";
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
  setStatus("Uploading image to the local enhancer...");

  try {
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

function syncUi() {
  updateCompareView();
  elements.pipelineInfo.textContent = "Local Real-ESRGAN x4";
  elements.framingInfo.textContent = getFitLabel(elements.fitMode.value);
  elements.exportInfo.textContent = getFormatLabel(elements.outputFormat.value);
  elements.realismStrengthValue.textContent = `${elements.realismStrength.value}%`;
  elements.detailInfo.textContent = elements.faceEnhance.checked
    ? "Portrait restore enabled"
    : `${elements.realismStrength.value}% detail pass`;

  if (!state.file) {
    elements.sourceInfo.textContent = "No image loaded";
    elements.targetInfo.textContent = "Waiting for input";
    elements.upscaleButton.disabled = true;
    return;
  }

  elements.targetInfo.textContent = elements.preset.value === "4k"
    ? "3840 x 2160 local output"
    : `${elements.preset.value} local upscale`;
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
