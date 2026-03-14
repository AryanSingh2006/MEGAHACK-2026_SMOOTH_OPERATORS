import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeImageByUrl, analyzeImageByFile } from "./index.js";

describe("analyzeImageByUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────

  it("calls backend /detect with imageUrl in body and returns result", async () => {
    const url = "https://example.com/photo.jpg";
    const mockResult = {
      prediction: "Real",
      confidence: "high",
      final_score: 0.2,
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    const result = await analyzeImageByUrl(url);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/detect",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      })
    );
    expect(result).toEqual(mockResult);
  });

  it("returns AI Generated result correctly", async () => {
    const mockResult = {
      prediction: "AI Generated",
      confidence: "medium",
      final_score: 0.72,
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    const result = await analyzeImageByUrl("https://example.com/fake.jpg");
    expect(result.prediction).toBe("AI Generated");
    expect(result.final_score).toBe(0.72);
  });

  it("returns Uncertain result correctly", async () => {
    const mockResult = {
      prediction: "Uncertain",
      confidence: "low",
      final_score: 0.48,
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    const result = await analyzeImageByUrl("https://example.com/ambiguous.jpg");
    expect(result.prediction).toBe("Uncertain");
    expect(result.confidence).toBe("low");
  });

  it("sends URL with query parameters unchanged", async () => {
    const url = "https://img.example.com/photo.jpg?w=800&q=90";
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ prediction: "Real" }),
    });

    await analyzeImageByUrl(url);

    const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sentBody.imageUrl).toBe(url);
  });

  // ── Error handling ────────────────────────────────────────────────────

  it("throws when response is not ok (500)", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(analyzeImageByUrl("https://bad.com/img.jpg")).rejects.toThrow(
      "Detection service is unavailable"
    );
  });

  it("throws on other error status (400)", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 400 });

    await expect(analyzeImageByUrl("https://x.com/a.jpg")).rejects.toThrow(
      /Analysis failed \(400\)/
    );
  });

  it("throws on 404 error status", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(analyzeImageByUrl("https://x.com/missing.jpg")).rejects.toThrow(
      /Analysis failed \(404\)/
    );
  });

  it("throws when fetch itself rejects (network error)", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      analyzeImageByUrl("https://example.com/img.jpg")
    ).rejects.toThrow("Failed to fetch");
  });
});

describe("analyzeImageByFile", () => {
  it("throws that file upload is not implemented", async () => {
    await expect(analyzeImageByFile()).rejects.toThrow(/not implemented/);
  });
});
