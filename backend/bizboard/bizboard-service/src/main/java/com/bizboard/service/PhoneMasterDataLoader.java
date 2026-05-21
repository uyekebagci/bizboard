package com.bizboard.service;

import com.bizboard.common.entity.PhoneBrand;
import com.bizboard.common.entity.PhoneModel;
import com.bizboard.repository.PhoneBrandRepository;
import com.bizboard.repository.PhoneModelRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * v1.6.23.12 (WP 3c8401f6 / TODO 9b1f01dc): Telefon marka+model master loader.
 *
 * <p>Source: {@code classpath:/data/phones-master.json}. Startup'ta diff
 * hesabıyla upsert eder; idempotent — değişiklik yoksa no-op.</p>
 *
 * <p>Politika:</p>
 * <ul>
 *   <li>JSON'da var DB'de yok → INSERT</li>
 *   <li>İkisinde de var ama sort_order/is_active farklı → UPDATE</li>
 *   <li>DB'de var JSON'da yok → {@code is_active=false} (soft removal; data
 *       integrity için kalır, FK referansları bozulmasın)</li>
 * </ul>
 *
 * <p>JSON validation: fail-fast. Parse hatası veya zorunlu field eksikse
 * exception fırlatır; startup başarısız olur.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PhoneMasterDataLoader {

    private static final String RESOURCE = "data/phones-master.json";

    private final PhoneBrandRepository brandRepository;
    private final PhoneModelRepository modelRepository;
    private final ObjectMapper objectMapper;

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            int newBrands = 0, updatedBrands = 0, deactivatedBrands = 0;
            int newModels = 0, updatedModels = 0, deactivatedModels = 0;

            JsonNode root;
            try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
                root = objectMapper.readTree(in);
            }

            JsonNode brandsArr = root.get("brands");
            if (brandsArr == null || !brandsArr.isArray()) {
                throw new IllegalStateException("phones-master.json: 'brands' array missing");
            }

            // ── BRANDS upsert ────────────────────────────────────
            Map<String, PhoneBrand> existingBrands = new HashMap<>();
            for (PhoneBrand b : brandRepository.findAll()) {
                existingBrands.put(b.getName().toLowerCase(), b);
            }
            Set<String> seenBrandNames = new HashSet<>();

            for (JsonNode brandNode : brandsArr) {
                String name = required(brandNode, "name").asText();
                String slug = brandNode.hasNonNull("slug") ? brandNode.get("slug").asText() : null;
                int sortOrder = brandNode.hasNonNull("sort_order") ? brandNode.get("sort_order").asInt() : 100;
                boolean active = !brandNode.hasNonNull("is_active") || brandNode.get("is_active").asBoolean();
                seenBrandNames.add(name.toLowerCase());

                PhoneBrand brand = existingBrands.get(name.toLowerCase());
                boolean changed = false;
                if (brand == null) {
                    brand = PhoneBrand.builder()
                            .name(name).slug(slug).sortOrder(sortOrder).active(active).build();
                    newBrands++;
                    changed = true;
                } else {
                    if (!java.util.Objects.equals(brand.getSlug(), slug)) { brand.setSlug(slug); changed = true; }
                    if (brand.getSortOrder() != sortOrder) { brand.setSortOrder(sortOrder); changed = true; }
                    if (brand.isActive() != active) { brand.setActive(active); changed = true; }
                    if (changed) updatedBrands++;
                }
                if (changed) brand = brandRepository.save(brand);

                // ── MODELS upsert under this brand ────────────────
                JsonNode modelsArr = brandNode.get("models");
                if (modelsArr != null && modelsArr.isArray()) {
                    Map<String, PhoneModel> existingModels = new HashMap<>();
                    for (PhoneModel m : modelRepository.findByBrandIdOrderByNameAsc(brand.getId())) {
                        existingModels.put(m.getName().toLowerCase(), m);
                    }
                    Set<String> seenModelNames = new HashSet<>();
                    for (JsonNode modelNode : modelsArr) {
                        String mName = required(modelNode, "name").asText();
                        Integer releaseYear = modelNode.hasNonNull("release_year")
                                ? modelNode.get("release_year").asInt() : null;
                        boolean mActive = !modelNode.hasNonNull("is_active") || modelNode.get("is_active").asBoolean();
                        seenModelNames.add(mName.toLowerCase());

                        PhoneModel model = existingModels.get(mName.toLowerCase());
                        boolean mChanged = false;
                        if (model == null) {
                            model = PhoneModel.builder()
                                    .brand(brand).name(mName)
                                    .releaseYear(releaseYear).active(mActive).build();
                            newModels++;
                            mChanged = true;
                        } else {
                            if (!java.util.Objects.equals(model.getReleaseYear(), releaseYear)) {
                                model.setReleaseYear(releaseYear); mChanged = true;
                            }
                            if (model.isActive() != mActive) {
                                model.setActive(mActive); mChanged = true;
                            }
                            if (mChanged) updatedModels++;
                        }
                        if (mChanged) modelRepository.save(model);
                    }
                    // Soft remove: JSON'da olmayan modeller is_active=false
                    for (Map.Entry<String, PhoneModel> e : existingModels.entrySet()) {
                        if (!seenModelNames.contains(e.getKey()) && e.getValue().isActive()) {
                            e.getValue().setActive(false);
                            modelRepository.save(e.getValue());
                            deactivatedModels++;
                        }
                    }
                }
            }
            // Brand soft remove
            for (Map.Entry<String, PhoneBrand> e : existingBrands.entrySet()) {
                if (!seenBrandNames.contains(e.getKey()) && e.getValue().isActive()) {
                    e.getValue().setActive(false);
                    brandRepository.save(e.getValue());
                    deactivatedBrands++;
                }
            }

            log.info("[phone-master-data] Loaded {} brands ({} new, {} updated, {} deactivated), "
                            + "{} models ({} new, {} updated, {} deactivated)",
                    brandsArr.size(), newBrands, updatedBrands, deactivatedBrands,
                    countModelsInJson(brandsArr), newModels, updatedModels, deactivatedModels);
        } catch (Exception e) {
            // Fail-fast: dataset bozuksa startup'ı durdur.
            throw new IllegalStateException("phones-master.json load failed: " + e.getMessage(), e);
        }
    }

    @Transactional
    public void reload() {
        onStartup();
    }

    private static JsonNode required(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            throw new IllegalStateException("phones-master.json: field '" + field + "' missing in " + node);
        }
        return v;
    }

    private static int countModelsInJson(JsonNode brandsArr) {
        int n = 0;
        for (JsonNode b : brandsArr) {
            JsonNode mArr = b.get("models");
            if (mArr != null && mArr.isArray()) n += mArr.size();
        }
        return n;
    }
}
