package com.example.backend.controller;

import com.example.backend.dto.DeepfakeApiRawResponse;
import com.example.backend.dto.DetectionRequest;
import com.example.backend.service.DetectionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class DetectionController {

    private final DetectionService detectionService;

    @PostMapping("/detect")
    public ResponseEntity<?> detect(@RequestBody DetectionRequest req) {

        String imageUrl = req.getImageUrl();

        // Validate: imageUrl must be present
        if (imageUrl == null || imageUrl.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "imageUrl is required"));
        }

        // Validate: must start with http:// or https:// or data:image
        if (!imageUrl.startsWith("http://")
                && !imageUrl.startsWith("https://")
                && !imageUrl.startsWith("data:image")) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "imageUrl must be a valid HTTP(S) URL or data:image URI"));
        }

        try {
            DeepfakeApiRawResponse result = detectionService.detect(imageUrl);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Detection service unavailable: " + e.getMessage()));
        }
    }
}
