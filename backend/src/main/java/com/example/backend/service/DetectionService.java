package com.example.backend.service;

import com.example.backend.dto.DetectionRequest;
import com.example.backend.dto.DetectionResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Service
public class DetectionService {

    private final RestTemplate restTemplate = new RestTemplate();

    public DetectionResponse detect(DetectionRequest request) {

        String encodedUrl = URLEncoder.encode(request.getImageUrl(), StandardCharsets.UTF_8);
        String apiUrl = "http://localhost:8000/detect?image_url=" + encodedUrl;

        DetectionResponse response =
                restTemplate.postForObject(apiUrl, null, DetectionResponse.class);

        return response;
    }
}
