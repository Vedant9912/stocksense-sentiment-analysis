package com.stocksense.service;

import com.stocksense.dto.AiSentimentResultDto;
import com.stocksense.dto.SentimentResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

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
                .timeout(Duration.ofSeconds(20))
                .doOnError(err -> log.error("AI service call failed for {}: {}", ticker, err.getMessage()))
                .block();

        return toSentimentResponse(raw);
    }

    private SentimentResponse toSentimentResponse(AiSentimentResultDto raw) {
        if (raw == null) {
            throw new IllegalStateException("AI engine returned an empty response");
        }

        List<SentimentResponse.HeadlineDto> headlines = raw.getHeadlines() == null
                ? Collections.emptyList()
                : raw.getHeadlines().stream()
                        .map(h -> new SentimentResponse.HeadlineDto(h.getHeadline(), h.getLabel(), h.getScore()))
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
}
