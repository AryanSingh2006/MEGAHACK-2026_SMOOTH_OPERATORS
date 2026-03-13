import React, { useState, useEffect } from "react";
import Layout from "./components/Layout.jsx";
import ScreenOne from "./pages/ScreenOne.jsx";
import ScreenTwo from "./pages/ScreenTwo.jsx";
import ScreenThree from "./pages/ScreenThree.jsx";
import ScreenSnip from "./pages/ScreenSnip.jsx";

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

// Check if we're running as a Chrome Extension
function isChromeExtension() {
  return (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.id &&
    typeof chrome.tabs !== "undefined" &&
    typeof chrome.scripting !== "undefined"
  );
}

function App() {
  const [currentScreen, setCurrentScreen] = useState(1);
  const [imageSrc, setImageSrc] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageSourceType, setImageSourceType] = useState("upload"); // 'upload' | 'url' | 'snip'
  const [analysisResult, setAnalysisResult] = useState(initialAnalysis);
  const [theme, setTheme] = useState(getInitialTheme);
  const [clickImageStatus, setClickImageStatus] = useState(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // silently fail if localStorage unavailable
    }
  }, [theme]);

  // On popup open, check if there's a pending clicked image from the content script
  useEffect(() => {
    if (!isChromeExtension()) return;

    chrome.storage.local.get("pendingImage", (result) => {
      if (result.pendingImage && result.pendingImage.url) {
        const { url } = result.pendingImage;
        // Clear the pending image immediately so it won't show again next time
        chrome.runtime.sendMessage({ type: "CLEAR_PENDING_IMAGE" });

        // Navigate to Screen Two with the image
        setImageUrl(url);
        setImageSrc(url);
        setImageSourceType("url");
        setCurrentScreen(2);
      }
    });
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleUploadImage = (dataUrl) => {
    setImageSrc(dataUrl);
    setImageUrl(null);
    setImageSourceType("upload");
    setCurrentScreen(2);
  };

  // Snip Screen — capture the visible tab then open the snip UI
  const handleSnipScreen = async () => {
    if (isChromeExtension()) {
      try {
        // captureVisibleTab captures the tab behind the popup
        chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error("Capture error:", chrome.runtime.lastError);
            setScreenshotDataUrl(null);
          } else {
            setScreenshotDataUrl(dataUrl);
          }
          setCurrentScreen(4);
        });
      } catch (err) {
        console.error("Snip error:", err);
        setScreenshotDataUrl(null);
        setCurrentScreen(4);
      }
    } else {
      // Dev mode — open snip screen without a real screenshot
      setScreenshotDataUrl(null);
      setCurrentScreen(4);
    }
  };

  // Called when user confirms the snip selection crop
  const handleSnipConfirm = (croppedDataUrl) => {
    setImageSrc(croppedDataUrl);
    setImageUrl(null);
    setImageSourceType("snip");
    setCurrentScreen(2);
  };

  const handleClickImage = async () => {
    if (isChromeExtension()) {
      try {
        setClickImageStatus("waiting");

        // Get the active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (!tab || !tab.id) {
          setClickImageStatus("error");
          return;
        }

        // Inject the content script into the active tab
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-script.js"],
        });

        // Close the popup — user needs to interact with the page
        // When user clicks an image, background.js stores the URL
        // Next time the popup opens, useEffect above picks it up
        window.close();
      } catch (err) {
        console.error("Click image error:", err);
        setClickImageStatus("error");
      }
    } else {
      // Dev mode fallback — show URL input panel
      setClickImageStatus("fallback");
    }
  };

  const handleUrlSubmit = (url) => {
    if (url && url.trim()) {
      setImageUrl(url.trim());
      setImageSrc(url.trim());
      setImageSourceType("url");
      setClickImageStatus(null);
      setCurrentScreen(2);
    }
  };

  const handleReset = () => {
    setImageSrc(null);
    setImageUrl(null);
    setImageSourceType("upload");
    setAnalysisResult(initialAnalysis);
    setClickImageStatus(null);
    setScreenshotDataUrl(null);
    setCurrentScreen(1);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 1:
        return (
          <ScreenOne
            onUploadImage={handleUploadImage}
            onSnipScreen={handleSnipScreen}
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
            sourceType={imageSourceType}
            onBack={() => setCurrentScreen(1)}
            onAnalyze={(result) => {
              setAnalysisResult(result);
              setCurrentScreen(3);
            }}
          />
        );
      case 4:
        return (
          <ScreenSnip
            screenshotDataUrl={screenshotDataUrl}
            onSnip={handleSnipConfirm}
            onCancel={() => setCurrentScreen(1)}
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
      <React.Fragment key={currentScreen}>{renderScreen()}</React.Fragment>
    </Layout>
  );
}

export default App;
