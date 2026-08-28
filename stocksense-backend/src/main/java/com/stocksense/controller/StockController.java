package com.stocksense.controller;

import com.stocksense.dto.SentimentResponse;
import com.stocksense.dto.AnalysisRequest;
import com.stocksense.dto.AnalysisResponse;
import com.stocksense.entity.User;
import com.stocksense.entity.AnalysisHistory;
import com.stocksense.service.StockService;
import com.stocksense.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Public stock sentiment and research analysis controller.
 * Fully secured by JwtFilter; all requests must carry a valid Bearer JWT.
 */
@RestController
@RequestMapping("/api/stocks")
public class StockController {

    private final StockService stockService;
    private final UserService userService;

    public StockController(StockService stockService, UserService userService) {
        this.stockService = stockService;
        this.userService = userService;
    }

    /* ==========================================================================
       Enterprise AI Agent Analysis Endpoints
       ========================================================================== */
    
    @PostMapping("/analyze")
    public ResponseEntity<?> analyzeStock(@Valid @RequestBody AnalysisRequest request) {
        String username = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userService.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String symbol = request.getSymbol().toUpperCase().strip();
        String query = request.getQuery().trim();

        return stockService.getCachedAnalysis(user.getId(), symbol, query)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> {
                    stockService.triggerAnalysis(user.getId(), symbol, query);
                    return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                            "status", "PROCESSING",
                            "symbol", symbol,
                            "message", "AI Agent is compiling the research report. Poll status endpoint.",
                            "pollUrl", "/api/stocks/analyze/status?symbol=" + symbol + "&query=" + query
                    ));
                });
    }

    @GetMapping("/analyze/status")
    public ResponseEntity<?> getAnalysisStatus(@RequestParam String symbol, @RequestParam String query) {
        StockService.AnalysisRefreshStatus status = stockService.pollAnalysisStatus(symbol, query);

        return switch (status.status) {
            case "DONE" -> ResponseEntity.ok(status.data);
            case "FAILED" -> ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("status", "FAILED", "error", status.error));
            default -> ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(Map.of("status", "IN_PROGRESS", "symbol", symbol.toUpperCase()));
        };
    }

    @GetMapping("/{symbol}")
    public ResponseEntity<?> getStockDetails(@PathVariable String symbol) {
        String username = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userService.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
                
        return stockService.getHistory(user.getId()).stream()
                .filter(h -> h.getSymbol().equalsIgnoreCase(symbol))
                .findFirst()
                .<ResponseEntity<?>>map(h -> ResponseEntity.ok(h.getResponseJson()))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "No cached research report found for " + symbol.toUpperCase())));
    }

    /* ==========================================================================
       Watchlist and Search History Endpoints
       ========================================================================== */

    @GetMapping("/watchlist")
    public ResponseEntity<?> getWatchlist() {
        String username = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userService.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        return ResponseEntity.ok(stockService.getWatchlist(user.getId()));
    }

    @PostMapping("/watchlist/{symbol}")
    public ResponseEntity<?> toggleWatchlist(@PathVariable String symbol) {
        String username = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userService.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        
        boolean added = stockService.toggleWatchlist(user.getId(), symbol);
        return ResponseEntity.ok(Map.of(
                "symbol", symbol.toUpperCase().strip(),
                "action", added ? "ADDED" : "REMOVED",
                "message", added ? "Added to watchlist" : "Removed from watchlist"
        ));
    }

    @GetMapping("/history")
    public ResponseEntity<?> getHistory() {
        String username = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userService.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        return ResponseEntity.ok(stockService.getHistory(user.getId()));
    }

    /* ==========================================================================
       Legacy Widget Support (Keep working features)
       ========================================================================== */

    @GetMapping("/sentiment/{ticker}")
    public ResponseEntity<?> getSentiment(@PathVariable String ticker) {
        return stockService.getCachedIfFresh(ticker)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> {
                    stockService.triggerRefresh(ticker);
                    return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                            "status", "PROCESSING",
                            "ticker", ticker.toUpperCase(),
                            "message", "Fetching fresh sentiment from the AI engine. Poll status endpoint.",
                            "pollUrl", "/api/stocks/sentiment/" + ticker.toUpperCase() + "/status"
                    ));
                });
    }

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
