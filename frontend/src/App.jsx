import React, { useState, useEffect } from "react";
import Layout from "./components/Layout.jsx";
import ScreenOne from "./pages/ScreenOne.jsx";
import ScreenTwo from "./pages/ScreenTwo.jsx";
import ScreenThree from "./pages/ScreenThree.jsx";

const initialAnalysis = {
  aiPercent: null,
  realPercent: null,
  description: "",
};

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage may be unavailable in extension context
  }
  return "dark";
}

function App() {
  const [currentScreen, setCurrentScreen] = useState(1);
  const [imageSrc, setImageSrc] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(initialAnalysis);
  const [theme, setTheme] = useState(getInitialTheme);
  const [clickImageStatus, setClickImageStatus] = useState(null); // 'waiting' | 'success' | 'error' | null

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // silently fail if localStorage unavailable
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleUploadImage = (dataUrl) => {
    setImageSrc(dataUrl);
    setImageUrl(null);
    setCurrentScreen(2);
  };

  const handleClickImage = async () => {
    // Use Chrome Extension API to inject content script into the active tab
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.scripting) {
      try {
        setClickImageStatus("waiting");

        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.id) {
          setClickImageStatus("error");
          return;
        }

        // Inject the content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-script.js"],
        });

        // Listen for the message from the content script
        const messageListener = (message) => {
          if (message.type === "IMAGE_CLICKED") {
            chrome.runtime.onMessage.removeListener(messageListener);
            setImageUrl(message.url);
            setImageSrc(message.url); // Use the URL as image source for preview
            setClickImageStatus("success");
            setCurrentScreen(2);
          } else if (message.type === "IMAGE_PICK_CANCELLED") {
            chrome.runtime.onMessage.removeListener(messageListener);
            setClickImageStatus(null);
          }
        };

        chrome.runtime.onMessage.addListener(messageListener);

        // Close the popup (popup will close, but listener stays in background)
        // The popup will re-open when the image is clicked, or we can use a different UX.
        // For now, minimize the popup window so the user can interact with the page
        window.close(); // Close popup so user can interact with the page
      } catch (err) {
        console.error("Click image error:", err);
        setClickImageStatus("error");
      }
    } else {
      // Fallback for development (non-extension environment)
      // Prompt user to enter an image URL manually
      setClickImageStatus("fallback");
    }
  };

  const handleUrlSubmit = (url) => {
    if (url && url.trim()) {
      setImageUrl(url.trim());
      setImageSrc(url.trim());
      setClickImageStatus(null);
      setCurrentScreen(2);
    }
  };

  const handleSelectImage = (sourceLabel) => {
    // Mock for Snip Screen (to be replaced with real extension APIs)
    setImageSrc(`mock-image-from-${sourceLabel.toLowerCase().replace(" ", "-")}`);
    setImageUrl(null);
    setCurrentScreen(2);
  };

  const handleReset = () => {
    setImageSrc(null);
    setImageUrl(null);
    setAnalysisResult(initialAnalysis);
    setClickImageStatus(null);
    setCurrentScreen(1);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 1:
        return (
          <ScreenOne
            onUploadImage={handleUploadImage}
            onSnipScreen={() => handleSelectImage("Snip Screen")}
            onClickImage={handleClickImage}
            theme={theme}
            onToggleTheme={toggleTheme}
            clickImageStatus={clickImageStatus}
            onUrlSubmit={handleUrlSubmit}
            onCancelClickImage={() => setClickImageStatus(null)}
          />
        );
      case 2:
        return (
          <ScreenTwo
            imageSrc={imageSrc}
            imageUrl={imageUrl}
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

  return (
    <Layout theme={theme} onToggleTheme={toggleTheme}>
      <React.Fragment key={currentScreen}>
        {renderScreen()}
      </React.Fragment>
    </Layout>
  );
}

export default App;
