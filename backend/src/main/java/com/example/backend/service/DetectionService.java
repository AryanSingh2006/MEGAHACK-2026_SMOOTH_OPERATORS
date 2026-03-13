package com.example.backend.service;

import com.example.backend.dto.DeepfakeApiRawResponse;
import com.example.backend.dto.DetectionRequest;
import com.example.backend.dto.DetectionResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Service
public class DetectionService {

    private final RestTemplate restTemplate = new RestTemplate();

    private static final String DETECTOR_URL =
            "http://localhost:8000/detect?image_url=";

    public DetectionResponse detect(DetectionRequest request) {

        String encodedImageUrl = URLEncoder.encode(
                request.getImageUrl(),
                StandardCharsets.UTF_8
        );

        String url = DETECTOR_URL + encodedImageUrl;

        DeepfakeApiRawResponse apiResponse =
                restTemplate.postForObject(url, null, DeepfakeApiRawResponse.class);

        if (apiResponse == null) {
            return null;
        }

        DetectionResponse response = new DetectionResponse();
        response.setPrediction(apiResponse.getPrediction());
        response.setConfidence(apiResponse.getConfidence());
        response.setFinal_score(apiResponse.getFinal_score());
        return response;
    }
}
