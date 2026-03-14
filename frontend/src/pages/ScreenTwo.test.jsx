import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ScreenTwo from "./ScreenTwo.jsx";

// Mock the API module
vi.mock("../api/index.js", () => ({
  analyzeImageByUrl: vi.fn(),
}));

import { analyzeImageByUrl } from "../api/index.js";

describe("ScreenTwo — URL image check flow", () => {
  const defaultProps = {
    imageSrc: "https://example.com/photo.jpg",
    imageUrl: "https://example.com/photo.jpg",
    sourceType: "url",
    onBack: vi.fn(),
    onAnalyze: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  it("renders the preview header for URL source", () => {
    render(<ScreenTwo {...defaultProps} />);
    expect(screen.getByText("Preview & Analyze")).toBeInTheDocument();
    expect(screen.getByText(/Extracted from webpage/)).toBeInTheDocument();
  });

  it("renders the preview header for upload source", () => {
    render(<ScreenTwo {...defaultProps} sourceType="upload" />);
    expect(screen.getByText(/Uploaded from device/)).toBeInTheDocument();
  });

  it("renders the preview header for snip source", () => {
    render(<ScreenTwo {...defaultProps} sourceType="snip" />);
    expect(screen.getByText(/Captured via screen snip/)).toBeInTheDocument();
  });

  it("displays the image URL when provided", () => {
    render(<ScreenTwo {...defaultProps} />);
    expect(screen.getByText("Image URL")).toBeInTheDocument();
    expect(screen.getByText(defaultProps.imageUrl)).toBeInTheDocument();
  });

  it("does not display URL section when imageUrl is null", () => {
    render(<ScreenTwo {...defaultProps} imageUrl={null} />);
    expect(screen.queryByText("Image URL")).not.toBeInTheDocument();
  });

  it("renders both Back and Analyze buttons", () => {
    render(<ScreenTwo {...defaultProps} />);
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("disables Analyze button when imageSrc is null", () => {
    render(<ScreenTwo {...defaultProps} imageSrc={null} />);
    const analyzeBtn = screen.getByText("Analyze").closest("button");
    expect(analyzeBtn).toBeDisabled();
  });

  // ── URL analysis flow ─────────────────────────────────────────────────

  it("calls analyzeImageByUrl when Analyze is clicked for URL source", async () => {
    const mockResult = {
      prediction: "AI Generated",
      confidence: "high",
      final_score: 0.85,
    };
    analyzeImageByUrl.mockResolvedValueOnce(mockResult);

    render(<ScreenTwo {...defaultProps} />);
    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(analyzeImageByUrl).toHaveBeenCalledWith(defaultProps.imageUrl);
      expect(defaultProps.onAnalyze).toHaveBeenCalledWith(mockResult);
    });
  });

  it("shows spinner while analyzing", async () => {
    // Make the API call hang
    analyzeImageByUrl.mockReturnValueOnce(new Promise(() => {}));

    render(<ScreenTwo {...defaultProps} />);
    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(screen.getByText("Analyzing…")).toBeInTheDocument();
      expect(screen.getByText("Sending to detection service")).toBeInTheDocument();
    });
  });

  it("shows error message when analysis fails", async () => {
    analyzeImageByUrl.mockRejectedValueOnce(new Error("Detection service is unavailable"));

    render(<ScreenTwo {...defaultProps} />);
    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(
        screen.getByText("Detection service is unavailable")
      ).toBeInTheDocument();
    });
  });

  it("shows fallback error for file uploads (not yet implemented)", async () => {
    render(
      <ScreenTwo
        {...defaultProps}
        sourceType="upload"
        imageUrl={null}
      />
    );
    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(
        screen.getByText(/File upload analysis coming soon/)
      ).toBeInTheDocument();
    });
  });

  // ── Back button ───────────────────────────────────────────────────────

  it("calls onBack when Back button is clicked", () => {
    render(<ScreenTwo {...defaultProps} />);
    fireEvent.click(screen.getByText("Back"));
    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it("disables Back button while analyzing", async () => {
    analyzeImageByUrl.mockReturnValueOnce(new Promise(() => {}));

    render(<ScreenTwo {...defaultProps} />);
    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      const backBtn = screen.getByText("Back").closest("button");
      expect(backBtn).toBeDisabled();
    });
  });
});
