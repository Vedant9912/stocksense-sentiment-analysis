package com.stocksense.repository;

import com.stocksense.entity.StockSentiment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StockSentimentRepository extends JpaRepository<StockSentiment, Long> {
    Optional<StockSentiment> findByTicker(String ticker);
}
