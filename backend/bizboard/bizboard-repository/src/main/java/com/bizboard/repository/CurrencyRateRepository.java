package com.bizboard.repository;

import com.bizboard.common.entity.CurrencyRate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** WP a9da4e9d: global kur cache erişimi (kod başına tek satır). */
public interface CurrencyRateRepository extends JpaRepository<CurrencyRate, UUID> {

    Optional<CurrencyRate> findByCode(String code);
}
