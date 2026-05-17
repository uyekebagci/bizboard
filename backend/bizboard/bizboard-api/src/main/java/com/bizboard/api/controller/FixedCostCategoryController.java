package com.bizboard.api.controller;

import com.bizboard.common.enums.FixedCostCategory;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v1.5.7: yeni işletme wizard adım 2'sinde kullanılan 12 standart sabit masraf
 * kategorisini frontend'e iletir. Read-only, authenticated.
 *
 * <p>Response shape: {@code [{ key, label, required }]} — frontend bunu
 * dropdown / liste olarak render eder. {@code required=true} olan 11 kategori
 * wizard'da zorunlu listede, OTHER serbest girişi temsil eder.</p>
 */
@RestController
@RequestMapping("/fixed-cost-categories")
@RequiredArgsConstructor
public class FixedCostCategoryController {

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (FixedCostCategory c : FixedCostCategory.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", c.name());
            row.put("label", c.getLabel());
            row.put("required", c.isRequiredInWizard());
            out.add(row);
        }
        return ResponseEntity.ok(out);
    }
}
