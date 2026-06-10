package com.bizboard.service.search;

import com.bizboard.common.dto.SaveSearchRequest;
import com.bizboard.common.dto.SavedSearchDto;
import com.bizboard.common.entity.SavedSearch;
import com.bizboard.repository.SavedSearchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — kayıtlı arama CRUD (spec §9.1, §10.4).
 *
 * <p><b>Tenant izolasyonu (T1):</b> her işlem {@code userId} ile sınırlı; başka
 * kullanıcının kaydına erişim {@code findByIdAndUserId} ile imkansız (boş → 404).</p>
 */
@Service
@RequiredArgsConstructor
public class SavedSearchService {

    private static final int MAX_PER_USER = 50;

    private final SavedSearchRepository repository;

    @Transactional(readOnly = true)
    public List<SavedSearchDto> list(UUID userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(SavedSearchDto::from)
                .toList();
    }

    @Transactional
    public SavedSearchDto create(UUID userId, SaveSearchRequest req) {
        if (repository.countByUserId(userId) >= MAX_PER_USER) {
            throw new IllegalStateException(
                    "En fazla " + MAX_PER_USER + " kayıtlı arama tutabilirsiniz.");
        }
        SavedSearch entity = SavedSearch.builder()
                .userId(userId)
                .name(req.getName().trim())
                .query(req.getQuery().trim())
                .filters(req.getFilters())
                .build();
        return SavedSearchDto.from(repository.save(entity));
    }

    @Transactional
    public SavedSearchDto update(UUID userId, UUID id, SaveSearchRequest req) {
        SavedSearch entity = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException(
                        "Kayıtlı arama bulunamadı"));
        if (req.getName() != null && !req.getName().isBlank()) entity.setName(req.getName().trim());
        if (req.getQuery() != null && !req.getQuery().isBlank()) entity.setQuery(req.getQuery().trim());
        if (req.getFilters() != null) entity.setFilters(req.getFilters());
        return SavedSearchDto.from(repository.save(entity));
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        SavedSearch entity = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException(
                        "Kayıtlı arama bulunamadı"));
        repository.delete(entity);
    }
}
