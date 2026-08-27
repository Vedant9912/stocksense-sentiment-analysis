package com.stocksense.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "stock_sentiment")
public class StockSentiment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 20)
    private String ticker;

    private Double positiveScore;
    private Double negativeScore;
    private Double neutralScore;

    @Column(length = 20)
    private String overallLabel;

    private Double overallScore; // -1.0 .. +1.0, used for the frontend gauge

    private Integer headlineCount;

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String headlinesJson; // raw FinBERT per-headline breakdown, stored as JSON text

    private LocalDateTime lastUpdated;

    public StockSentiment() {
    }

    public StockSentiment(Long id, String ticker, Double positiveScore, Double negativeScore, Double neutralScore,
                          String overallLabel, Double overallScore, Integer headlineCount, String headlinesJson,
                          LocalDateTime lastUpdated) {
        this.id = id;
        this.ticker = ticker;
        this.positiveScore = positiveScore;
        this.negativeScore = negativeScore;
        this.neutralScore = neutralScore;
        this.overallLabel = overallLabel;
        this.overallScore = overallScore;
        this.headlineCount = headlineCount;
        this.headlinesJson = headlinesJson;
        this.lastUpdated = lastUpdated;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTicker() {
        return ticker;
    }

    public void setTicker(String ticker) {
        this.ticker = ticker;
    }

    public Double getPositiveScore() {
        return positiveScore;
    }

    public void setPositiveScore(Double positiveScore) {
        this.positiveScore = positiveScore;
    }

    public Double getNegativeScore() {
        return negativeScore;
    }

    public void setNegativeScore(Double negativeScore) {
        this.negativeScore = negativeScore;
    }

    public Double getNeutralScore() {
        return neutralScore;
    }

    public void setNeutralScore(Double neutralScore) {
        this.neutralScore = neutralScore;
    }

    public String getOverallLabel() {
        return overallLabel;
    }

    public void setOverallLabel(String overallLabel) {
        this.overallLabel = overallLabel;
    }

    public Double getOverallScore() {
        return overallScore;
    }

    public void setOverallScore(Double overallScore) {
        this.overallScore = overallScore;
    }

    public Integer getHeadlineCount() {
        return headlineCount;
    }

    public void setHeadlineCount(Integer headlineCount) {
        this.headlineCount = headlineCount;
    }

    public String getHeadlinesJson() {
        return headlinesJson;
    }

    public void setHeadlinesJson(String headlinesJson) {
        this.headlinesJson = headlinesJson;
    }

    public LocalDateTime getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(LocalDateTime lastUpdated) {
        this.lastUpdated = lastUpdated;
    }
}
