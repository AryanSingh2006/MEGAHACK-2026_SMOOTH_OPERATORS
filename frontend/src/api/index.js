const BACKEND_URL = "http://localhost:8080";

/**
 * Analyze an image by URL — calls the Spring Boot backend.
 * POST /detect  body: { imageUrl: "..." }
 * Response:     { prediction, confidence, final_score }
 */
export async function analyzeImageByUrl(url) {
  // Validate that it's a standard URL, not base64 or a local file
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    throw new Error("Only valid HTTP/HTTPS URLs are supported.");
  }

  const response = await fetch("http://localhost:8080/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: url
    })
  });

  if (!response.ok) {
    if (response.status === 500) {
      throw new Error("Detection service is unavailable. Please ensure the AI service is running.");
    }
    throw new Error(`Analysis failed (${response.status}). Please try again.`);
  }

  const data = await response.json();
  // data = { prediction, confidence, final_score }
  return data;
}

/**
 * Placeholder for future file-upload analysis.
 * Will use multipart/form-data to POST the image file to the backend.
 */
export async function analyzeImageByFile(/* file */) {
  throw new Error("File upload analysis is not implemented yet.");
}
