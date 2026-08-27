package com.stocksense.controller;

import com.stocksense.dto.SentimentResponse;
import com.stocksense.service.StockService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Public-facing stock sentiment API. Protected by JwtFilter via SecurityConfig
 * (every /api/stocks/** request must carry a valid Bearer token).
 */
@RestController
@RequestMapping("/api/stocks")
public class StockController {

    private final StockService stockService;

    public StockController(StockService stockService) {
        this.stockService = stockService;
    }

    /**
     * Main entry point described in the architecture's data-flow section.
     *  - Cache hit  -> 200 with data immediately, FastAPI never touched.
     *  - Cache miss -> kicks off the async FastAPI call and returns 202,
     *                  client should then poll /sentiment/{ticker}/status.
     */
    @GetMapping("/sentiment/{ticker}")
    public ResponseEntity<?> getSentiment(@PathVariable String ticker) {
        return stockService.getCachedIfFresh(ticker)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> {
                    stockService.triggerRefresh(ticker);
                    return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                            "status", "PROCESSING",
                            "ticker", ticker.toUpperCase(),
                            "message", "Fetching fresh sentiment from the AI engine. Poll the status endpoint.",
                            "pollUrl", "/api/stocks/sentiment/" + ticker.toUpperCase() + "/status"
                    ));
                });
    }

    /** Polled by the frontend every couple of seconds after a 202. */
    @GetMapping("/sentiment/{ticker}/status")
    public ResponseEntity<?> getStatus(@PathVariable String ticker) {
        StockService.RefreshStatus status = stockService.pollStatus(ticker);

        return switch (status.status) {
            case "DONE" -> ResponseEntity.ok(status.data);
            case "FAILED" -> ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("status", "FAILED", "error", status.error));
            default -> ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(Map.of("status", "IN_PROGRESS", "ticker", ticker.toUpperCase()));
        };
    }

    /** Forces a fresh AI lookup even if a cached row is still within the freshness window. */
    @PostMapping("/sentiment/{ticker}/refresh")
    public ResponseEntity<?> forceRefresh(@PathVariable String ticker) {
        stockService.triggerRefresh(ticker);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "status", "PROCESSING",
                "ticker", ticker.toUpperCase(),
                "pollUrl", "/api/stocks/sentiment/" + ticker.toUpperCase() + "/status"
        ));
    }
}
