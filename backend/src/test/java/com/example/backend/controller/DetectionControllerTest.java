package com.example.backend.controller;

import com.example.backend.dto.DeepfakeApiRawResponse;
import com.example.backend.service.DetectionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DetectionController.class)
class DetectionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DetectionService detectionService;

    // ── Helper ──────────────────────────────────────────────────────────────
    private DeepfakeApiRawResponse buildResponse(String prediction, String confidence, double score) {
        DeepfakeApiRawResponse r = new DeepfakeApiRawResponse();
        r.setPrediction(prediction);
        r.setConfidence(confidence);
        r.setFinal_score(score);
        return r;
    }

    // ── Happy-path tests ────────────────────────────────────────────────────
    @Nested
    @DisplayName("Happy path — valid URL")
    class HappyPath {

        @Test
        @DisplayName("returns Real result from AI service")
        void detect_returnsRealResult() throws Exception {
            String imageUrl = "https://example.com/photo.jpg";
            when(detectionService.detect(eq(imageUrl)))
                    .thenReturn(buildResponse("Real", "high", 0.15));

            String body = "{\"imageUrl\":\"" + imageUrl + "\"}";

            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                    .andExpect(jsonPath("$.prediction").value("Real"))
                    .andExpect(jsonPath("$.confidence").value("high"))
                    .andExpect(jsonPath("$.final_score").value(0.15));
        }

        @Test
        @DisplayName("returns AI Generated result from AI service")
        void detect_returnsAiGeneratedResult() throws Exception {
            String imageUrl = "https://example.com/deepfake.png";
            when(detectionService.detect(eq(imageUrl)))
                    .thenReturn(buildResponse("AI Generated", "medium", 0.72));

            String body = "{\"imageUrl\":\"" + imageUrl + "\"}";

            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.prediction").value("AI Generated"))
                    .andExpect(jsonPath("$.final_score").value(0.72));
        }

        @Test
        @DisplayName("returns Uncertain result from AI service")
        void detect_returnsUncertainResult() throws Exception {
            String imageUrl = "https://example.com/ambiguous.jpg";
            when(detectionService.detect(eq(imageUrl)))
                    .thenReturn(buildResponse("Uncertain", "low", 0.48));

            String body = "{\"imageUrl\":\"" + imageUrl + "\"}";

            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.prediction").value("Uncertain"))
                    .andExpect(jsonPath("$.confidence").value("low"))
                    .andExpect(jsonPath("$.final_score").value(0.48));
        }

        @Test
        @DisplayName("accepts data:image base64 URI as imageUrl")
        void detect_acceptsDataUri() throws Exception {
            String dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
            when(detectionService.detect(eq(dataUri)))
                    .thenReturn(buildResponse("Real", "high", 0.10));

            String body = "{\"imageUrl\":\"" + dataUri + "\"}";

            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.prediction").value("Real"));
        }

        @Test
        @DisplayName("passes exact imageUrl to service (no mutation)")
        void detect_passesExactUrlToService() throws Exception {
            String imageUrl = "https://img.example.com/path/to/image.jpg?w=800&q=90";
            when(detectionService.detect(eq(imageUrl)))
                    .thenReturn(buildResponse("Real", "high", 0.05));

            String body = "{\"imageUrl\":\"" + imageUrl + "\"}";

            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk());

            verify(detectionService).detect(imageUrl);
        }
    }

    // ── Validation tests ────────────────────────────────────────────────────
    @Nested
    @DisplayName("Validation — bad request body")
    class Validation {

        @Test
        @DisplayName("returns 400 when imageUrl is null / missing")
        void detect_missingImageUrl_returns400() throws Exception {
            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("imageUrl is required"));

            verify(detectionService, never()).detect(anyString());
        }

        @Test
        @DisplayName("returns 400 when imageUrl is blank")
        void detect_blankImageUrl_returns400() throws Exception {
            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"imageUrl\":\"   \"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("imageUrl is required"));

            verify(detectionService, never()).detect(anyString());
        }

        @Test
        @DisplayName("returns 400 when imageUrl has invalid protocol (ftp://)")
        void detect_invalidProtocol_returns400() throws Exception {
            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"imageUrl\":\"ftp://files.example.com/img.jpg\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").exists());

            verify(detectionService, never()).detect(anyString());
        }

        @Test
        @DisplayName("returns 400 when imageUrl is just a random string")
        void detect_randomString_returns400() throws Exception {
            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"imageUrl\":\"not-a-url\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").exists());

            verify(detectionService, never()).detect(anyString());
        }
    }

    // ── Error handling tests ────────────────────────────────────────────────
    @Nested
    @DisplayName("Error handling — service failures")
    class ErrorHandling {

        @Test
        @DisplayName("returns 500 when AI service is unreachable")
        void detect_serviceDown_returns500() throws Exception {
            when(detectionService.detect(anyString()))
                    .thenThrow(new RuntimeException("Failed to reach AI detection service"));

            String body = "{\"imageUrl\":\"https://example.com/image.jpg\"}";

            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.error").exists());
        }

        @Test
        @DisplayName("returns 500 when service throws unexpected error")
        void detect_unexpectedError_returns500() throws Exception {
            when(detectionService.detect(anyString()))
                    .thenThrow(new RuntimeException("AI service returned an empty response"));

            String body = "{\"imageUrl\":\"https://example.com/image.jpg\"}";

            mockMvc.perform(post("/detect")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.error").exists());
        }
    }
}
