package com.bizboard.repository;

import com.bizboard.common.entity.PhoneDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface PhoneDeviceRepository extends JpaRepository<PhoneDevice, UUID> {

    List<PhoneDevice> findByBusinessIdOrderByDeviceNumberAsc(UUID businessId);

    List<PhoneDevice> findByBusinessIdAndActiveTrueOrderByDeviceNumberAsc(UUID businessId);

    /**
     * v1.6.23.20 (Security WP TODO 15b1dd12): multi-tenant filter — list endpoint
     * için. accessibleBusinessIds list'i ile birden çok tenant aynı anda gelir.
     */
    List<PhoneDevice> findByBusinessIdInOrderByDeviceNumberAsc(List<UUID> businessIds);

    List<PhoneDevice> findByBusinessIdInAndActiveTrueOrderByDeviceNumberAsc(List<UUID> businessIds);

    List<PhoneDevice> findByAssignedCounterpartIdOrderByDeviceNumberAsc(UUID counterpartId);

    @Query("SELECT COALESCE(MAX(p.deviceNumber), 0) FROM PhoneDevice p WHERE p.business.id = :businessId")
    int findMaxDeviceNumberByBusinessId(UUID businessId);

    /** Etiket (label) numarası önerisi için: işletmedeki max labelNo (null'lar hariç). */
    @Query("SELECT COALESCE(MAX(p.labelNo), 0) FROM PhoneDevice p WHERE p.business.id = :businessId")
    int findMaxLabelNoByBusinessId(UUID businessId);

    /** Soft-uniqueness uyarısı için: aynı işletmede aynı labelNo'ya sahip BAŞKA cihaz var mı. */
    boolean existsByBusinessIdAndLabelNoAndIdNot(UUID businessId, Integer labelNo, UUID id);

    long countByActiveTrue();
}
