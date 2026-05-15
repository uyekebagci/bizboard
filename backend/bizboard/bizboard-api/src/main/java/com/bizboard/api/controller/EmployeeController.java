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
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(employeeService.getEmployeesForBusiness(businessId, principal.getId()));
    }

    @GetMapping("/businesses/{businessId}/employees/summary")
    public ResponseEntity<EmployeeSummaryDto> getEmployeeSummary(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(employeeService.getEmployeeSummary(businessId, principal.getId()));
    }

    @PostMapping("/businesses/{businessId}/employees")
    public ResponseEntity<EmployeeDto> createEmployee(
            @PathVariable UUID businessId,
            @RequestBody CreateEmployeeRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(employeeService.createEmployee(businessId, request, principal.getId()));
    }

    // ─── Tekil personel işlemleri ─────────────────────────────

    @GetMapping("/employees/{employeeId}")
    public ResponseEntity<EmployeeDto> getEmployee(
            @PathVariable UUID employeeId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(employeeService.getEmployee(employeeId, principal.getId()));
    }

    @PutMapping("/employees/{employeeId}")
    public ResponseEntity<EmployeeDto> updateEmployee(
            @PathVariable UUID employeeId,
            @RequestBody CreateEmployeeRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(employeeService.updateEmployee(employeeId, request, principal.getId()));
    }

    @PatchMapping("/employees/{employeeId}/toggle-active")
    public ResponseEntity<EmployeeDto> toggleActive(
            @PathVariable UUID employeeId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(employeeService.toggleEmployeeActive(employeeId, principal.getId()));
    }

    @DeleteMapping("/employees/{employeeId}")
    public ResponseEntity<Void> deleteEmployee(
            @PathVariable UUID employeeId,
            @AuthenticationPrincipal UserPrincipal principal) {
        employeeService.deleteEmployee(employeeId, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
