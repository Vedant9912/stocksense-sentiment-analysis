package com.stocksense.repository;

import com.stocksense.entity.MarketDataCache;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface MarketDataCacheRepository extends JpaRepository<MarketDataCache, Long> {
    Optional<MarketDataCache> findBySymbol(String symbol);
}
