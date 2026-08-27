package com.stocksense.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Mirrors the exact JSON shape returned by the FastAPI /sentiment/{ticker}
 * endpoint (snake_case field names). Kept separate from SentimentResponse
 * (camelCase, used towards the browser) so each side of the API boundary
 * can evolve independently -- FastAPIClient is the only place that converts
 * between the two.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class AiSentimentResultDto {

    private String ticker;
    private Double positive;
    private Double negative;
    private Double neutral;

    @JsonProperty("overall_label")
    private String overallLabel;

    @JsonProperty("overall_score")
    private Double overallScore;

    @JsonProperty("headline_count")
    private Integer headlineCount;

    private List<HeadlineDto> headlines;

    public AiSentimentResultDto() {
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class HeadlineDto {
        private String headline;
        private String label;
        private Double score;
        private String url;

        public HeadlineDto() {
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

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
        }
    }
}
