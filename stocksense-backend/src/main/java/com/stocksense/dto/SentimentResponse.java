package com.stocksense.dto;

import java.util.List;

public class SentimentResponse {
    private String ticker;
    private Double positive;
    private Double negative;
    private Double neutral;
    private String overallLabel;
    private Double overallScore;
    private Integer headlineCount;
    private List<HeadlineDto> headlines;
    private String source;       // "cache" or "live"
    private String lastUpdated;  // ISO timestamp string

    public SentimentResponse() {
    }

    public SentimentResponse(String ticker, Double positive, Double negative, Double neutral,
                             String overallLabel, Double overallScore, Integer headlineCount,
                             List<HeadlineDto> headlines, String source, String lastUpdated) {
        this.ticker = ticker;
        this.positive = positive;
        this.negative = negative;
        this.neutral = neutral;
        this.overallLabel = overallLabel;
        this.overallScore = overallScore;
        this.headlineCount = headlineCount;
        this.headlines = headlines;
        this.source = source;
        this.lastUpdated = lastUpdated;
    }

    public String getTicker() {
        return ticker;
    }

    public void setTicker(String ticker) {
        this.ticker = ticker;
    }

    public Double getPositive() {
        return positive;
    }

    public void setPositive(Double positive) {
        this.positive = positive;
    }

    public Double getNegative() {
        return negative;
    }

    public void setNegative(Double negative) {
        this.negative = negative;
    }

    public Double getNeutral() {
        return neutral;
    }

    public void setNeutral(Double neutral) {
        this.neutral = neutral;
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

    public List<HeadlineDto> getHeadlines() {
        return headlines;
    }

    public void setHeadlines(List<HeadlineDto> headlines) {
        this.headlines = headlines;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(String lastUpdated) {
        this.lastUpdated = lastUpdated;
    }

    public static class HeadlineDto {
        private String headline;
        private String label;
        private Double score;

        public HeadlineDto() {
        }

        public HeadlineDto(String headline, String label, Double score) {
            this.headline = headline;
            this.label = label;
            this.score = score;
        }

        public String getHeadline() {
            return headline;
        }

        public void setHeadline(String headline) {
            this.headline = headline;
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public Double getScore() {
            return score;
        }

        public void setScore(Double score) {
            this.score = score;
        }
    }
}
