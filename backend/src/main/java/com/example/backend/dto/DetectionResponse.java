package com.example.backend.dto;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@RequiredArgsConstructor
public class DetectionResponse {
    private String prediction;
    private Double finalAiScore;
    private Breakdown breakdown;

    public static class Breakdown {

        private Double detectorAiScore;
        private Double clipAiScore;
        private Boolean exifPresent;

        public Breakdown() {
        }

        public Double getDetectorAiScore() {
            return detectorAiScore;
        }

        public void setDetectorAiScore(Double detectorAiScore) {
            this.detectorAiScore = detectorAiScore;
        }

        public Double getClipAiScore() {
            return clipAiScore;
        }

        public void setClipAiScore(Double clipAiScore) {
            this.clipAiScore = clipAiScore;
        }

        public Boolean getExifPresent() {
            return exifPresent;
        }

        public void setExifPresent(Boolean exifPresent) {
            this.exifPresent = exifPresent;
        }

    }
}
