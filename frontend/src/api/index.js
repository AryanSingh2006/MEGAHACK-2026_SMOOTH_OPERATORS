export async function analyzeImageMock(imageSrc) {
  // Simple mock: alternate percentages based on imageSrc string length
  const base = (imageSrc && imageSrc.length) || 1;
  const aiPercent = 30 + (base % 40); // 30–69
  const realPercent = 100 - aiPercent;

  const description =
    "This is a mock analysis result. Replace this with a real AI service when your backend is ready.";

  // Simulate small network delay
  await new Promise((resolve) => setTimeout(resolve, 600));

  return {
    aiPercent,
    realPercent,
    description,
  };
}

