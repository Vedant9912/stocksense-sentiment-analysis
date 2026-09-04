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

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class MarketDto {
        private Double price;
        private Double change;

        @JsonProperty("change_percent")
        private Double changePercent;

        private String currency;

        @JsonProperty("resolved_symbol")
        private String resolvedSymbol;

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

        public String getCurrency() {
            return currency;
        }

        public void setCurrency(String currency) {
            this.currency = currency;
        }

        public String getResolvedSymbol() {
            return resolvedSymbol;
        }

        public void setResolvedSymbol(String resolvedSymbol) {
            this.resolvedSymbol = resolvedSymbol;
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

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class TechnicalDto {
        private Double rsi;
        private String trend;

        @JsonProperty("sma_20")
        private Double sma20;

        @JsonProperty("sma_50")
        private Double sma50;

        @JsonProperty("ema_20")
        private Double ema20;

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

        public Double getSma20() {
            return sma20;
        }

        public void setSma20(Double sma20) {
            this.sma20 = sma20;
        }

        public Double getSma50() {
            return sma50;
        }

        public void setSma50(Double sma50) {
            this.sma50 = sma50;
        }

        public Double getEma20() {
            return ema20;
        }

        public void setEma20(Double ema20) {
            this.ema20 = ema20;
        }
    }

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class NewsDto {
        private String title;
        private String source;

        @JsonProperty("published_at")
        private String publishedAt;

        private String url;
        private String label;
        private Double score;

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
