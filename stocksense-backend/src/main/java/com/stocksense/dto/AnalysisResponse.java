package com.stocksense.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public class AnalysisResponse {

    private String symbol;
    private String summary;
    private MarketDto market;
    private SentimentDto sentiment;
    private TechnicalDto technical;
    private List<NewsDto> news;

    @JsonProperty("key_drivers")
    private List<String> keyDrivers;

    private Double confidence;
    private String disclaimer;

    public AnalysisResponse() {
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public MarketDto getMarket() {
        return market;
    }

    public void setMarket(MarketDto market) {
        this.market = market;
    }

    public SentimentDto getSentiment() {
        return sentiment;
    }

    public void setSentiment(SentimentDto sentiment) {
        this.sentiment = sentiment;
    }

    public TechnicalDto getTechnical() {
        return technical;
    }

    public void setTechnical(TechnicalDto technical) {
        this.technical = technical;
    }

    public List<NewsDto> getNews() {
        return news;
    }

    public void setNews(List<NewsDto> news) {
        this.news = news;
    }

    public List<String> getKeyDrivers() {
        return keyDrivers;
    }

    public void setKeyDrivers(List<String> keyDrivers) {
        this.keyDrivers = keyDrivers;
    }

    public Double getConfidence() {
        return confidence;
    }

    public void setConfidence(Double confidence) {
        this.confidence = confidence;
    }

    public String getDisclaimer() {
        return disclaimer;
    }

    public void setDisclaimer(String disclaimer) {
        this.disclaimer = disclaimer;
    }

    // --- Inner DTOs ---

    public static class MarketDto {
        private Double price;
        private Double change;

        @JsonProperty("change_percent")
        private Double changePercent;

        public MarketDto() {
        }

        public Double getPrice() {
            return price;
        }

        public void setPrice(Double price) {
            this.price = price;
        }

        public Double getChange() {
            return change;
        }

        public void setChange(Double change) {
            this.change = change;
        }

        public Double getChangePercent() {
            return changePercent;
        }

        public void setChangePercent(Double changePercent) {
            this.changePercent = changePercent;
        }
    }

    public static class SentimentDto {
        private String label;
        private Double score;

        public SentimentDto() {
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

    public static class TechnicalDto {
        private Double rsi;
        private String trend;

        public TechnicalDto() {
        }

        public Double getRsi() {
            return rsi;
        }

        public void setRsi(Double rsi) {
            this.rsi = rsi;
        }

        public String getTrend() {
            return trend;
        }

        public void setTrend(String trend) {
            this.trend = trend;
        }
    }

    public static class NewsDto {
        private String title;
        private String source;

        @JsonProperty("published_at")
        private String publishedAt;

        private String url;

        public NewsDto() {
        }

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public String getSource() {
            return source;
        }

        public void setSource(String source) {
            this.source = source;
        }

        public String getPublishedAt() {
            return publishedAt;
        }

        public void setPublishedAt(String publishedAt) {
            this.publishedAt = publishedAt;
        }

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
        }
    }
}
