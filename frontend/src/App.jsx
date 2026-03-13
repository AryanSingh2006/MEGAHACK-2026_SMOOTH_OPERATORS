import React, { useState } from "react";
import Layout from "./components/Layout.jsx";
import ScreenOne from "./pages/ScreenOne.jsx";
import ScreenTwo from "./pages/ScreenTwo.jsx";
import ScreenThree from "./pages/ScreenThree.jsx";

const initialAnalysis = {
  aiPercent: null,
  realPercent: null,
  description: "",
};

function App() {
  const [currentScreen, setCurrentScreen] = useState(1);
  const [imageSrc, setImageSrc] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(initialAnalysis);

  const goToScreen = (screenNumber) => {
    setCurrentScreen(screenNumber);
  };

  const handleSelectImage = (sourceLabel) => {
    // For now, just mock an image URL based on the source type
    setImageSrc(`mock-image-from-${sourceLabel.toLowerCase().replace(" ", "-")}`);
    setCurrentScreen(2);
  };

  const handleReset = () => {
    setImageSrc(null);
    setAnalysisResult(initialAnalysis);
    setCurrentScreen(1);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 1:
        return (
          <ScreenOne
            onUploadImage={() => handleSelectImage("Upload Image")}
            onSnipScreen={() => handleSelectImage("Snip Screen")}
            onClickImage={() => handleSelectImage("Click Image")}
          />
        );
      case 2:
        return (
          <ScreenTwo
            imageSrc={imageSrc}
            onBack={() => setCurrentScreen(1)}
            onAnalyze={(result) => {
              setAnalysisResult(result);
              setCurrentScreen(3);
            }}
          />
        );
      case 3:
        return (
          <ScreenThree
            analysisResult={analysisResult}
            onStartOver={handleReset}
          />
        );
      default:
        return null;
    }
  };

  return <Layout>{renderScreen()}</Layout>;
}

export default App;

