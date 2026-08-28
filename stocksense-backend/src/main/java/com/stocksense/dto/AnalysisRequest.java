package com.stocksense.dto;

import jakarta.validation.constraints.NotBlank;

public class AnalysisRequest {

    @NotBlank(message = "Symbol is required")
    private String symbol;

    @NotBlank(message = "Query is required")
    private String query;

    public AnalysisRequest() {
    }

    public AnalysisRequest(String symbol, String query) {
        this.symbol = symbol;
        this.query = query;
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }
}
