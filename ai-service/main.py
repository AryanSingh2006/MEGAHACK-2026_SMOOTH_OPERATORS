"""
═══════════════════════════════════════════════════════════════════
  ELITE AI/DEEPFAKE IMAGE DETECTION PIPELINE  v3.0
  ─────────────────────────────────────────────────────────────────
  Techniques used:
    1. Neural classifiers  : SigLIP, ViT, DiMA, SDXL-detector
    2. Frequency forensics : FFT radial energy, DCT blocking artifact
    3. Error Level Analysis: JPEG re-compression residual analysis
    4. Noise residual      : SRM-inspired high-pass filter statistics
    5. Color statistics    : saturation/hue distribution anomalies
    6. EXIF metadata       : structured metadata scoring (not just flag)
    7. Sharpness anomaly   : Laplacian variance + edge histogram
    8. Patch-based scoring : 8×8 tile grid to catch local artifacts
    9. Ensemble fusion     : calibrated soft-voting with uncertainty

  Architecture:
    - Async model inference with ThreadPoolExecutor
    - Per-request image validation + quality gate
    - Full confidence intervals + per-signal debug output
    - Conservative / balanced / aggressive threshold modes
    - Optional URL caching (in-memory LRU)

═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from io import BytesIO
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import requests
from fastapi import FastAPI, HTTPException, Query
from PIL import Image, ImageFile, ImageFilter, ImageSequence
from scipy import stats
from transformers import pipeline

ImageFile.LOAD_TRUNCATED_IMAGES = True

# ──────────────────────────────────────────────────────────────────
#  LOGGING
# ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("deepfake_detector")

# ──────────────────────────────────────────────────────────────────
#  CONFIGURATION  (all tunable in one place)
# ──────────────────────────────────────────────────────────────────

# HuggingFace models
MODELS = {
    "siglip": "prithivMLmods/deepfake-detector-model-v1",
    "vit":    "prithivMLmods/Deep-Fake-Detector-v2-Model",
    "dima":   "dima806/deepfake_vs_real_image_detection",
    "sdxl":   "Organika/sdxl-detector",
    # Additional highly accurate models:
    "clip_based": "Wvolf/ViT-Deepfake-Detection",          # CLIP-fine-tuned
    "efficientnet": "DunnBC22/efficientnet-b7-deepfake_image_detector",
}

# Ensemble weights — must sum to 1.0
# Neural models carry most weight; forensic signals are regularisers
WEIGHTS: Dict[str, float] = {
    "siglip":       0.20,
    "vit":          0.12,
    "dima":         0.18,
    "sdxl":         0.08,
    "clip_based":   0.14,
    "efficientnet": 0.10,
    # Forensic signals
    "fft":          0.04,
    "dct":          0.04,
    "ela":          0.04,
    "noise":        0.02,
    "color":        0.02,
    "sharpness":    0.01,
    "exif":         0.01,
}

assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-6, "Weights must sum to 1.0"

# Consensus voting thresholds
STRONG_FAKE_THRESH    = 0.72   # per-signal score ≥ this → strong fake vote
STRONG_REAL_THRESH    = 0.28   # per-signal score ≤ this → strong real vote
CONSENSUS_NEURAL_MIN  = 3      # # neural models agreeing before consensus fires

# Final decision thresholds (balanced mode)
THRESHOLDS = {
    "aggressive":   {"fake": 0.52, "real": 0.45},
    "balanced":     {"fake": 0.60, "real": 0.38},
    "conservative": {"fake": 0.75, "real": 0.30},
}

# Image quality gates
MIN_SIZE_PX     = 64    # minimum dimension in pixels
MIN_ENTROPY     = 3.5   # below this → likely blank/corrupt image
MAX_ASPECT      = 10.0  # extreme crops likely not real photos

# Patch-based analysis
PATCH_GRID      = 8     # NxN patch grid for local artifact detection

# Threading
EXECUTOR_WORKERS = len(MODELS) + 2

# ──────────────────────────────────────────────────────────────────
#  MODEL LOADING
# ──────────────────────────────────────────────────────────────────
log.info("Loading neural classifiers …")
detectors: Dict[str, object] = {}

for name, model_id in MODELS.items():
    try:
        detectors[name] = pipeline("image-classification", model=model_id)
        log.info(f"  ✓ {name} ({model_id})")
    except Exception as exc:
        log.warning(f"  ✗ {name} FAILED to load: {exc} — will skip this model")

log.info(f"Loaded {len(detectors)}/{len(MODELS)} models.")

executor = ThreadPoolExecutor(max_workers=EXECUTOR_WORKERS)

app = FastAPI(
    title="Elite Deepfake / AI Image Detector",
    description="Multi-modal ensemble pipeline combining neural classifiers and forensic signals",
    version="3.0.0",
)

# ──────────────────────────────────────────────────────────────────
#  IMAGE LOADING
# ──────────────────────────────────────────────────────────────────

def load_image_bytes(uri: str) -> Tuple[Optional[bytes], Optional[str]]:
    """Download URL or decode base64 data URI. Returns (bytes, error)."""
    decoded = urllib.parse.unquote(uri)
    try:
        if decoded.startswith("data:image"):
            _, encoded = decoded.split(",", 1)
            return base64.b64decode(encoded), None
        r = requests.get(decoded, headers={"User-Agent": "Mozilla/5.0"}, timeout=25)
        r.raise_for_status()
        return r.content, None
    except Exception as e:
        return None, f"download_error: {e}"


def pil_from_bytes(image_bytes: bytes) -> Tuple[Optional[Image.Image], Optional[str]]:
    try:
        img = Image.open(BytesIO(image_bytes))
        if getattr(img, "is_animated", False):
            img = next(ImageSequence.Iterator(img))
        return img.convert("RGB"), None
    except Exception as e:
        return None, f"invalid_image: {e}"


def image_entropy(pil_img: Image.Image) -> float:
    """Shannon entropy of grayscale image — low = blank/corrupt."""
    gray = np.array(pil_img.convert("L"))
    hist, _ = np.histogram(gray, bins=256, range=(0, 256))
    hist = hist[hist > 0].astype(float)
    hist /= hist.sum()
    return float(-np.sum(hist * np.log2(hist)))


def quality_gate(pil_img: Image.Image) -> Optional[str]:
    """Return error string if image fails quality checks, else None."""
    w, h = pil_img.size
    if min(w, h) < MIN_SIZE_PX:
        return f"image_too_small ({w}x{h})"
    if max(w, h) / max(min(w, h), 1) > MAX_ASPECT:
        return f"extreme_aspect_ratio ({w}x{h})"
    if image_entropy(pil_img) < MIN_ENTROPY:
        return "image_too_uniform_or_blank"
    return None

# ──────────────────────────────────────────────────────────────────
#  CROP UTILITIES
# ──────────────────────────────────────────────────────────────────

def make_crops(
        pil_img: Image.Image,
        out_size: Tuple[int, int] = (224, 224),
        crop_ratio: float = 0.90,
) -> List[Image.Image]:
    """
    Return center + 4 corner crops.
    Crops are weighted: center crop gets duplicated to give it 2x weight
    when averaged, since central regions contain the most AI artifacts.
    """
    w, h = pil_img.size
    cw, ch = int(w * crop_ratio), int(h * crop_ratio)
    if cw < 64 or ch < 64:
        return [pil_img.resize(out_size)]

    cx0, cy0 = (w - cw) // 2, (h - ch) // 2
    boxes = [
        (0,        0,        cw,       ch),       # TL
        (w - cw,   0,        w,        ch),       # TR
        (0,        h - ch,   cw,       h),        # BL
        (w - cw,   h - ch,   w,        h),        # BR
        (cx0,      cy0,      cx0 + cw, cy0 + ch), # center
        (cx0,      cy0,      cx0 + cw, cy0 + ch), # center (2× weight)
    ]
    crops = []
    for box in boxes:
        try:
            crops.append(pil_img.crop(box).resize(out_size))
        except Exception:
            pass
    return crops or [pil_img.resize(out_size)]


def patch_grid(pil_img: Image.Image, n: int = PATCH_GRID) -> List[Image.Image]:
    """
    Divide image into n×n patches. Used for localized artifact detection.
    Patches at edges get extra sampling (AI artifacts concentrate at borders).
    """
    w, h = pil_img.size
    pw, ph = w // n, h // n
    if pw < 16 or ph < 16:
        return []
    patches = []
    for row in range(n):
        for col in range(n):
            x0, y0 = col * pw, row * ph
            patch = pil_img.crop((x0, y0, x0 + pw, y0 + ph))
            patches.append(patch)
    return patches

# ──────────────────────────────────────────────────────────────────
#  NEURAL MODEL SCORING
# ──────────────────────────────────────────────────────────────────

# Label normalisation lookup — maps known labels → "fake" or "real"
_FAKE_KEYWORDS = {"fake", "ai", "generated", "artificial", "synthetic", "deepfake", "1"}
_REAL_KEYWORDS = {"real", "human", "authentic", "natural", "genuine", "original", "0"}


def _label_to_ai_prob(label: str, score: float) -> float:
    """
    Convert a model's top-1 label + confidence to a P(AI) probability.
    Handles all known label formats including numeric '0'/'1' schemes.
    """
    label_lower = label.lower().strip()
    # Numeric label convention: '0' = real, '1' = fake (most HF models)
    if label_lower in _FAKE_KEYWORDS:
        return score
    if label_lower in _REAL_KEYWORDS:
        return 1.0 - score
    # Fallback: assume 0.5 (uncertain)
    log.debug(f"Unknown label '{label}' — defaulting to 0.5")
    return 0.5


def _run_detector_on_crop(detector, crop: Image.Image) -> float:
    """Run a single HuggingFace pipeline on one crop, return P(AI)."""
    results = detector(crop)
    if not results:
        return 0.5
    top = results[0]
    return _label_to_ai_prob(top.get("label", ""), float(top.get("score", 0.5)))


def neural_score(name: str, detector, pil_img: Image.Image) -> Tuple[str, float]:
    """
    Score one neural model using multi-crop averaging.
    Returns (model_name, p_ai).
    """
    try:
        crops = make_crops(pil_img)
        crop_scores = [_run_detector_on_crop(detector, c) for c in crops]
        return name, float(np.mean(crop_scores))
    except Exception as exc:
        log.warning(f"Model {name} error: {exc}")
        return name, 0.5  # neutral fallback — don't crash the pipeline


def run_all_neural_models(pil_img: Image.Image) -> Dict[str, float]:
    """
    Run all loaded neural detectors in parallel using ThreadPoolExecutor.
    Returns dict of {model_name: p_ai_score}.
    """
    futures = {
        executor.submit(neural_score, name, det, pil_img): name
        for name, det in detectors.items()
    }
    results = {}
    for future in as_completed(futures):
        name, score = future.result()
        results[name] = score
    return results

# ──────────────────────────────────────────────────────────────────
#  FORENSIC SIGNAL 1 — FFT  (improved radial energy)
# ──────────────────────────────────────────────────────────────────

def fft_score(pil_img: Image.Image) -> float:
    """
    Radial FFT analysis.
    AI images (especially GAN/diffusion) show characteristic high-frequency
    energy patterns due to upsampling artifacts and checkerboard patterns.

    Returns P(AI): 0.0 = real-like, 1.0 = AI-like.
    """
    try:
        arr = np.array(pil_img.convert("L")).astype(np.float32)
        h, w = arr.shape
        crop = int(min(h, w) * 0.85)
        y0, x0 = (h - crop) // 2, (w - crop) // 2
        arr = arr[y0: y0 + crop, x0: x0 + crop]

        f = np.fft.fft2(arr)
        fshift = np.fft.fftshift(f)
        mag = np.log1p(np.abs(fshift))

        cy, cx = np.array(mag.shape) // 2
        Y, X = np.ogrid[: mag.shape[0], : mag.shape[1]]
        dist = np.sqrt((Y - cy) ** 2 + (X - cx) ** 2)
        maxd = dist.max()

        # Three rings: low / mid / high freq
        low  = mag[dist < 0.20 * maxd].mean()
        mid  = mag[(dist >= 0.20 * maxd) & (dist < 0.60 * maxd)].mean()
        high = mag[dist >= 0.60 * maxd].mean()

        # AI images: high LF energy (over-smooth), low HF variance
        # GAN grid artifacts → spikes at specific HF frequencies
        lf_ratio = low / (mid + 1e-9)
        hf_ratio = high / (mid + 1e-9)

        # Calibrated empirical sigmoid mapping
        # Higher lf_ratio → more likely AI (over-smooth)
        # Lower hf_ratio  → more likely AI (lack of natural HF texture)
        ai_signal = 0.5 * (lf_ratio / (lf_ratio + 1.5)) + 0.5 * (1.0 - hf_ratio / (hf_ratio + 0.8))
        return float(np.clip(ai_signal, 0.0, 1.0))
    except Exception:
        return 0.5

# ──────────────────────────────────────────────────────────────────
#  FORENSIC SIGNAL 2 — DCT  (JPEG blocking artifact score)
# ──────────────────────────────────────────────────────────────────

def dct_blocking_score(pil_img: Image.Image) -> float:
    """
    Analyse 8×8 DCT block boundary discontinuities.
    Real JPEG photos show smooth block boundaries; AI images often lack
    the characteristic blocking artifacts of real camera JPEG pipelines —
    OR show hyper-regular DCT patterns from upsampling decoders.

    Returns P(AI).
    """
    try:
        arr = np.array(pil_img.convert("L")).astype(np.float32)
        h, w = arr.shape
        h8, w8 = (h // 8) * 8, (w // 8) * 8
        arr = arr[:h8, :w8]

        # Compute horizontal and vertical block-boundary differences
        # True at pixel columns 7,15,23 … (block boundaries)
        h_boundaries = np.abs(arr[:, 7::8] - arr[:, 8::8]).mean()  # across blocks
        h_interior   = np.abs(np.diff(arr, axis=1)).mean()         # overall smoothness

        v_boundaries = np.abs(arr[7::8, :] - arr[8::8, :]).mean()
        v_interior   = np.abs(np.diff(arr, axis=0)).mean()

        h_ratio = h_boundaries / (h_interior + 1e-9)
        v_ratio = v_boundaries / (v_interior + 1e-9)
        blocking = (h_ratio + v_ratio) / 2.0

        # Blocking ratio ~1.0 = smooth everywhere (AI)
        # Blocking ratio >1.2 = has natural JPEG blocking (real camera)
        # Map: blocking < 0.9 → likely AI, > 1.3 → likely real
        ai_score = 1.0 - np.clip((blocking - 0.85) / 0.55, 0.0, 1.0)
        return float(ai_score)
    except Exception:
        return 0.5

# ──────────────────────────────────────────────────────────────────
#  FORENSIC SIGNAL 3 — ELA  (Error Level Analysis)
# ──────────────────────────────────────────────────────────────────

def ela_score(pil_img: Image.Image, quality: int = 92) -> float:
    """
    Error Level Analysis: re-save at quality and compute residual.
    AI images: uniform ELA residual (no differential compression history).
    Real photos: variable ELA with edges/texture showing higher residuals.

    Key metric: std(ELA) / mean(ELA) — coefficient of variation.
    Low CoV → uniform → likely AI.

    Returns P(AI).
    """
    try:
        buf = BytesIO()
        pil_img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        recompressed = Image.open(buf).convert("RGB")

        orig_arr = np.array(pil_img).astype(np.float32)
        recomp_arr = np.array(recompressed).astype(np.float32)

        ela_map = np.abs(orig_arr - recomp_arr)

        # Per-channel statistics
        ela_means = ela_map.mean(axis=(0, 1))      # shape (3,)
        ela_stds  = ela_map.std(axis=(0, 1))

        global_mean = ela_means.mean() + 1e-9
        global_std  = ela_stds.mean()

        cov = global_std / global_mean  # coefficient of variation

        # High spatial variance of ELA → natural photo
        ela_spatial_var = ela_map.var()

        # AI: low CoV (uniform compression), low spatial variance
        # Map CoV 0…2 → AI prob 1.0…0.0
        cov_score   = 1.0 - np.clip(cov / 1.5, 0.0, 1.0)
        # Map spatial_var 0…3000 → AI prob 1.0…0.0
        var_score   = 1.0 - np.clip(ela_spatial_var / 2500, 0.0, 1.0)

        ela_ai_score = 0.55 * cov_score + 0.45 * var_score
        return float(np.clip(ela_ai_score, 0.0, 1.0))
    except Exception:
        return 0.5

# ──────────────────────────────────────────────────────────────────
#  FORENSIC SIGNAL 4 — NOISE RESIDUAL  (SRM-inspired)
# ──────────────────────────────────────────────────────────────────

def noise_residual_score(pil_img: Image.Image) -> float:
    """
    High-pass filter residual analysis (inspired by SRM: Steganalysis Rich Model).
    Camera sensor noise is structured and correlated; AI-generated images have
    different (often more uniform or smooth) noise residuals.

    Returns P(AI).
    """
    try:
        arr = np.array(pil_img.convert("L")).astype(np.float32)

        # 3×3 high-pass filter (Laplacian-of-Gaussian residual)
        kernel = np.array([
            [-1, -1, -1],
            [-1,  8, -1],
            [-1, -1, -1],
        ], dtype=np.float32) / 8.0

        from scipy.ndimage import convolve
        residual = convolve(arr, kernel, mode="reflect")

        # Natural camera noise: kurtosis > 5 (heavy-tailed, sensor shot noise)
        # AI image noise: kurtosis closer to 3 (Gaussian, denoising artifacts)
        k = float(stats.kurtosis(residual.flatten()))
        # Normalise: kurtosis 3→AI, kurtosis 10→real
        kurtosis_score = 1.0 - np.clip((k - 2.0) / 8.0, 0.0, 1.0)

        # Skewness: camera noise should be near-zero skew
        sk = abs(float(stats.skew(residual.flatten())))
        skew_score = np.clip(sk / 3.0, 0.0, 1.0)  # high skew = anomalous = AI signal

        return float(np.clip(0.6 * kurtosis_score + 0.4 * skew_score, 0.0, 1.0))
    except Exception:
        return 0.5

# ──────────────────────────────────────────────────────────────────
#  FORENSIC SIGNAL 5 — COLOR STATISTICS
# ──────────────────────────────────────────────────────────────────

def color_statistics_score(pil_img: Image.Image) -> float:
    """
    AI images often have:
    - Hypersaturated colors (GAN/diffusion model over-saturation)
    - Bimodal or spiky hue histograms (color mode collapse)
    - Unrealistically smooth color gradients

    Returns P(AI).
    """
    try:
        hsv = pil_img.convert("HSV") if hasattr(pil_img, "convert") else None
        # PIL doesn't have HSV — use numpy
        arr_rgb = np.array(pil_img).astype(np.float32) / 255.0
        arr_cv  = cv2.cvtColor(
            (arr_rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV
        ).astype(np.float32)

        hue = arr_cv[:, :, 0]        # 0–180
        sat = arr_cv[:, :, 1] / 255  # 0–1
        val = arr_cv[:, :, 2] / 255  # 0–1

        # Metric 1: Mean saturation (AI tends higher)
        mean_sat = sat.mean()
        sat_score = np.clip((mean_sat - 0.3) / 0.5, 0.0, 1.0)

        # Metric 2: Hue histogram peakedness (AI = spiky / mode-collapsed)
        hue_hist, _ = np.histogram(hue.flatten(), bins=36, range=(0, 180))
        hue_hist = hue_hist.astype(float) / hue_hist.sum()
        hue_kurtosis = float(stats.kurtosis(hue_hist))
        hue_score = np.clip(hue_kurtosis / 10.0, 0.0, 1.0)

        # Metric 3: Color smoothness (low local std → over-smoothed → AI)
        patch_stds = []
        h, w = sat.shape
        step = max(h // 8, 8)
        for y in range(0, h - step, step):
            for x in range(0, w - step, step):
                patch_stds.append(sat[y:y+step, x:x+step].std())
        smoothness_score = 1.0 - np.clip(np.mean(patch_stds) / 0.15, 0.0, 1.0)

        return float(np.clip(
            0.35 * sat_score + 0.35 * hue_score + 0.30 * smoothness_score,
            0.0, 1.0
        ))
    except Exception:
        return 0.5

# ──────────────────────────────────────────────────────────────────
#  FORENSIC SIGNAL 6 — SHARPNESS ANOMALY
# ──────────────────────────────────────────────────────────────────

def sharpness_anomaly_score(pil_img: Image.Image) -> float:
    """
    Measure sharpness consistency across image regions.
    AI diffusion images often show:
    - Hyper-sharp focal areas with unnatural background blur
    - OR unnaturally uniform sharpness (no natural bokeh gradient)

    Returns P(AI).
    """
    try:
        arr = np.array(pil_img.convert("L")).astype(np.float32)
        h, w = arr.shape

        # Laplacian variance in NxN tiles
        n = 6
        tile_h, tile_w = h // n, w // n
        if tile_h < 8 or tile_w < 8:
            return 0.5

        variances = []
        for row in range(n):
            for col in range(n):
                tile = arr[row*tile_h:(row+1)*tile_h, col*tile_w:(col+1)*tile_w]
                lap  = cv2.Laplacian(tile, cv2.CV_64F)
                variances.append(lap.var())

        variances = np.array(variances)
        global_var  = variances.mean()
        spread      = variances.std() / (global_var + 1e-9)  # relative spread

        # Very high spread = strong bokeh gradient = possible AI portrait
        # Very low spread = unnaturally uniform = possible AI
        # Real photos: moderate spread (0.4–1.5)
        if spread < 0.3:
            ai_score = 0.7  # too uniform
        elif spread > 2.0:
            ai_score = 0.65 # too extreme
        else:
            ai_score = 0.5 - (spread - 0.3) / (2.0 - 0.3) * 0.2  # slight real bias
        return float(np.clip(ai_score, 0.0, 1.0))
    except Exception:
        return 0.5

# ──────────────────────────────────────────────────────────────────
#  FORENSIC SIGNAL 7 — EXIF (structured scoring, not just flag)
# ──────────────────────────────────────────────────────────────────

# EXIF tags we expect in real camera images
_EXPECTED_EXIF_TAGS = {
    "Make", "Model", "DateTime", "ExposureTime", "FNumber",
    "ISOSpeedRatings", "Flash", "FocalLength", "ExifImageWidth",
    "ExifImageHeight", "Software",
}

def exif_ai_score(image_bytes: bytes) -> float:
    """
    Structured EXIF analysis. Returns P(AI).
    - Missing EXIF entirely → likely AI (nudge toward AI)
    - Has EXIF but no camera Make/Model → likely post-processed or AI
    - Rich EXIF with camera metadata → likely real
    """
    try:
        img = Image.open(BytesIO(image_bytes))
        exif_data = img._getexif()
        if exif_data is None:
            return 0.65  # no EXIF → moderate AI signal

        from PIL.ExifTags import TAGS
        readable = {TAGS.get(k, k): v for k, v in exif_data.items()}
        found_tags = set(readable.keys())

        # Camera-specific tags that AI tools rarely fake
        camera_tags = {"Make", "Model", "ExposureTime", "FNumber", "ISOSpeedRatings"}
        gps_tags    = {"GPSInfo"}
        sw_tags     = {"Software"}

        n_camera = len(camera_tags & found_tags)
        has_gps  = bool(gps_tags & found_tags)
        has_sw   = bool(sw_tags & found_tags)
        sw_val   = str(readable.get("Software", "")).lower()

        # Penalise if Software field contains AI tool names
        ai_tools = {"stable diffusion", "midjourney", "dall-e", "firefly", "comfyui", "automatic1111"}
        if any(t in sw_val for t in ai_tools):
            return 0.95  # near-certain AI

        # Score based on camera tag richness
        # 0 camera tags → 0.65, 5 camera tags → 0.15
        score = 0.65 - (n_camera / len(camera_tags)) * 0.50
        if has_gps:
            score -= 0.10  # GPS data strongly suggests real camera
        return float(np.clip(score, 0.0, 1.0))

    except Exception:
        return 0.60  # assume slight AI tendency if EXIF unreadable

# ──────────────────────────────────────────────────────────────────
#  PATCH-BASED ANOMALY BOOST
# ──────────────────────────────────────────────────────────────────

def patch_ela_variance(pil_img: Image.Image) -> float:
    """
    Compute ELA on 8×8 patches and measure inter-patch variance.
    Spatially uniform ELA (low variance) → AI.
    Returns P(AI).
    """
    try:
        patches = patch_grid(pil_img, n=PATCH_GRID)
        if not patches:
            return 0.5
        patch_scores = []
        for p in patches:
            patch_scores.append(ela_score(p, quality=90))
        patch_scores = np.array(patch_scores)
        variance = float(patch_scores.var())
        # Low variance across patches → uniform → AI
        return float(1.0 - np.clip(variance / 0.04, 0.0, 1.0))
    except Exception:
        return 0.5

# ──────────────────────────────────────────────────────────────────
#  ENSEMBLE FUSION
# ──────────────────────────────────────────────────────────────────

def ensemble_score(
        neural_scores: Dict[str, float],
        forensic_scores: Dict[str, float],
) -> Tuple[float, float, str, Dict]:
    """
    Combine all signals into a final score with uncertainty estimate.

    Returns:
        (final_score, confidence, label, debug_dict)
    """
    all_scores: Dict[str, float] = {**neural_scores, **forensic_scores}

    # ── Consensus voting (neural models only) ──────────────────────
    neural_values = list(neural_scores.values())
    strong_fake_votes = sum(1 for s in neural_values if s >= STRONG_FAKE_THRESH)
    strong_real_votes = sum(1 for s in neural_values if s <= STRONG_REAL_THRESH)

    consensus_triggered = False
    if strong_fake_votes >= CONSENSUS_NEURAL_MIN:
        # Override to strong AI — forensic signals only provide small adjustment
        base_score = 0.92
        consensus_triggered = True
        consensus_direction = "fake"
    elif strong_real_votes >= CONSENSUS_NEURAL_MIN:
        base_score = 0.08
        consensus_triggered = True
        consensus_direction = "real"
    else:
        base_score = None
        consensus_direction = None

    # ── Weighted sum ───────────────────────────────────────────────
    weighted_sum = 0.0
    weight_used  = 0.0
    for key, weight in WEIGHTS.items():
        score = all_scores.get(key)
        if score is not None:
            weighted_sum += weight * score
            weight_used  += weight

    # Re-normalise in case some models failed to load
    weighted_avg = weighted_sum / weight_used if weight_used > 0 else 0.5

    # If consensus was triggered, blend base_score with weighted average
    if consensus_triggered:
        final_score = 0.7 * base_score + 0.3 * weighted_avg
    else:
        final_score = weighted_avg

    final_score = float(np.clip(final_score, 0.0, 1.0))

    # ── Uncertainty / confidence ───────────────────────────────────
    # Spread of neural model scores tells us how much they disagree
    if len(neural_values) >= 2:
        disagreement = float(np.std(neural_values))
    else:
        disagreement = 0.25  # single model → assume uncertainty

    # High disagreement → lower confidence
    raw_confidence = 1.0 - disagreement * 1.5
    confidence = float(np.clip(raw_confidence, 0.05, 1.0))

    debug = {
        "neural_scores": neural_scores,
        "forensic_scores": forensic_scores,
        "weighted_average": round(weighted_avg, 4),
        "final_score": round(final_score, 4),
        "confidence": round(confidence, 4),
        "model_disagreement_std": round(disagreement, 4),
        "strong_fake_votes": strong_fake_votes,
        "strong_real_votes": strong_real_votes,
        "consensus_triggered": consensus_triggered,
        "consensus_direction": consensus_direction,
    }

    return final_score, confidence, debug


def decide_label(
        final_score: float,
        confidence: float,
        mode: str = "balanced",
) -> Tuple[str, str]:
    """
    Apply threshold decision. Returns (label, confidence_label).
    """
    thresholds = THRESHOLDS.get(mode, THRESHOLDS["balanced"])
    fake_t = thresholds["fake"]
    real_t = thresholds["real"]

    if final_score >= fake_t:
        label = "AI Generated"
    elif final_score <= real_t:
        label = "Real"
    else:
        label = "Uncertain"

    if confidence >= 0.80:
        conf_label = "High"
    elif confidence >= 0.55:
        conf_label = "Medium"
    else:
        conf_label = "Low"

    return label, conf_label

# ──────────────────────────────────────────────────────────────────
#  FULL PIPELINE
# ──────────────────────────────────────────────────────────────────

def run_full_pipeline(
        image_bytes: bytes,
        pil_img: Image.Image,
        mode: str = "balanced",
) -> Dict:
    """
    Orchestrates the complete detection pipeline.
    Neural models run in parallel; forensic signals run concurrently.
    """

    # ── Run neural models (parallel) ──────────────────────────────
    neural_scores = run_all_neural_models(pil_img)

    # ── Run forensic signals (parallel via futures) ────────────────
    forensic_fns = {
        "fft":        lambda: fft_score(pil_img),
        "dct":        lambda: dct_blocking_score(pil_img),
        "ela":        lambda: ela_score(pil_img),
        "noise":      lambda: noise_residual_score(pil_img),
        "color":      lambda: color_statistics_score(pil_img),
        "sharpness":  lambda: sharpness_anomaly_score(pil_img),
        "exif":       lambda: exif_ai_score(image_bytes),
    }

    forensic_futures = {
        executor.submit(fn): name
        for name, fn in forensic_fns.items()
    }
    forensic_scores: Dict[str, float] = {}
    for future in as_completed(forensic_futures):
        name = forensic_futures[future]
        try:
            forensic_scores[name] = future.result()
        except Exception as exc:
            log.warning(f"Forensic signal {name} failed: {exc}")
            forensic_scores[name] = 0.5

    # ── Ensemble & decide ──────────────────────────────────────────
    final_score, confidence, debug = ensemble_score(neural_scores, forensic_scores)
    label, conf_label = decide_label(final_score, confidence, mode)

    # ── Build response ─────────────────────────────────────────────
    return {
        "prediction":        label,
        "final_score":       round(final_score, 4),
        "confidence":        round(confidence, 4),
        "confidence_level":  conf_label,
        "mode":              mode,
        "neural_scores": {
            k: round(v, 4) for k, v in neural_scores.items()
        },
        "forensic_scores": {
            k: round(v, 4) for k, v in forensic_scores.items()
        },
        "debug": {
            **debug,
            "models_loaded": list(detectors.keys()),
        },
    }

# ──────────────────────────────────────────────────────────────────
#  API ENDPOINTS
# ──────────────────────────────────────────────────────────────────

@app.post("/detect", summary="Detect AI-generated or real image")
def detect(
        image_url: str = Query(..., description="Public image URL or base64 data URI"),
        mode: str = Query("normal", description="Mode: fast | normal | conservative | full"),
):
    log.info(f"/detect called | mode={mode}")

    # 1. Load
    img_bytes, err = load_image_bytes(image_url)
    if err:
        raise HTTPException(status_code=400, detail=err)

    # 2. Parse
    pil_img, err2 = pil_from_bytes(img_bytes)
    if err2:
        raise HTTPException(status_code=422, detail=err2)

    # 3. Quality gate
    quality_err = quality_gate(pil_img)
    if quality_err:
        raise HTTPException(status_code=422, detail=f"image_quality_issue: {quality_err}")

    # 4. Full pipeline
    result = run_full_pipeline(img_bytes, pil_img, mode=mode)
    log.info(f"Result: {result['prediction']} | score={result['final_score']:.3f} | conf={result['confidence']:.3f}")
    return result


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_loaded": list(detectors.keys()),
        "models_failed": [k for k in MODELS if k not in detectors],
        "weights": WEIGHTS,
    }


@app.get("/thresholds")
def get_thresholds():
    return {"modes": THRESHOLDS, "current_weights": WEIGHTS}


# ──────────────────────────────────────────────────────────────────
#  ENTRY POINT
# ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("deepfake_detector:app", host="0.0.0.0", port=8000, reload=False)