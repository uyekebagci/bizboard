package com.bizboard.api.controller;

import com.bizboard.common.dto.BusinessTypeDto;
import com.bizboard.service.BusinessService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/business-types")
@RequiredArgsConstructor
public class BusinessTypeController {

    private final BusinessService businessService;

    @GetMapping
    public ResponseEntity<List<BusinessTypeDto>> getBusinessTypes() {
        return ResponseEntity.ok(businessService.getAllBusinessTypes());
    }
}
