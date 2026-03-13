package com.example.backend.controller;

import com.example.backend.dto.DetectionRequest;
import com.example.backend.dto.DetectionResponse;
import com.example.backend.service.DetectionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/detect")
@RequiredArgsConstructor
public class DetectionController {

    private final DetectionService detectionService;

    @PostMapping
    public DetectionResponse detect(@RequestBody DetectionRequest request) {

        return detectionService.detect(request);
    }
}
