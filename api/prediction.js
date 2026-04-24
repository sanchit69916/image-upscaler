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

  const { id } = request.body || {};
  if (!id || typeof id !== "string") {
    return response.status(400).json({ error: "Prediction id is required." });
  }

  const predictionResponse = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const prediction = await predictionResponse.json();

  if (!predictionResponse.ok) {
    return response.status(predictionResponse.status).json({
      error: prediction.detail || prediction.error || "Could not fetch prediction."
    });
  }

  return response.status(200).json({
    id: prediction.id,
    status: prediction.status,
    output: prediction.output,
    error: prediction.error,
    urls: prediction.urls
  });
}
