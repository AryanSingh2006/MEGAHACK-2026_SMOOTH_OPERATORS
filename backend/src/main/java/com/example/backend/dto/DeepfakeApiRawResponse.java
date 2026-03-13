package com.example.backend.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DeepfakeApiRawResponse {
    private String prediction;
    private String confidence;
    private double final_score;
}

