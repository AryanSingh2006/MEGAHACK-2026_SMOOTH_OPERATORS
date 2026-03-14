"""
Tests for the AI Detection Service  –  URL image check flow.
Run with:  pytest test_main.py -v

Covers:
  - /health endpoint
  - /detect  URL validation / error responses
  - /detect  full pipeline (with a tiny synthetic image)
  - /detect/upload  file upload endpoint
"""

import io
import pytest  # type: ignore
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient  # type: ignore
from PIL import Image  # type: ignore

from main import app  # type: ignore

client = TestClient(app)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_tiny_jpeg() -> bytes:
    """Create a tiny 64×64 JPEG in memory for testing."""
    img = Image.new("RGB", (64, 64), color=(128, 100, 80))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_tiny_png() -> bytes:
    """Create a tiny 64×64 PNG in memory for testing."""
    img = Image.new("RGB", (64, 64), color=(200, 50, 50))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── /health ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_200_and_status_ok(self):
        """GET /health returns 200 and status ok."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["version"] == "3.0.0"
        assert "models_loaded" in data
        assert "modes" in data
        assert "fast" in data["modes"] and "normal" in data["modes"]

    def test_includes_thresholds(self):
        """Health endpoint includes threshold values."""
        data = client.get("/health").json()
        assert "thresholds" in data
        assert "fake" in data["thresholds"]
        assert "real" in data["thresholds"]

    def test_includes_face_detection_status(self):
        """Health endpoint reports face detection availability."""
        data = client.get("/health").json()
        assert "face_detection" in data
        assert isinstance(data["face_detection"], bool)


# ── /detect  URL validation ─────────────────────────────────────────────────

class TestDetectUrlValidation:
    def test_missing_image_url_returns_422(self):
        """POST /detect without image_url query param returns 422."""
        response = client.post("/detect", params={"mode": "normal"})
        assert response.status_code == 422

    def test_invalid_mode_returns_400(self):
        """POST /detect with invalid mode returns 400."""
        response = client.post(
            "/detect",
            params={"image_url": "https://example.com/image.jpg", "mode": "invalid_mode"},
        )
        assert response.status_code == 400
        assert "mode" in response.text.lower() or "fast" in response.text

    def test_valid_modes_accepted(self):
        """All four valid modes are accepted (validation-only, image fetch mocked)."""
        for mode in ["fast", "normal", "conservative", "full"]:
            with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
                mock_fetch.return_value = _make_tiny_jpeg()
                response = client.post(
                    "/detect",
                    params={"image_url": "https://example.com/img.jpg", "mode": mode},
                )
                # Should not be 400 (mode accepted) — might be 200 or other, but not a mode error
                assert response.status_code != 400 or "mode" not in response.json().get("detail", "")


# ── /detect  URL fetch errors ───────────────────────────────────────────────

class TestDetectUrlFetchErrors:
    def test_unreachable_url_returns_400(self):
        """POST /detect with an unreachable URL returns 400."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.side_effect = Exception("Connection refused")
            response = client.post(
                "/detect",
                params={"image_url": "https://unreachable.example.com/img.jpg", "mode": "fast"},
            )
            assert response.status_code == 400
            assert "fetch" in response.json()["detail"].lower() or "image" in response.json()["detail"].lower()

    def test_non_image_url_returns_422(self):
        """POST /detect with bytes that aren't an image returns 422."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = b"this is not an image at all"
            response = client.post(
                "/detect",
                params={"image_url": "https://example.com/notimage.txt", "mode": "fast"},
            )
            # Should fail to decode image → 422
            assert response.status_code == 422
            assert "decode" in response.json()["detail"].lower() or "image" in response.json()["detail"].lower()


# ── /detect  successful pipeline (mocked image fetch) ───────────────────────

class TestDetectUrlPipeline:
    def test_returns_valid_result_structure(self):
        """Full pipeline returns all required fields for a JPEG image URL."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _make_tiny_jpeg()
            response = client.post(
                "/detect",
                params={"image_url": "https://example.com/photo.jpg", "mode": "fast"},
            )
            assert response.status_code == 200
            data = response.json()

            # Core fields
            assert "prediction" in data
            assert data["prediction"] in ("Real", "AI Generated", "Uncertain")
            assert "confidence" in data
            assert data["confidence"] in ("high", "medium", "low")
            assert "final_score" in data
            assert 0.0 <= data["final_score"] <= 1.0

            # Extra fields
            assert "mode" in data
            assert data["mode"] == "fast"
            assert "processing_ms" in data
            assert "streams" in data
            assert "image_info" in data
            assert "votes" in data

    def test_image_info_reflects_dimensions(self):
        """image_info section contains width/height of the analysed image."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _make_tiny_jpeg()
            data = client.post(
                "/detect",
                params={"image_url": "https://example.com/photo.jpg", "mode": "fast"},
            ).json()

            assert data["image_info"]["width"] == 64
            assert data["image_info"]["height"] == 64

    def test_png_detection(self):
        """Pipeline correctly identifies a PNG input."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _make_tiny_png()
            data = client.post(
                "/detect",
                params={"image_url": "https://example.com/photo.png", "mode": "fast"},
            ).json()

            assert data["image_info"]["is_png"] is True

    def test_streams_have_scores(self):
        """All forensic streams return numeric scores."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _make_tiny_jpeg()
            data = client.post(
                "/detect",
                params={"image_url": "https://example.com/photo.jpg", "mode": "normal"},
            ).json()

            for stream_name in ["frequency_forensics", "metadata_forensics", "pixel_forensics"]:
                stream = data["streams"][stream_name]
                assert "score" in stream
                assert isinstance(stream["score"], (int, float))

    def test_votes_structure(self):
        """Votes section has expected keys."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _make_tiny_jpeg()
            data = client.post(
                "/detect",
                params={"image_url": "https://example.com/photo.jpg", "mode": "fast"},
            ).json()

            votes = data["votes"]
            assert "per_model" in votes
            assert "fake_voters" in votes
            assert "real_voters" in votes
            assert "abstained" in votes

    def test_confidence_interval_present(self):
        """Response includes confidence interval."""
        with patch("main.fetch_image_bytes", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _make_tiny_jpeg()
            data = client.post(
                "/detect",
                params={"image_url": "https://example.com/photo.jpg", "mode": "fast"},
            ).json()

            assert "confidence_interval" in data
            ci = data["confidence_interval"]
            assert "low" in ci and "high" in ci
            assert ci["low"] <= ci["high"]


# ── /detect/upload ──────────────────────────────────────────────────────────

class TestDetectUpload:
    def test_upload_jpeg_returns_result(self):
        """Uploading a JPEG file returns a valid detection result."""
        img_bytes = _make_tiny_jpeg()
        response = client.post(
            "/detect/upload",
            files={"file": ("test.jpg", io.BytesIO(img_bytes), "image/jpeg")},
            params={"mode": "fast"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "prediction" in data
        assert data["prediction"] in ("Real", "AI Generated", "Uncertain")

    def test_upload_png_returns_result(self):
        """Uploading a PNG file returns a valid detection result."""
        img_bytes = _make_tiny_png()
        response = client.post(
            "/detect/upload",
            files={"file": ("test.png", io.BytesIO(img_bytes), "image/png")},
            params={"mode": "fast"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["image_info"]["is_png"] is True

    def test_upload_invalid_file_returns_422(self):
        """Uploading a non-image file returns 422."""
        response = client.post(
            "/detect/upload",
            files={"file": ("test.txt", io.BytesIO(b"not an image"), "text/plain")},
            params={"mode": "fast"},
        )
        assert response.status_code == 422

    def test_upload_invalid_mode_returns_400(self):
        """Uploading with invalid mode returns 400."""
        response = client.post(
            "/detect/upload",
            files={"file": ("test.jpg", io.BytesIO(_make_tiny_jpeg()), "image/jpeg")},
            params={"mode": "bogus"},
        )
        assert response.status_code == 400
