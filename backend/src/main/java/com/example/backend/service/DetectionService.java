package com.example.backend.service;

import com.example.backend.dto.DeepfakeApiRawResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class DetectionService {

    private static final Logger log = LoggerFactory.getLogger(DetectionService.class);
    private static final String AI_SERVICE_URL = "http://localhost:8000/detect";

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * Forwards the image URL to the AI service for deepfake detection.
     *
     * @param imageUrl  HTTP(S) URL or data:image URI to analyse
     * @return the raw response from the AI service
     * @throws RuntimeException if the AI service is unreachable or returns an error
     */
    public DeepfakeApiRawResponse detect(String imageUrl) {

        String url = UriComponentsBuilder
                .fromUriString(AI_SERVICE_URL)
                .queryParam("image_url", imageUrl)
                .toUriString();

        log.info("Calling AI service: {}", AI_SERVICE_URL);

        try {
            ResponseEntity<DeepfakeApiRawResponse> response =
                    restTemplate.postForEntity(url, null, DeepfakeApiRawResponse.class);

            if (response.getBody() == null) {
                throw new RuntimeException("AI service returned an empty response");
            }

            log.info("AI service response: prediction={}, score={}",
                    response.getBody().getPrediction(),
                    response.getBody().getFinal_score());

            return response.getBody();
        } catch (RestClientException e) {
            log.error("AI service call failed: {}", e.getMessage());
            throw new RuntimeException("Failed to reach AI detection service", e);
        }
    }
}
