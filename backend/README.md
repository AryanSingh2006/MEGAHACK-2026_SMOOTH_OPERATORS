# Backend — Spring Boot Gateway

> Thin validation proxy between the Vision Guard Chrome Extension and the Python AI service.

---

## What this is

The `backend/` directory contains a **Spring Boot 4** application that sits between the browser extension and the Python AI service. It is intentionally minimal — its only job is to:

1. Accept an `imageUrl` from the extension popup
2. Validate the URL format
3. Forward the request to the FastAPI AI service on `:8000`
4. Return the result back to the extension

It is **not** a full application server. There is no database, no authentication, and no business logic — just a validated proxy.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| **Java 17** | Language & runtime |
| **Spring Boot 4** | Web framework (`spring-boot-starter-webmvc`) |
| **Lombok** | Removes boilerplate on DTOs (`@Getter`, `@Setter`, `@RequiredArgsConstructor`) |
| **Maven** | Build & dependency management (wrapper included) |

---

## Architecture

```
Chrome Extension
  │
  │  POST http://localhost:8080/detect
  │  Body: { "imageUrl": "https://..." }
  ▼
DetectionController           ← validates input, rejects bad URLs
  │
DetectionService              ← builds AI service URL, calls via RestTemplate
  │
  │  POST http://localhost:8000/detect?image_url=https://...
  ▼
FastAPI AI Service (:8000)
  │
  └── returns { prediction, confidence, final_score, ... }
  │
DetectionService              ← receives DeepfakeApiRawResponse
  │
DetectionController           ← returns 200 OK with result
  │
Chrome Extension
```

---

## Key Classes

| Class | Package | Role |
|---|---|---|
| `BackendApplication` | `com.example.backend` | Spring Boot entry point |
| `DetectionController` | `...controller` | REST endpoint `POST /detect`, input validation |
| `DetectionService` | `...service` | Builds AI service URL, calls via `RestTemplate`, propagates errors |
| `CorsConfig` | `...config` | CORS filter — allows all origins |
| `AppConfig` | `...config` | (Reserved for future beans) |
| `DetectionRequest` | `...dto` | Request body DTO — `{ imageUrl }` |
| `DeepfakeApiRawResponse` | `...dto` | Response DTO from AI service — `{ prediction, confidence, final_score }` |

---

## API Endpoint

### `POST /detect`

Accepts a JSON body with the image URL and proxies detection to the AI service.

**Request:**
```http
POST http://localhost:8080/detect
Content-Type: application/json

{
  "imageUrl": "https://example.com/photo.jpg"
}
```

**Success Response (`200 OK`):**
```json
{
  "prediction": "AI Generated",
  "confidence": "high",
  "final_score": 0.872
}
```

**Error Responses:**

| Code | Condition |
|---|---|
| `400` | `imageUrl` is missing, blank, or not `http://` / `https://` / `data:image` |
| `500` | AI service is unreachable or returned an error |

---

## Validation Rules

The controller enforces these rules before forwarding:
- `imageUrl` must be **present and non-blank**
- Must start with `http://`, `https://`, or `data:image`
- All other formats return `400 Bad Request`

```java
// DetectionController.java
if (imageUrl == null || imageUrl.isBlank()) → 400
if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && !imageUrl.startsWith("data:image")) → 400
```

---

## CORS Configuration

CORS is fully open (`allowedOriginPatterns: "*"`) to allow the Chrome Extension popup — which runs on a `chrome-extension://` origin — to call the backend without being blocked by the browser's cross-origin policy.

```java
// CorsConfig.java
config.setAllowedOriginPatterns(Arrays.asList("*"));
config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
config.setAllowedHeaders(Arrays.asList("*"));
config.setAllowCredentials(true);
```

---

## Configuration

| Setting | Default | Where to change |
|---|---|---|
| Backend port | `:8080` | `application.properties` → `server.port` |
| AI Service URL | `http://localhost:8000/detect` | `DetectionService.java` → `AI_SERVICE_URL` |

**`application.properties`:**
```properties
spring.application.name=backend
# server.port=8080   # uncomment to override
```

---

## Running

```bash
# From the backend/ directory
./mvnw spring-boot:run
```

> Requires **Java 17+**. The Maven wrapper (`mvnw`) is included — no separate Maven install needed.

The server starts on `http://localhost:8080`.

---

## Tests

```bash
./mvnw test
```

Spring Boot test slice (`spring-boot-starter-webmvc-test`) is included for controller-level tests.

---

## Project Layout

```
backend/
├── pom.xml
├── mvnw / mvnw.cmd          # Maven wrapper
└── src/
    └── main/
        ├── java/com/example/backend/
        │   ├── BackendApplication.java
        │   ├── config/
        │   │   ├── AppConfig.java
        │   │   └── CorsConfig.java
        │   ├── controller/
        │   │   └── DetectionController.java
        │   ├── dto/
        │   │   ├── DetectionRequest.java
        │   │   └── DeepfakeApiRawResponse.java
        │   └── service/
        │       └── DetectionService.java
        └── resources/
            └── application.properties
```
