const ALLOWED_HOSTS = new Set([
  "replicate.delivery",
  "stream.replicate.com"
]);

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const { url } = request.query || {};
  if (!url || typeof url !== "string") {
    return response.status(400).json({ error: "Image URL is required." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return response.status(400).json({ error: "Invalid image URL." });
  }

  if (parsedUrl.protocol !== "https:" || !isAllowedHost(parsedUrl.hostname)) {
    return response.status(400).json({ error: "Only Replicate output URLs are allowed." });
  }

  const upstream = await fetch(parsedUrl.toString());
  if (!upstream.ok) {
    return response.status(upstream.status).json({ error: "Could not fetch enhanced image." });
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const imageBuffer = Buffer.from(await upstream.arrayBuffer());
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "public, max-age=3600");
  return response.status(200).send(imageBuffer);
}

function isAllowedHost(hostname) {
  return ALLOWED_HOSTS.has(hostname) || hostname.endsWith(".replicate.delivery");
}
