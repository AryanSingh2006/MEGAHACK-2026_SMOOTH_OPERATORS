"""
Platt Scaling Calibration Script
=================================
Use this to recalibrate PLATT_PARAMS in main.py against your own labeled dataset.

Usage:
    python calibrate.py --real_dir /path/to/real_images --fake_dir /path/to/ai_images

Outputs updated PLATT_PARAMS dict to paste into main.py.

Requirements: scikit-learn
    pip install scikit-learn
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import calibration_curve
from sklearn.metrics import roc_auc_score
from transformers import pipeline as hf_pipeline

MODELS = {
    "siglip": "prithivMLmods/deepfake-detector-model-v1",
    "vit":    "prithivMLmods/Deep-Fake-Detector-v2-Model",
    "dima":   "dima806/deepfake_vs_real_image_detection",
    "sdxl":   "Organika/sdxl-detector",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGES = 500  # per class — increase if you have more


def load_images(directory: Path, label: int, limit: int = MAX_IMAGES) -> list[tuple[Image.Image, int]]:
    results = []
    for p in sorted(directory.iterdir()):
        if p.suffix.lower() not in IMAGE_EXTS:
            continue
        try:
            img = Image.open(p).convert("RGB")
            results.append((img, label))
        except Exception:
            pass
        if len(results) >= limit:
            break
    return results


def get_raw_score(clf, img: Image.Image) -> float:
    results = clf(img)
    fake_kw = {"fake", "ai", "generated", "deepfake", "1"}
    real_kw = {"real", "human", "0"}
    fake_p = real_p = 0.0
    for item in results:
        lbl = item.get("label", "").lower()
        sc  = float(item.get("score", 0.0))
        if any(k in lbl for k in fake_kw):
            fake_p += sc
        elif any(k in lbl for k in real_kw):
            real_p += sc
    total = fake_p + real_p
    return fake_p / total if total > 1e-6 else 0.5


def calibrate(args):
    real_dir = Path(args.real_dir)
    fake_dir = Path(args.fake_dir)

    print(f"Loading real images from {real_dir} …")
    real_data = load_images(real_dir, label=0)
    print(f"  → {len(real_data)} images")

    print(f"Loading AI/fake images from {fake_dir} …")
    fake_data = load_images(fake_dir, label=1)
    print(f"  → {len(fake_data)} images")

    all_data = real_data + fake_data
    labels   = np.array([d[1] for d in all_data])

    platt_params = {}
    for model_name, model_id in MODELS.items():
        print(f"\nCalibrating {model_name} ({model_id}) …")
        clf = hf_pipeline("image-classification", model=model_id, device=-1)

        raw_scores = []
        for i, (img, _) in enumerate(all_data):
            s = get_raw_score(clf, img)
            raw_scores.append(s)
            if (i + 1) % 50 == 0:
                print(f"  {i+1}/{len(all_data)} …")

        raw_scores = np.array(raw_scores).reshape(-1, 1)

        # Fit Platt logistic regression
        lr = LogisticRegression(C=1.0)
        lr.fit(raw_scores, labels)
        A = float(lr.coef_[0][0])
        B = float(lr.intercept_[0])
        platt_params[model_name] = (round(A, 4), round(B, 4))

        # Evaluate
        probs = lr.predict_proba(raw_scores)[:, 1]
        auc = roc_auc_score(labels, probs)
        print(f"  Platt params: A={A:.4f}, B={B:.4f}")
        print(f"  AUC after calibration: {auc:.4f}")

        del clf  # free memory

    print("\n\nPaste this into PLATT_PARAMS in main.py:")
    print("PLATT_PARAMS = {")
    for k, (a, b) in platt_params.items():
        print(f'    "{k}": ({a}, {b}),')
    print("}")

    with open("calibration_results.json", "w") as f:
        json.dump({k: list(v) for k, v in platt_params.items()}, f, indent=2)
    print("\nResults saved to calibration_results.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--real_dir", required=True, help="Directory of real images (label=0)")
    parser.add_argument("--fake_dir", required=True, help="Directory of AI-generated images (label=1)")
    args = parser.parse_args()
    calibrate(args)