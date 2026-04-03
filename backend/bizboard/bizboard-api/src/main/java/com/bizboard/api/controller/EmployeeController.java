package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateEmployeeRequest;
import com.bizboard.common.dto.EmployeeDto;
import com.bizboard.common.dto.EmployeeSummaryDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.EmployeeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;

    // ─── İşletmeye ait personeller ────────────────────────────

    @GetMapping("/businesses/{businessId}/employees")
    public ResponseEntity<List<EmployeeDto>> getEmployees(
            @PathVariable UUID businessId) {
        return ResponseEntity.ok(employeeService.getEmployeesForBusiness(businessId));
    }

    @GetMapping("/businesses/{businessId}/employees/summary")
    public ResponseEntity<EmployeeSummaryDto> getEmployeeSummary(
            @PathVariable UUID businessId) {
        return ResponseEntity.ok(employeeService.getEmployeeSummary(businessId));
    }

    @PostMapping("/businesses/{businessId}/employees")
    public ResponseEntity<EmployeeDto> createEmployee(
            @PathVariable UUID businessId,
            @RequestBody CreateEmployeeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(employeeService.createEmployee(businessId, request));
    }

    // ─── Tekil personel işlemleri ─────────────────────────────

    @GetMapping("/employees/{employeeId}")
    public ResponseEntity<EmployeeDto> getEmployee(
            @PathVariable UUID employeeId) {
        return ResponseEntity.ok(employeeService.getEmployee(employeeId));
    }

    @PutMapping("/employees/{employeeId}")
    public ResponseEntity<EmployeeDto> updateEmployee(
            @PathVariable UUID employeeId,
            @RequestBody CreateEmployeeRequest request) {
        return ResponseEntity.ok(employeeService.updateEmployee(employeeId, request));
    }

    @PatchMapping("/employees/{employeeId}/toggle-active")
    public ResponseEntity<EmployeeDto> toggleActive(
            @PathVariable UUID employeeId) {
        return ResponseEntity.ok(employeeService.toggleEmployeeActive(employeeId));
    }

    @DeleteMapping("/employees/{employeeId}")
    public ResponseEntity<Void> deleteEmployee(
            @PathVariable UUID employeeId) {
        employeeService.deleteEmployee(employeeId);
        return ResponseEntity.noContent().build();
    }
}
