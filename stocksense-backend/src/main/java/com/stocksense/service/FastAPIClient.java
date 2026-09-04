package com.stocksense.service;

import com.stocksense.dto.AiSentimentResultDto;
import com.stocksense.dto.SentimentResponse;
import com.stocksense.dto.AnalysisRequest;
import com.stocksense.dto.AnalysisResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * Thin client around the FastAPI/FinBERT microservice. Keeps all
 * WebClient/reactive plumbing -- and the snake_case -> camelCase JSON
 * translation -- out of StockService so that class can stay focused on
 * caching + orchestration.
 */
@Service
public class FastAPIClient {

    private static final Logger log = LoggerFactory.getLogger(FastAPIClient.class);

    private final WebClient webClient;
    private final Executor aiTaskExecutor;

    public FastAPIClient(WebClient aiServiceWebClient,
                          @Qualifier("aiTaskExecutor") Executor aiTaskExecutor) {
        this.webClient = aiServiceWebClient;
        this.aiTaskExecutor = aiTaskExecutor;
    }

    /**
     * Calls GET /sentiment/{ticker} on the FastAPI worker asynchronously,
     * off the dedicated AI thread pool, so the calling Tomcat thread is
     * freed up immediately.
     */
    public CompletableFuture<SentimentResponse> fetchSentimentAsync(String ticker) {
        return CompletableFuture.supplyAsync(() -> fetchSentimentBlocking(ticker), aiTaskExecutor);
    }

    private SentimentResponse fetchSentimentBlocking(String ticker) {
        AiSentimentResultDto raw = webClient.get()
                .uri(uriBuilder -> uriBuilder.path("/sentiment/{ticker}").build(ticker))
                .retrieve()
                .bodyToMono(AiSentimentResultDto.class)
                .timeout(Duration.ofSeconds(30))
                .doOnError(err -> log.error("AI service call failed for {}: {}", ticker, err.getMessage()))
                .block();

        return toSentimentResponse(raw);
    }

    /**
     * Calls POST /api/ai/analyze on the FastAPI worker asynchronously
     * to execute the stateful AI research agent.
     */
    public CompletableFuture<AnalysisResponse> fetchAnalysisAsync(String symbol, String query) {
        return CompletableFuture.supplyAsync(() -> fetchAnalysisBlocking(symbol, query), aiTaskExecutor);
    }

    private AnalysisResponse fetchAnalysisBlocking(String symbol, String query) {
        AnalysisRequest body = new AnalysisRequest(symbol, query);
        
        return webClient.post()
                .uri("/api/ai/analyze")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(AnalysisResponse.class)
                .timeout(Duration.ofSeconds(45)) // Longer timeout since LLM synthesis can take time
                .doOnError(err -> log.error("AI agent analysis failed for {}: {}", symbol, err.getMessage()))
                .onErrorResume(err -> {
                    log.error("AI Agent connection error for {}. Graceful degradation fallback.", symbol);
                    return Mono.just(createFallbackResponse(symbol, query));
                })
                .block();
    }

    private SentimentResponse toSentimentResponse(AiSentimentResultDto raw) {
        if (raw == null) {
            throw new IllegalStateException("AI engine returned an empty response");
        }

        List<SentimentResponse.HeadlineDto> headlines = raw.getHeadlines() == null
                ? Collections.emptyList()
                : raw.getHeadlines().stream()
                        .map(h -> new SentimentResponse.HeadlineDto(h.getHeadline(), h.getLabel(), h.getScore(), h.getUrl()))
                        .collect(Collectors.toList());

        SentimentResponse response = new SentimentResponse();
        response.setTicker(raw.getTicker());
        response.setPositive(raw.getPositive());
        response.setNegative(raw.getNegative());
        response.setNeutral(raw.getNeutral());
        response.setOverallLabel(raw.getOverallLabel());
        response.setOverallScore(raw.getOverallScore());
        response.setHeadlineCount(raw.getHeadlineCount());
        response.setHeadlines(headlines);
        return response;
    }

    private AnalysisResponse createFallbackResponse(String symbol, String query) {
        AnalysisResponse response = new AnalysisResponse();
        response.setSymbol(symbol);
        response.setSummary("AI engine currently busy or unavailable. Displaying deterministic fallback profile.");
        
        AnalysisResponse.MarketDto m = new AnalysisResponse.MarketDto();
        m.setPrice(0.0);
        m.setChange(0.0);
        m.setChangePercent(0.0);
        response.setMarket(m);
        
        AnalysisResponse.SentimentDto s = new AnalysisResponse.SentimentDto();
        s.setLabel("neutral");
        s.setScore(0.0);
        response.setSentiment(s);
        
        AnalysisResponse.TechnicalDto t = new AnalysisResponse.TechnicalDto();
        t.setRsi(50.0);
        t.setTrend("neutral");
        response.setTechnical(t);
        
        response.setNews(Collections.emptyList());
        response.setKeyDrivers(List.of("Service connectivity error occurred. Data fetching offline."));
        response.setConfidence(0.0);
        response.setDisclaimer("Connection to FastAPI AI Orchestrator timed out. Please check logs.");
        return response;
    }
}
