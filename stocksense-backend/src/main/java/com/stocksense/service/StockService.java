package com.stocksense.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stocksense.dto.SentimentResponse;
import com.stocksense.entity.StockSentiment;
import com.stocksense.repository.StockSentimentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Orchestrates the cache-hit / cache-miss flow described in the architecture:
 * 1. Check MySQL for a fresh row.
 * 2. If fresh -> return immediately, never touch FastAPI.
 * 3. If stale/missing -> call FastAPI asynchronously, persist the result, return it.
 */
@Service
public class StockService {

    private static final Logger log = LoggerFactory.getLogger(StockService.class);

    private final StockSentimentRepository repository;
    private final FastAPIClient fastAPIClient;
    private final ObjectMapper objectMapper;

    public StockService(StockSentimentRepository repository, FastAPIClient fastAPIClient, ObjectMapper objectMapper) {
        this.repository = repository;
        this.fastAPIClient = fastAPIClient;
        this.objectMapper = objectMapper;
    }

    @Value("${sentiment.cache.minutes:15}")
    private int cacheMinutes;

    // Tracks in-flight FastAPI calls so concurrent requests for the same ticker
    // don't fire duplicate AI calls, and so /status can be polled.
    private final java.util.Map<String, CompletableFuture<SentimentResponse>> pendingRefreshes = new ConcurrentHashMap<>();

    /**
     * Kicks off (or reuses) an in-flight async call to FastAPI for this ticker.
     * Called from the controller's cache-miss branch, which immediately
     * responds 202 to the client without waiting for this to finish.
     */
    public void triggerRefresh(String ticker) {
        String normalized = ticker.toUpperCase();

        pendingRefreshes.computeIfAbsent(normalized, t -> {
            CompletableFuture<SentimentResponse> future = refreshFromAi(t);
            // once done (success or failure), drop it from the pending map
            future.whenComplete((res, err) -> pendingRefreshes.remove(t));
            return future;
        });
    }

    /**
     * Polled by the client (e.g. every 2s) after receiving a 202.
     * Returns: IN_PROGRESS while the AI call is still running,
     * DONE + the result once it finishes, or FAILED if FastAPI errored out.
     */
    public RefreshStatus pollStatus(String ticker) {
        String normalized = ticker.toUpperCase();
        CompletableFuture<SentimentResponse> future = pendingRefreshes.get(normalized);

        if (future == null) {
            // Not pending anymore -- either it finished & was removed, or never started.
            // Check the DB: if a fresh row exists now, it completed successfully.
            return getCachedIfFresh(normalized)
                    .map(RefreshStatus::done)
                    .orElse(RefreshStatus.failed("No refresh in progress and no fresh cached data found"));
        }

        if (!future.isDone()) {
            return RefreshStatus.inProgress();
        }

        try {
            return RefreshStatus.done(future.get());
        } catch (Exception e) {
            return RefreshStatus.failed(e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
        }
    }

    /** Small value holder so the controller doesn't need to know about Futures. */
    public static class RefreshStatus {
        public final String status; // IN_PROGRESS | DONE | FAILED
        public final SentimentResponse data;
        public final String error;

        private RefreshStatus(String status, SentimentResponse data, String error) {
            this.status = status;
            this.data = data;
            this.error = error;
        }

        static RefreshStatus inProgress() { return new RefreshStatus("IN_PROGRESS", null, null); }
        static RefreshStatus done(SentimentResponse data) { return new RefreshStatus("DONE", data, null); }
        static RefreshStatus failed(String error) { return new RefreshStatus("FAILED", null, error); }
    }

    public Optional<SentimentResponse> getCachedIfFresh(String ticker) {
        return repository.findByTicker(ticker.toUpperCase())
                .filter(row -> row.getLastUpdated() != null &&
                        row.getLastUpdated().isAfter(LocalDateTime.now().minusMinutes(cacheMinutes)))
                .map(row -> toResponse(row, "cache"));
    }

    /**
     * Cache-miss path: hits FastAPI on the dedicated async pool, then
     * persists the fresh result to MySQL once it returns.
     */
    public CompletableFuture<SentimentResponse> refreshFromAi(String ticker) {
        String normalized = ticker.toUpperCase();

        return fastAPIClient.fetchSentimentAsync(normalized)
                .thenApply(aiResponse -> {
                    saveToDatabase(normalized, aiResponse);
                    aiResponse.setSource("live");
                    aiResponse.setLastUpdated(LocalDateTime.now().format(DateTimeFormatter.ISO_DATE_TIME));
                    return aiResponse;
                })
                .exceptionally(ex -> {
                    log.error("Failed to refresh sentiment for {}: {}", normalized, ex.getMessage());
                    throw new RuntimeException("AI engine unavailable for ticker " + normalized, ex);
                });
    }

    private void saveToDatabase(String ticker, SentimentResponse aiResponse) {
        StockSentiment entity = repository.findByTicker(ticker).orElseGet(StockSentiment::new);

        entity.setTicker(ticker);
        entity.setPositiveScore(aiResponse.getPositive());
        entity.setNegativeScore(aiResponse.getNegative());
        entity.setNeutralScore(aiResponse.getNeutral());
        entity.setOverallLabel(aiResponse.getOverallLabel());
        entity.setOverallScore(aiResponse.getOverallScore());
        entity.setHeadlineCount(aiResponse.getHeadlineCount());
        entity.setLastUpdated(LocalDateTime.now());

        try {
            entity.setHeadlinesJson(objectMapper.writeValueAsString(
                    aiResponse.getHeadlines() == null ? Collections.emptyList() : aiResponse.getHeadlines()));
        } catch (Exception e) {
            entity.setHeadlinesJson("[]");
        }

        repository.save(entity);
    }

    private SentimentResponse toResponse(StockSentiment row, String source) {
        List<SentimentResponse.HeadlineDto> headlines;
        try {
            headlines = objectMapper.readValue(
                    row.getHeadlinesJson(),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, SentimentResponse.HeadlineDto.class)
            );
        } catch (Exception e) {
            headlines = Collections.emptyList();
        }

        return new SentimentResponse(
                row.getTicker(),
                row.getPositiveScore(),
                row.getNegativeScore(),
                row.getNeutralScore(),
                row.getOverallLabel(),
                row.getOverallScore(),
                row.getHeadlineCount(),
                headlines,
                source,
                row.getLastUpdated().format(DateTimeFormatter.ISO_DATE_TIME)
        );
    }
}
