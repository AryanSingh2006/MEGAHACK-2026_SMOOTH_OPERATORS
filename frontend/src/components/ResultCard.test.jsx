import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ResultCard from "./ResultCard.jsx";

describe("ResultCard", () => {
  it("renders verdict and score from result", () => {
    const result = {
      prediction: "AI Generated",
      confidence: "high",
      final_score: 0.85,
    };
    render(<ResultCard result={result} />);

    expect(screen.getAllByText("AI Generated").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("85%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("renders Real verdict when prediction is Real", () => {
    render(
      <ResultCard
        result={{
          prediction: "Real",
          confidence: "medium",
          final_score: 0.1,
        }}
      />
    );
    expect(screen.getByText("Likely Real")).toBeInTheDocument();
  });

  it("renders Uncertain when prediction is Uncertain", () => {
    render(
      <ResultCard
        result={{
          prediction: "Uncertain",
          confidence: "low",
          final_score: 0.5,
        }}
      />
    );
    expect(screen.getAllByText("Uncertain").length).toBeGreaterThanOrEqual(1);
  });

  it("handles null/empty result without crashing", () => {
    render(<ResultCard result={null} />);
    expect(screen.getByText("Detection Verdict")).toBeInTheDocument();
  });
});
