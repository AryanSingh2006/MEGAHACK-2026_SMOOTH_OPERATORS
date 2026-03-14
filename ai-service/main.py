"""
Advanced Deepfake / AI-Generated Image Detection API  v3.0
===========================================================
Key improvements over v2:
  - Majority vote system: models vote independently, ensemble is a vote count not just average
  - Temperature scaling replaces uncalibrated Platt params
  - Forensic streams now have real scoring power (not just tiny nudges)
  - Smarter "Uncertain" — only fires when models genuinely disagree, not when scores average near 0.5
  - Per-model label map: each model's label format is explicitly handled (no guesswork)
  - Image resized to model's expected input size before inference
  - Logging shows per-model raw scores so you can debug easily
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import logging
import time
import urllib.parse
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import httpx  # type: ignore
import numpy as np  # type: ignore
from fastapi import FastAPI, HTTPException, Query, UploadFile, File  # type: ignore
from PIL import Image, ImageFile, ImageSequence, ImageFilter  # type: ignore
from transformers import pipeline as hf_pipeline  # type: ignore

ImageFile.LOAD_TRUNCATED_IMAGES = True

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger("deepfake")

# ─────────────────────────────────────────────────────────────────────────────
# ENUMS & MODES
# ─────────────────────────────────────────────────────────────────────────────

class DetectionMode(str, Enum):
    FAST         = "fast"         # 2 models, no forensics   (~1-2s)
    NORMAL       = "normal"       # 4 models + forensics     (~4-6s)
    CONSERVATIVE = "conservative" # 4 models, high threshold (~4-6s)
    FULL         = "full"         # 4 models + forensics + face (~8-12s)


# ─────────────────────────────────────────────────────────────────────────────
# MODEL REGISTRY
# Each entry has: hf model id, input_size, and explicit label->meaning map.
# "fake_labels" = substrings that mean AI-generated.
# "real_labels" = substrings that mean real/authentic.
# temperature < 1 sharpens scores away from 0.5 (fixes the "Uncertain" problem)
# ─────────────────────────────────────────────────────────────────────────────

MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "siglip": {
        "model_id":    "prithivMLmods/deepfake-detector-model-v1",
        "input_size":  224,
        "fake_labels": {"fake", "ai-generated", "deepfake", "artificial"},
        "real_labels": {"real", "authentic", "genuine"},
        "weight":      0.30,
        "temperature": 0.7,   # < 1 sharpens scores away from 0.5
    },
    "vit": {
        "model_id":    "prithivMLmods/Deep-Fake-Detector-v2-Model",
        "input_size":  224,
        "fake_labels": {"fake", "1", "deepfake"},
        "real_labels": {"real", "0", "authentic"},
        "weight":      0.20,
        "temperature": 0.75,
    },
    "dima": {
        "model_id":    "dima806/deepfake_vs_real_image_detection",
        "input_size":  224,
        "fake_labels": {"fake", "ai", "generated", "deepfake"},
        "real_labels": {"real", "original", "human"},
        "weight":      0.30,
        "temperature": 0.65,
    },
    "sdxl": {
        "model_id":    "Organika/sdxl-detector",
        "input_size":  224,
        "fake_labels": {"artificial", "generated", "fake", "ai"},
        "real_labels": {"natural", "real", "photo"},
        "weight":      0.20,
        "temperature": 0.72,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# THRESHOLDS
# ─────────────────────────────────────────────────────────────────────────────

THRESH_FAKE              = 0.55
THRESH_REAL              = 0.40
THRESH_CONSERVATIVE_FAKE = 0.68

VOTE_FAKE_THRESH   = 0.70
VOTE_REAL_THRESH   = 0.30
MAJORITY_FRACTION  = 0.5

FORENSIC_BOOST_MAX = 0.20

# ─────────────────────────────────────────────────────────────────────────────
# LOAD MODELS
# ─────────────────────────────────────────────────────────────────────────────

log.info("Loading ML models ...")

_classifiers: Dict[str, Any] = {}
_loaded_models: List[str] = []

for _name, _cfg in MODEL_REGISTRY.items():
    try:
        _classifiers[_name] = hf_pipeline(
            "image-classification",
            model=_cfg["model_id"],
            device=-1,
            top_k=None,
        )
        _loaded_models.append(_name)
        log.info("  Loaded: %s (%s)", _name, _cfg["model_id"])
    except Exception as _e:
        log.warning("  Failed to load %s: %s", _name, _e)

log.info("Loaded %d/%d models: %s", len(_loaded_models), len(MODEL_REGISTRY), _loaded_models)

try:
    from facenet_pytorch import MTCNN as _MTCNN  # type: ignore
    _mtcnn = _MTCNN(keep_all=True, device="cpu", post_process=False)
    FACE_DETECTION_AVAILABLE = True
    log.info("MTCNN face detector loaded.")
except ImportError:
    _mtcnn = None
    FACE_DETECTION_AVAILABLE = False
    log.info("facenet-pytorch not installed — face analysis skipped.")

# ─────────────────────────────────────────────────────────────────────────────
# DATA STRUCTURES
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ImageContext:
    pil_img:          Image.Image
    img_bytes:        bytes
    width:            int
    height:           int
    has_faces:        bool  = False
    face_count:       int   = 0
    face_boxes:       List[Any]  = field(default_factory=list)
    quality_score:    float = 1.0
    is_photo_like:    bool  = True
    is_png:           bool  = False
    jpeg_quality_est: float = 0.8


@dataclass
class ModelVote:
    name:        str
    raw_score:   float
    cal_score:   float
    vote:        str
    confidence:  float
    all_labels:  Dict[str, float] = field(default_factory=dict)


@dataclass
class StreamResult:
    name:    str
    score:   float
    flags:   List[str]      = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# IMAGE LOADING
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_image_bytes(uri: str) -> bytes:
    decoded = urllib.parse.unquote(uri.strip())
    if decoded.startswith("data:image"):
        _, encoded = decoded.split(",", 1)
        return base64.b64decode(encoded)
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(decoded, headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        })
        resp.raise_for_status()
        return resp.content
    return b""


def pil_from_bytes(img_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(img_bytes))
    if getattr(img, "is_animated", False):
        img = next(ImageSequence.Iterator(img))
    return img.convert("RGB")


# ─────────────────────────────────────────────────────────────────────────────
# PREPROCESSING
# ─────────────────────────────────────────────────────────────────────────────

def build_context(pil_img: Image.Image, img_bytes: bytes) -> ImageContext:
    ctx = ImageContext(
        pil_img   = pil_img,
        img_bytes = img_bytes,
        width     = pil_img.width,
        height    = pil_img.height,
    )
    try:
        probe = Image.open(io.BytesIO(img_bytes))
        ctx.is_png = probe.format == "PNG"
    except Exception:
        pass

    ctx.quality_score    = _quality_score(pil_img)
    ctx.jpeg_quality_est = _jpeg_quality_estimate(img_bytes)
    ctx.is_photo_like    = _photo_heuristic(pil_img)

    if FACE_DETECTION_AVAILABLE and _mtcnn is not None:
        try:
            boxes, _ = _mtcnn.detect(pil_img)
            if boxes is not None and len(boxes) > 0:  # type: ignore
                ctx.has_faces  = True
                ctx.face_count = len(boxes)
                ctx.face_boxes = boxes.tolist()
        except Exception as e:
            log.debug("MTCNN detect error: %s", e)

    return ctx


def _quality_score(img: Image.Image) -> float:
    px = img.width * img.height
    res = min(1.0, px / (800 * 800))
    gray = np.array(img.convert("L"), dtype=np.float32)
    if gray.size == 0:
        return float(0.4 * res)

    # Pillow has no built-in Laplacian filter; approximate it with NumPy shifts.
    lap = np.asarray(
        -4.0 * gray
        + np.roll(gray, 1, axis=0)
        + np.roll(gray, -1, axis=0)
        + np.roll(gray, 1, axis=1)
        + np.roll(gray, -1, axis=1)
    )
    lap[0, :] = 0.0
    lap[-1, :] = 0.0
    lap[:, 0] = 0.0
    lap[:, -1] = 0.0

    sharpness = float(np.clip(np.var(lap) / 500.0, 0.0, 1.0))
    return float(0.4 * res + 0.6 * sharpness)


def _jpeg_quality_estimate(img_bytes: bytes) -> float:
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        ratio = len(img_bytes) / max(buf.tell(), 1)
        return float(np.clip(ratio, 0.0, 1.5))
    except Exception:
        return 0.8


def _photo_heuristic(img: Image.Image) -> bool:
    arr = np.array(img, dtype=np.float32)
    r, g, b = arr[:,:,0].flatten(), arr[:,:,1].flatten(), arr[:,:,2].flatten()
    try:
        corr = (np.corrcoef(r, g)[0,1] + np.corrcoef(r, b)[0,1]) / 2.0
    except Exception:
        corr = 0.5
    noise = float(np.std(arr - np.array(img.filter(ImageFilter.SMOOTH_MORE), dtype=np.float32)))
    return bool(corr > 0.55 and noise > 1.5)


# ─────────────────────────────────────────────────────────────────────────────
# TEMPERATURE SCALING  (T < 1 sharpens, T > 1 softens)
# ─────────────────────────────────────────────────────────────────────────────

def _temperature_scale(prob: float, temperature: float) -> float:
    if temperature == 1.0:
        return prob
    prob = float(np.clip(prob, 1e-6, 1 - 1e-6))
    log_odds = np.log(prob / (1.0 - prob))
    scaled   = log_odds / temperature
    return float(1.0 / (1.0 + np.exp(-scaled)))


# ─────────────────────────────────────────────────────────────────────────────
# MULTI-CROP
# ─────────────────────────────────────────────────────────────────────────────

def _get_crops(img: Image.Image, target_size: int = 224) -> List[Image.Image]:
    w, h = img.size
    cw, ch = int(w * 0.90), int(h * 0.90)

    if cw < 64 or ch < 64:
        return [img.resize((target_size, target_size), Image.LANCZOS)]

    cx = (w - cw) // 2
    cy = (h - ch) // 2

    boxes = [
        (cx, cy, cx + cw, cy + ch),
        (0,      0,      cw,    ch),
        (w - cw, 0,      w,     ch),
        (0,      h - ch, cw,    h),
        (w - cw, h - ch, w,     h),
    ]
    crops = []
    for box in boxes:
        try:
            crops.append(img.crop(box).resize((target_size, target_size), Image.LANCZOS))
        except Exception:
            pass
    return crops if crops else [img.resize((target_size, target_size), Image.LANCZOS)]


# ─────────────────────────────────────────────────────────────────────────────
# SINGLE MODEL INFERENCE
# ─────────────────────────────────────────────────────────────────────────────

def _score_one_model(model_name: str, clf: Any, img: Image.Image) -> ModelVote:
    cfg         = MODEL_REGISTRY[model_name]
    fake_labels = cfg["fake_labels"]
    real_labels = cfg["real_labels"]
    temperature = cfg.get("temperature", 1.0)

    try:
        results = clf(img)
        if not isinstance(results, list) or not results:
            return ModelVote(model_name, 0.5, 0.5, "abstain", 0.0)

        label_scores: Dict[str, float] = {
            str(item.get("label", "")).lower().strip(): float(item.get("score", 0.0))
            for item in results
        }

        fake_prob = sum(s for lbl, s in label_scores.items() if any(k in lbl for k in fake_labels))
        real_prob = sum(s for lbl, s in label_scores.items() if any(k in lbl for k in real_labels))

        total = fake_prob + real_prob
        raw   = (fake_prob / total) if total > 1e-6 else 0.5
        cal   = _temperature_scale(raw, temperature)

        if cal >= VOTE_FAKE_THRESH:
            vote = "fake"
        elif cal <= VOTE_REAL_THRESH:
            vote = "real"
        else:
            vote = "abstain"

        log.debug("  %s raw=%.3f cal(T=%.2f)=%.3f vote=%s labels=%s",
                  model_name, raw, temperature, cal, vote,
                  {k: round(v, 3) for k, v in label_scores.items()})  # type: ignore

        return ModelVote(model_name, raw, cal, vote, abs(cal - 0.5), label_scores)

    except Exception as e:
        log.warning("Model %s error: %s", model_name, e)
        return ModelVote(model_name, 0.5, 0.5, "abstain", 0.0)


# ─────────────────────────────────────────────────────────────────────────────
# ML ENSEMBLE WITH MAJORITY VOTING
# ─────────────────────────────────────────────────────────────────────────────

def run_ml_ensemble(
        ctx: ImageContext,
        model_names: Optional[List[str]] = None,
) -> Tuple[float, List[ModelVote]]:

    names = model_names or _loaded_models
    all_votes: List[ModelVote] = []

    for name in names:
        if name not in _classifiers:
            continue
        clf   = _classifiers[name]
        cfg   = MODEL_REGISTRY[name]
        crops = _get_crops(ctx.pil_img, target_size=cfg.get("input_size", 224))

        crop_scores = []
        last_vote   = None
        for crop in crops:
            v = _score_one_model(name, clf, crop)
            crop_scores.append(v.cal_score)
            last_vote = v

        if not crop_scores or last_vote is None:
            continue
        assert last_vote is not None

        avg_cal = float(np.mean(crop_scores))
        vote    = "fake" if avg_cal >= VOTE_FAKE_THRESH else ("real" if avg_cal <= VOTE_REAL_THRESH else "abstain")

        all_votes.append(ModelVote(
            name=name, raw_score=last_vote.raw_score, cal_score=avg_cal,
            vote=vote, confidence=abs(avg_cal - 0.5), all_labels=last_vote.all_labels,
        ))

    if not all_votes:
        return 0.5, []

    # Weighted average
    total_w = sum(MODEL_REGISTRY[v.name]["weight"] for v in all_votes)
    ensemble = sum(MODEL_REGISTRY[v.name]["weight"] * v.cal_score for v in all_votes) / (total_w if total_w >= 1e-9 else 1e-9)

    # Majority vote override
    n             = len(all_votes)
    fake_voters   = [v for v in all_votes if v.vote == "fake"]
    real_voters   = [v for v in all_votes if v.vote == "real"]

    if len(fake_voters) / n >= MAJORITY_FRACTION and len(fake_voters) > len(real_voters):
        majority_mean = float(np.mean([v.cal_score for v in fake_voters]))
        ensemble = max(ensemble, 0.6 * majority_mean + 0.4 * ensemble)
        log.info("Majority FAKE (%d/%d) -> ensemble=%.3f", len(fake_voters), n, ensemble)

    elif len(real_voters) / n >= MAJORITY_FRACTION and len(real_voters) > len(fake_voters):
        majority_mean = float(np.mean([v.cal_score for v in real_voters]))
        ensemble = min(ensemble, 0.6 * majority_mean + 0.4 * ensemble)
        log.info("Majority REAL (%d/%d) -> ensemble=%.3f", len(real_voters), n, ensemble)

    return float(np.clip(ensemble, 0.0, 1.0)), all_votes


# ─────────────────────────────────────────────────────────────────────────────
# FORENSIC STREAMS
# ─────────────────────────────────────────────────────────────────────────────

def run_frequency_forensics(ctx: ImageContext) -> StreamResult:
    try:
        arr = np.array(ctx.pil_img.convert("L"), dtype=np.float32)
        h, w = arr.shape
        ch, cw = int(h * 0.85), int(w * 0.85)
        y0, x0 = (h - ch) // 2, (w - cw) // 2
        gray   = arr[y0:y0+ch, x0:x0+cw]

        fft  = np.abs(np.fft.fftshift(np.fft.fft2(gray)))
        cy2, cx2 = np.array(fft.shape) // 2
        Y, X = np.ogrid[:fft.shape[0], :fft.shape[1]]
        dist = np.sqrt((Y - cy2)**2 + (X - cx2)**2)
        maxd = dist.max() + 1e-9

        mf = fft[(dist >= 0.25 * maxd) & (dist < 0.65 * maxd)].mean() + 1e-9
        hf = fft[dist >= 0.65 * maxd].mean() + 1e-9
        hf_ratio = hf / mf

        fft_score = float(np.clip((hf_ratio - 0.04) / 0.50, 0.0, 1.0))

        smoothed  = np.array(ctx.pil_img.filter(ImageFilter.SMOOTH_MORE), dtype=np.float32)
        noise_std = float(np.std(np.array(ctx.pil_img, dtype=np.float32) - smoothed))
        noise_score = float(np.clip(1.0 - (noise_std - 1.0) / 12.0, 0.0, 1.0))

        flags = []
        if hf_ratio > 0.28:  flags.append("elevated_hf_spectrum")
        if noise_std < 2.5:  flags.append("low_noise_profile")

        combined = 0.55 * fft_score + 0.45 * noise_score
        return StreamResult("frequency_forensics", float(np.clip(combined, 0.0, 1.0)),
                            flags=flags, details={"hf_ratio": round(hf_ratio, 4),  # type: ignore
                                                  "noise_std": round(noise_std, 3)})  # type: ignore
    except Exception as e:
        log.debug("Freq forensics error: %s", e)
        return StreamResult("frequency_forensics", 0.5)


def run_metadata_forensics(ctx: ImageContext) -> StreamResult:
    flags:   List[str]     = []
    details: Dict[str, Any] = {}
    score    = 0.5

    try:
        probe = Image.open(io.BytesIO(ctx.img_bytes))
        exif  = probe._getexif() if hasattr(probe, "_getexif") else None

        if exif is None:
            flags.append("no_exif")
            score = 0.62
        else:
            tag_count  = len(exif)
            real_score = min(1.0, tag_count / 40.0)
            cam_tags   = {271, 272, 306, 36867, 36868, 37386, 33434}
            found_cam  = cam_tags & set(exif.keys())
            if found_cam:
                real_score = min(1.0, real_score + 0.3)
            if 34853 in exif:
                real_score = min(1.0, real_score + 0.2)
            score = 1.0 - real_score
            details["exif_tags"] = tag_count
            details["camera_tags"] = len(found_cam)

            AI_SOFTWARE = [
                "stable diffusion", "dall-e", "midjourney", "firefly",
                "imagen", "runway", "pika", "sora", "kling", "civitai",
                "automatic1111", "comfyui", "fooocus", "invoke ai",
                "novelai", "leonardo",
            ]
            sw = str(exif.get(305, "")).lower()
            if sw:
                details["software"] = sw
                for sig in AI_SOFTWARE:
                    if sig in sw:
                        flags.append(f"definitive_ai_software:{sig}")
                        score = 1.0
                        break

    except Exception as e:
        log.debug("Metadata error: %s", e)
        score = 0.5

    return StreamResult("metadata_forensics", float(np.clip(score, 0.0, 1.0)),
                        flags=flags, details=details)


def run_pixel_forensics(ctx: ImageContext) -> StreamResult:
    flags:   List[str]     = []
    details: Dict[str, Any] = {}

    try:
        buf = io.BytesIO()
        ctx.pil_img.save(buf, format="JPEG", quality=85)
        buf.seek(0)
        comp = Image.open(buf).convert("RGB")
        diff = np.abs(np.array(ctx.pil_img, dtype=np.float32) - np.array(comp, dtype=np.float32))
        ela_std = float(np.std(diff))
        # Clean images (low ela_std) = more AI-like
        ela_score = float(np.clip(1.0 - (ela_std / 18.0), 0.0, 1.0))
        details["ela_std"] = round(ela_std, 3)  # type: ignore
        if ela_std < 3.5:
            flags.append("very_low_ela_variance")

        arr = np.array(ctx.pil_img, dtype=np.float32)
        kurt_scores = []
        for ch in range(3):
            channel = arr[:,:,ch].flatten()
            mu, sigma = channel.mean(), channel.std() + 1e-6
            kurt = float(np.mean(((channel - mu) / sigma) ** 4))
            kurt_scores.append(float(np.clip(abs(kurt - 3.0) / 6.0, 0.0, 1.0)))
        color_score = float(np.mean(kurt_scores))
        details["color_kurtosis"] = round(color_score, 3)  # type: ignore
        if color_score > 0.6:
            flags.append("unusual_color_distribution")

        combined = 0.60 * ela_score + 0.40 * color_score
        return StreamResult("pixel_forensics", float(np.clip(combined, 0.0, 1.0)),
                            flags=flags, details=details)
    except Exception as e:
        log.debug("Pixel forensics error: %s", e)
        return StreamResult("pixel_forensics", 0.5)


def run_face_analysis(ctx: ImageContext) -> StreamResult:
    if not ctx.has_faces or not FACE_DETECTION_AVAILABLE:
        return StreamResult("face_analysis", 0.5, flags=["no_faces" if not ctx.has_faces else "unavailable"])

    face_scores = []
    for box in ctx.face_boxes[:4]:  # type: ignore
        try:
            x1, y1, x2, y2 = [int(v) for v in box]
            px = int((x2 - x1) * 0.25)
            py = int((y2 - y1) * 0.25)
            crop = ctx.pil_img.crop((
                max(0, x1-px), max(0, y1-py),
                min(ctx.width, x2+px), min(ctx.height, y2+py)
            ))
            if crop.width < 48 or crop.height < 48:
                continue
            for name in _loaded_models:
                cfg     = MODEL_REGISTRY[name]
                resized = crop.resize((cfg["input_size"], cfg["input_size"]), Image.LANCZOS)
                v       = _score_one_model(name, _classifiers[name], resized)
                face_scores.append(v.cal_score)
        except Exception as e:
            log.debug("Face crop error: %s", e)

    if not face_scores:
        return StreamResult("face_analysis", 0.5, flags=["crop_too_small"])

    return StreamResult("face_analysis", float(np.mean(face_scores)),
                        details={"face_count": ctx.face_count})


# ─────────────────────────────────────────────────────────────────────────────
# FORENSIC BOOST
# ─────────────────────────────────────────────────────────────────────────────

def _forensic_boost(freq: StreamResult, meta: StreamResult, pixel: StreamResult, ml_score: float) -> float:
    # Definitive AI software tag overrides everything
    for f in meta.flags:
        if f.startswith("definitive_ai_software"):
            return FORENSIC_BOOST_MAX

    weights = {"metadata_forensics": 0.45, "pixel_forensics": 0.30, "frequency_forensics": 0.25}
    streams = {"metadata_forensics": meta, "pixel_forensics": pixel, "frequency_forensics": freq}

    weighted = sum(weights[n] * s.score for n, s in streams.items())
    nudge = (weighted - 0.5) * 2.0 * FORENSIC_BOOST_MAX

    # Dampen if forensics oppose ML
    if ml_score > 0.5 and nudge < 0:
        nudge *= 0.3
    elif ml_score < 0.5 and nudge > 0:
        nudge *= 0.3

    return float(np.clip(nudge, -FORENSIC_BOOST_MAX, FORENSIC_BOOST_MAX))


# ─────────────────────────────────────────────────────────────────────────────
# DECISION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def make_decision(
        ml_score: float,
        votes:    List[ModelVote],
        face:     StreamResult,
        freq:     StreamResult,
        meta:     StreamResult,
        pixel:    StreamResult,
        ctx:      ImageContext,
        mode:     DetectionMode,
) -> Dict[str, Any]:

    combined_ml = (0.65 * ml_score + 0.35 * face.score
                   if face.score != 0.5 and ctx.has_faces and mode == DetectionMode.FULL
                   else ml_score)

    boost = _forensic_boost(freq, meta, pixel, combined_ml)
    final = float(np.clip(combined_ml + boost, 0.0, 1.0))

    log.info("Decision | ml=%.3f face=%.3f boost=%.3f final=%.3f",
             ml_score, face.score, boost, final)

    fake_thresh = THRESH_CONSERVATIVE_FAKE if mode == DetectionMode.CONSERVATIVE else THRESH_FAKE

    if final >= fake_thresh:
        prediction = "AI Generated"
        confidence = "high" if final > 0.80 else "medium"
    elif final <= THRESH_REAL:
        prediction = "Real"
        confidence = "high" if final < 0.15 else "medium"
    else:
        prediction = "Uncertain"
        confidence = "low"

    std = float(np.std([v.cal_score for v in votes])) if votes else 0.1
    ci_lo = round(float(np.clip(final - 1.5 * std, 0.0, 1.0)), 3)  # type: ignore
    ci_hi = round(float(np.clip(final + 1.5 * std, 0.0, 1.0)), 3)  # type: ignore

    all_flags = []
    for s in [freq, meta, pixel, face]:
        all_flags.extend(s.flags)

    return {
        "prediction":   prediction,
        "confidence":   confidence,
        "final_score":  round(final, 4),  # type: ignore
        "ml_score":     round(combined_ml, 4),  # type: ignore
        "forensic_boost": round(boost, 4),  # type: ignore
        "confidence_interval": {"low": ci_lo, "high": ci_hi},
        "votes": {
            "per_model":  {v.name: {"raw": round(v.raw_score,3), "cal": round(v.cal_score,3), "vote": v.vote} for v in votes},  # type: ignore
            "fake_voters": [v.name for v in votes if v.vote == "fake"],
            "real_voters": [v.name for v in votes if v.vote == "real"],
            "abstained":   [v.name for v in votes if v.vote == "abstain"],
        },
        "flags": all_flags,
    }


# ─────────────────────────────────────────────────────────────────────────────
# FASTAPI
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Deepfake & AI Image Detector",
    description="ML voting + frequency + metadata + pixel forensics",
    version="3.0.0",
)


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively convert numpy scalars/arrays to JSON-safe Python types."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


async def _run_pipeline(img_bytes: bytes, mode: DetectionMode) -> Dict[str, Any]:
    t0       = time.perf_counter()
    img_hash = str(hashlib.sha256(img_bytes).hexdigest())[:16]  # type: ignore

    try:
        pil_img = pil_from_bytes(img_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Cannot decode image: {e}")

    ctx    = build_context(pil_img, img_bytes)
    loop   = asyncio.get_event_loop()
    models = ["siglip", "dima"] if mode == DetectionMode.FAST else _loaded_models

    ml_score, votes = await loop.run_in_executor(None, run_ml_ensemble, ctx, models)
    freq  = await loop.run_in_executor(None, run_frequency_forensics, ctx)
    meta  = await loop.run_in_executor(None, run_metadata_forensics, ctx)
    pixel = await loop.run_in_executor(None, run_pixel_forensics, ctx)
    face  = (await loop.run_in_executor(None, run_face_analysis, ctx)
             if mode == DetectionMode.FULL
             else StreamResult("face_analysis", 0.5, flags=["skipped"]))

    decision = make_decision(ml_score, votes, face, freq, meta, pixel, ctx, mode)
    elapsed  = time.perf_counter() - t0

    log.info("Result | hash=%s | %s | score=%.3f | %.0fms",
             img_hash, decision["prediction"], decision["final_score"], elapsed * 1000)

    result = {
        **decision,
        "mode": mode.value,
        "streams": {
            "frequency_forensics": {"score": round(freq.score,4),  "details": freq.details,  "flags": freq.flags},  # type: ignore
            "metadata_forensics":  {"score": round(meta.score,4),  "details": meta.details,  "flags": meta.flags},  # type: ignore
            "pixel_forensics":     {"score": round(pixel.score,4), "details": pixel.details, "flags": pixel.flags},  # type: ignore
            "face_analysis":       {"score": round(face.score,4) if face.score != 0.5 else None,  # type: ignore
                                    "details": face.details, "flags": face.flags},
        },
        "image_info": {
            "width": ctx.width, "height": ctx.height,
            "is_png": ctx.is_png, "has_faces": ctx.has_faces,
            "face_count": ctx.face_count, "quality": round(ctx.quality_score, 3),  # type: ignore
            "photo_like": ctx.is_photo_like, "sha256": img_hash,
        },
        "processing_ms": round(elapsed * 1000, 1),  # type: ignore
    }

    return _sanitize_for_json(result)  # type: ignore


@app.post("/detect", summary="Detect from URL or base64", response_model=None)
async def detect_url(
        image_url: str = Query(..., description="Image URL or data:image/... base64"),
        mode: str = Query("normal", description="fast | normal | conservative | full"),
):
    try:
        det_mode = DetectionMode(mode)  # type: ignore
    except ValueError:
        valid_modes = ['fast', 'normal', 'conservative', 'full']
        raise HTTPException(400, f"mode must be one of: {valid_modes}")
    try:
        img_bytes = await fetch_image_bytes(image_url)
    except Exception as e:
        raise HTTPException(400, f"Could not fetch image: {e}")
    return await _run_pipeline(img_bytes, det_mode)  # type: ignore


@app.post("/detect/upload", summary="Detect from file upload", response_model=None)
async def detect_upload(
        file: UploadFile = File(...),
        mode: str = Query("normal", description="fast | normal | conservative | full"),
):
    try:
        det_mode = DetectionMode(mode)  # type: ignore
    except ValueError:
        valid_modes = ['fast', 'normal', 'conservative', 'full']
        raise HTTPException(400, f"mode must be one of: {valid_modes}")
    img_bytes = await file.read()
    return await _run_pipeline(img_bytes, det_mode)  # type: ignore


@app.get("/health")
async def health():
    return {
        "status": "ok", "version": "3.0.0",
        "models_loaded": _loaded_models,
        "face_detection": FACE_DETECTION_AVAILABLE,
        "modes": ['fast', 'normal', 'conservative', 'full'],
        "thresholds": {"fake": THRESH_FAKE, "real": THRESH_REAL, "conservative": THRESH_CONSERVATIVE_FAKE},
    }