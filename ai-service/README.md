# AI Service — Deepfake Detection Engine

> FastAPI service that analyzes images for AI-generation using an ensemble of HuggingFace vision models combined with multi-stream forensic analysis.

---

## What this is

The `ai-service/` directory contains a **FastAPI 3.0** Python application that does the real work of Vision Guard. It receives an image URL from the Spring Boot backend, fetches and decodes the image, runs it through multiple ML models and forensic analysis pipelines in parallel, and returns a verdict with a probability score.

It exposes a REST API on `:8000` and is the only component that requires significant compute resources (models run on CPU by default).

---

## Tech Stack

| Tool | Purpose |
|---|---|
| **Python 3.13** | Language & runtime |
| **FastAPI** | Async REST framework |
| **Uvicorn** | ASGI server |
| **HuggingFace Transformers** | Load & run vision classifier models |
| **PyTorch** | ML inference backend |
| **Pillow** | Image decoding, resizing, forensic ops |
| **NumPy** | Array math for forensic scoring |
| **httpx** | Async HTTP client for fetching image URLs |

---

## Detection Pipeline

```
Image URL / data:image URI
         │
         ▼
   Fetch & Decode Image
   (httpx async GET or base64 decode)
         │
         ├──► ML Ensemble  (4 HuggingFace models, majority voting)
         │         siglip · vit · dima · sdxl
         │         Per-model: multi-crop → calibrate (temperature scaling) → vote
         │
         ├──► Frequency Forensics
         │         FFT high-frequency ratio + noise profile
         │
         ├──► Metadata Forensics
         │         EXIF presence, camera tags, AI software tag detection
         │
         ├──► Pixel Forensics
         │         Error Level Analysis (ELA) + color kurtosis
         │
         └──► Decision Engine
                   Weighted ensemble score
                   + forensic boost/dampen
                   + majority vote override
                            │
                            ▼
               { prediction, confidence, final_score,
                 ml_score, forensic_boost, votes, flags,
                 streams, image_info, processing_ms }
```

---

## ML Models

| Key | HuggingFace Model | Weight | Temperature |
|---|---|---|---|
| `siglip` | `prithivMLmods/deepfake-detector-model-v1` | 0.30 | 0.70 |
| `vit` | `prithivMLmods/Deep-Fake-Detector-v2-Model` | 0.20 | 0.75 |
| `dima` | `dima806/deepfake_vs_real_image_detection` | 0.30 | 0.65 |
| `sdxl` | `Organika/sdxl-detector` | 0.20 | 0.72 |

**How models vote:**
1. Each model receives 5 crops of the image (center + 4 corners at 90% size).
2. Raw scores are averaged across crops → temperature-scaled to sharpen probabilities away from 0.5.
3. Each model casts a vote: `fake` (≥ 0.70), `real` (≤ 0.30), or `abstain`.
4. A majority vote override shifts the ensemble score toward the majority consensus.

**Temperature scaling** (`T < 1` sharpens, `T > 1` softens):
```
log_odds_scaled = log(p / (1-p)) / T
calibrated_p = sigmoid(log_odds_scaled)
```

---

## Forensic Streams

### Frequency Forensics
Converts image to grayscale, applies a 2D FFT, and measures the ratio of high-frequency to mid-frequency energy. AI-generated images often have unusually clean or unusually periodic high-frequency patterns. Also checks noise standard deviation (AI images tend to be too smooth).

### Metadata Forensics
Opens the image EXIF data (if present). Real photographs usually contain camera model, lens, and GPS tags. Missing EXIF or EXIF containing known AI software strings (e.g. `stable diffusion`, `midjourney`, `dall-e`, `comfyui`) immediately boosts the fake score to 1.0.

### Pixel Forensics
- **Error Level Analysis (ELA):** Re-compresses the image at JPEG quality 85 and measures difference from the original. AI images show very uniform ELA (low std) because they lack real JPEG compression history.
- **Color Kurtosis:** Measures how non-Gaussian each RGB channel's histogram is. Highly unusual distributions flag potential synthesis artifacts.

---

## Decision Engine

```python
# Weighted score
ensemble = Σ(weight_i × calibrated_score_i) / Σ(weight_i)

# Forensic boost: [-0.20, +0.20]
boost = weighted_forensic_delta  # dampened if forensics oppose ML

# Final score
final = clip(ensemble + boost, 0.0, 1.0)

# Verdict thresholds (normal mode)
final >= 0.55  →  "AI Generated"
final <= 0.40  →  "Real"
otherwise      →  "Uncertain"
```

---

## Detection Modes

| Mode | Models Used | Forensics | Face Analysis | Approx. Speed |
|---|---|---|---|---|
| `fast` | siglip + dima | No | No | ~1–2s |
| `normal` | all 4 | Yes | No | ~4–6s |
| `conservative` | all 4 | Yes | No | ~4–6s (higher threshold: 0.68) |
| `full` | all 4 | Yes | Yes (MTCNN) | ~8–12s |

The backend always calls with the default `normal` mode. You can test other modes directly against the AI service.

---

## API Endpoints

### `POST /detect` — Analyze by URL

```http
POST http://localhost:8000/detect?image_url=https://example.com/photo.jpg&mode=normal
```

### `POST /detect/upload` — Analyze by file upload

```http
POST http://localhost:8000/detect/upload?mode=normal
Content-Type: multipart/form-data
file: <image file>
```

### `GET /health` — Health check

```json
{
  "status": "ok",
  "version": "3.0.0",
  "models_loaded": ["siglip", "vit", "dima", "sdxl"],
  "face_detection": false,
  "modes": ["fast", "normal", "conservative", "full"],
  "thresholds": { "fake": 0.55, "real": 0.40, "conservative": 0.68 }
}
```

### Full Response Shape

```json
{
  "prediction": "AI Generated",
  "confidence": "high",
  "final_score": 0.872,
  "ml_score": 0.851,
  "forensic_boost": 0.021,
  "confidence_interval": { "low": 0.78, "high": 0.96 },
  "votes": {
    "per_model": {
      "siglip": { "raw": 0.91, "cal": 0.94, "vote": "fake" },
      "dima":   { "raw": 0.82, "cal": 0.87, "vote": "fake" }
    },
    "fake_voters": ["siglip", "dima"],
    "real_voters": [],
    "abstained": ["vit", "sdxl"]
  },
  "flags": ["no_exif", "low_noise_profile"],
  "streams": {
    "frequency_forensics": { "score": 0.68, "flags": ["elevated_hf_spectrum"], "details": {} },
    "metadata_forensics":  { "score": 0.62, "flags": ["no_exif"], "details": {} },
    "pixel_forensics":     { "score": 0.54, "flags": [], "details": { "ela_std": 2.1 } },
    "face_analysis":       { "score": null, "flags": ["skipped"], "details": {} }
  },
  "image_info": {
    "width": 1024, "height": 1024,
    "is_png": false, "has_faces": false,
    "face_count": 0, "quality": 0.87,
    "photo_like": true, "sha256": "a1b2c3d4e5f6..."
  },
  "mode": "normal",
  "processing_ms": 4312.5
}
```

---

## Running

```bash
cd ai-service

# Create virtual environment (strongly recommended)
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r Requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

> **First run:** Downloads ~4 GB of HuggingFace model weights. They are cached in `~/.cache/huggingface/` automatically. Subsequent startups are fast.

Interactive API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Optional: Face Detection (`full` mode)

Uncomment in `Requirements.txt` and reinstall:
```
facenet-pytorch==2.6.0
```
Requires `torch` to be installed first. Once installed, use `mode=full` to enable face-region analysis.

---

## Calibration (Advanced)

`Calibrate.py` runs Platt scaling calibration against your own labeled dataset to update the temperature/calibration parameters per model.

```bash
pip install scikit-learn
python Calibrate.py --real_dir /path/to/real_images --fake_dir /path/to/ai_images
```

Outputs updated parameters and saves `calibration_results.json`.

---

## Tests

```bash
pytest test_main.py -v
```

---

## File Overview

```
ai-service/
├── main.py            # Full FastAPI app — models, forensics, pipeline, endpoints
├── Calibrate.py       # Optional Platt scaling calibration script
├── test_main.py       # Pytest test suite
└── Requirements.txt   # Python dependencies
```
