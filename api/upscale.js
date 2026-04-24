const REAL_ESRGAN_VERSION = "e84596a7e0bd288ffc063ec00d224fa20b70152f1ce4aa14db21bc1f0bff00b6";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return response.status(500).json({
      error: "Missing REPLICATE_API_TOKEN. Add it in Vercel project environment variables."
    });
  }

  const { image, scale = 4, faceEnhance = false } = request.body || {};
  if (!image || typeof image !== "string") {
    return response.status(400).json({ error: "Image data is required." });
  }

  const predictionResponse = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      version: REAL_ESRGAN_VERSION,
      input: {
        image,
        scale: clampScale(scale),
        face_enhance: Boolean(faceEnhance)
      }
    })
  });

  const prediction = await predictionResponse.json();
  if (!predictionResponse.ok) {
    return response.status(predictionResponse.status).json({
      error: prediction.detail || prediction.error || "Could not start enhancement."
    });
  }

  return response.status(200).json({
    id: prediction.id,
    status: prediction.status,
    urls: prediction.urls
  });
}

function clampScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return 4;
  return Math.max(2, Math.min(4, Math.round(value)));
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb"
    }
  }
};
