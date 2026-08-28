package com.stocksense.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stocksense.dto.SentimentResponse;
import com.stocksense.dto.AnalysisResponse;
import com.stocksense.entity.StockSentiment;
import com.stocksense.entity.Watchlist;
import com.stocksense.entity.AnalysisHistory;
import com.stocksense.entity.MarketDataCache;
import com.stocksense.repository.StockSentimentRepository;
import com.stocksense.repository.WatchlistRepository;
import com.stocksense.repository.AnalysisHistoryRepository;
import com.stocksense.repository.MarketDataCacheRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Orchestrates the cache-hit / cache-miss flow for stock sentiment and research analysis.
 * Manages watchlists, history logging, and market data caches in MySQL.
 */
@Service
public class StockService {

    private static final Logger log = LoggerFactory.getLogger(StockService.class);

    private final StockSentimentRepository sentimentRepository;
    private final WatchlistRepository watchlistRepository;
    private final AnalysisHistoryRepository analysisHistoryRepository;
    private final MarketDataCacheRepository marketDataCacheRepository;
    private final FastAPIClient fastAPIClient;
    private final ObjectMapper objectMapper;

    public StockService(StockSentimentRepository sentimentRepository,
                        WatchlistRepository watchlistRepository,
                        AnalysisHistoryRepository analysisHistoryRepository,
                        MarketDataCacheRepository marketDataCacheRepository,
                        FastAPIClient fastAPIClient,
                        ObjectMapper objectMapper) {
        this.sentimentRepository = sentimentRepository;
        this.watchlistRepository = watchlistRepository;
        this.analysisHistoryRepository = analysisHistoryRepository;
        this.marketDataCacheRepository = marketDataCacheRepository;
        this.fastAPIClient = fastAPIClient;
        this.objectMapper = objectMapper;
    }

    @Value("${sentiment.cache.minutes:15}")
    private int cacheMinutes;

    // Legacy sentiment refreshes map
    private final java.util.Map<String, CompletableFuture<SentimentResponse>> pendingRefreshes = new ConcurrentHashMap<>();

    // New agent-based analysis refreshes map
    private final java.util.Map<String, CompletableFuture<AnalysisResponse>> pendingAnalyses = new ConcurrentHashMap<>();

    /* ==========================================================================
       Watchlist Operations
       ========================================================================== */
    @Transactional(readOnly = true)
    public List<String> getWatchlist(Long userId) {
        return watchlistRepository.findByUserId(userId).stream()
                .map(Watchlist::getSymbol)
                .collect(Collectors.toList());
    }

    @Transactional
    public boolean toggleWatchlist(Long userId, String symbol) {
        String normalized = symbol.toUpperCase().strip();
        Optional<Watchlist> opt = watchlistRepository.findByUserIdAndSymbol(userId, normalized);
        if (opt.isPresent()) {
            watchlistRepository.deleteByUserIdAndSymbol(userId, normalized);
            return false; // Removed
        } else {
            watchlistRepository.save(new Watchlist(userId, normalized));
            return true; // Added
        }
    }

    @Transactional(readOnly = true)
    public boolean isOnWatchlist(Long userId, String symbol) {
        return watchlistRepository.existsByUserIdAndSymbol(userId, symbol.toUpperCase().strip());
    }

    /* ==========================================================================
       History Operations
       ========================================================================== */
    @Transactional(readOnly = true)
    public List<AnalysisHistory> getHistory(Long userId) {
        return analysisHistoryRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    /* ==========================================================================
       Agent Analysis Orchestration
       ========================================================================== */
    public Optional<AnalysisResponse> getCachedAnalysis(Long userId, String symbol, String query) {
        String normalizedQuery = query.trim().toLowerCase();
        return analysisHistoryRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .filter(h -> h.getSymbol().equalsIgnoreCase(symbol) && h.getQuery().trim().toLowerCase().equals(normalizedQuery))
                .filter(h -> h.getCreatedAt().isAfter(LocalDateTime.now().minusMinutes(cacheMinutes)))
                .findFirst()
                .map(h -> {
                    try {
                        return objectMapper.readValue(h.getResponseJson(), AnalysisResponse.class);
                    } catch (Exception e) {
                        log.error("Failed to parse cached analysis JSON", e);
                        return null;
                    }
                });
    }

    public void triggerAnalysis(Long userId, String symbol, String query) {
        String normalizedSym = symbol.toUpperCase().strip();
        String normalizedQuery = query.trim();
        String key = normalizedSym + ":" + normalizedQuery.toLowerCase().hashCode();

        pendingAnalyses.computeIfAbsent(key, k -> {
            CompletableFuture<AnalysisResponse> future = fastAPIClient.fetchAnalysisAsync(normalizedSym, normalizedQuery)
                    .thenApply(response -> {
                        saveHistory(userId, normalizedSym, normalizedQuery, response);
                        saveMarketDataCache(normalizedSym, response.getMarket());
                        return response;
                    });
            future.whenComplete((res, err) -> pendingAnalyses.remove(k));
            return future;
        });
    }

    public AnalysisRefreshStatus pollAnalysisStatus(String symbol, String query) {
        String normalizedSym = symbol.toUpperCase().strip();
        String key = normalizedSym + ":" + query.trim().toLowerCase().hashCode();
        
        CompletableFuture<AnalysisResponse> future = pendingAnalyses.get(key);

        if (future == null) {
            // Not pending -- check database history for the fresh data
            return analysisHistoryRepository.findByUserIdOrderByCreatedAtDesc(0L).stream() // 0L represents fallback checking or fetch the latest record regardless
                    .filter(h -> h.getSymbol().equalsIgnoreCase(normalizedSym) && h.getQuery().equalsIgnoreCase(query.trim()))
                    .findFirst()
                    .map(h -> {
                        try {
                            AnalysisResponse data = objectMapper.readValue(h.getResponseJson(), AnalysisResponse.class);
                            return AnalysisRefreshStatus.done(data);
                        } catch (Exception e) {
                            return AnalysisRefreshStatus.failed("Failed to parse compiled report");
                        }
                    })
                    .orElse(AnalysisRefreshStatus.failed("No active compilation or cached report found"));
        }

        if (!future.isDone()) {
            return AnalysisRefreshStatus.inProgress();
        }

        try {
            return AnalysisRefreshStatus.done(future.get());
        } catch (Exception e) {
            return AnalysisRefreshStatus.failed(e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
        }
    }

    private void saveHistory(Long userId, String symbol, String query, AnalysisResponse response) {
        try {
            String json = objectMapper.writeValueAsString(response);
            AnalysisHistory record = new AnalysisHistory(userId, symbol, query, json);
            analysisHistoryRepository.save(record);
        } catch (Exception e) {
            log.error("Failed to persist analysis log to database", e);
        }
    }

    private void saveMarketDataCache(String symbol, AnalysisResponse.MarketDto market) {
        if (market == null) return;
        try {
            MarketDataCache cache = marketDataCacheRepository.findBySymbol(symbol).orElseGet(MarketDataCache::new);
            cache.setSymbol(symbol);
            cache.setPrice(market.getPrice());
            cache.setPriceChange(market.getChange());
            cache.setChangePercent(market.getChangePercent());
            cache.setLastUpdated(LocalDateTime.now());
            marketDataCacheRepository.save(cache);
        } catch (Exception e) {
            log.error("Failed to persist market price cache", e);
        }
    }

    public static class AnalysisRefreshStatus {
        public final String status; // IN_PROGRESS | DONE | FAILED
        public final AnalysisResponse data;
        public final String error;

        private AnalysisRefreshStatus(String status, AnalysisResponse data, String error) {
            this.status = status;
            this.data = data;
            this.error = error;
        }

        static AnalysisRefreshStatus inProgress() { return new AnalysisRefreshStatus("IN_PROGRESS", null, null); }
        static AnalysisRefreshStatus done(AnalysisResponse data) { return new AnalysisRefreshStatus("DONE", data, null); }
        static AnalysisRefreshStatus failed(String error) { return new AnalysisRefreshStatus("FAILED", null, error); }
    }

    /* ==========================================================================
       Legacy Sentiment Cache API Orchestration (Retained for widgets)
       ========================================================================== */
    public void triggerRefresh(String ticker) {
        String normalized = ticker.toUpperCase();

        pendingRefreshes.computeIfAbsent(normalized, t -> {
            CompletableFuture<SentimentResponse> future = refreshFromAi(t);
            future.whenComplete((res, err) -> pendingRefreshes.remove(t));
            return future;
        });
    }

    public RefreshStatus pollStatus(String ticker) {
        String normalized = ticker.toUpperCase();
        CompletableFuture<SentimentResponse> future = pendingRefreshes.get(normalized);

        if (future == null) {
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

    public Optional<SentimentResponse> getCachedIfFresh(String ticker) {
        return sentimentRepository.findByTicker(ticker.toUpperCase())
                .filter(row -> row.getLastUpdated() != null &&
                        row.getLastUpdated().isAfter(LocalDateTime.now().minusMinutes(cacheMinutes)))
                .map(row -> toResponse(row, "cache"));
    }

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
        StockSentiment entity = sentimentRepository.findByTicker(ticker).orElseGet(StockSentiment::new);

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

        sentimentRepository.save(entity);
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

    public static class RefreshStatus {
        public final String status;
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
}
