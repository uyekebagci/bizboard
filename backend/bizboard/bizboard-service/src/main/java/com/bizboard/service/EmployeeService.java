package com.bizboard.service;

import com.bizboard.common.dto.CreateEmployeeRequest;
import com.bizboard.common.dto.EmployeeDto;
import com.bizboard.common.dto.EmployeeSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Employee;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.EmployeeRepository;
import com.bizboard.repository.FixedCostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final BusinessRepository businessRepository;
    private final FixedCostRepository fixedCostRepository;

    // ─── İşletmeye ait personelleri getir ───────────────────────

    @Transactional(readOnly = true)
    public List<EmployeeDto> getEmployeesForBusiness(UUID businessId) {
        return employeeRepository.findByBusinessIdOrderByFullNameAsc(businessId)
                .stream().map(this::toDto).toList();
    }

    // ─── Personel detayı ────────────────────────────────────────

    @Transactional(readOnly = true)
    public EmployeeDto getEmployee(UUID employeeId) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));
        return toDto(employee);
    }

    // ─── Personel oluştur ───────────────────────────────────────

    @Transactional
    public EmployeeDto createEmployee(UUID businessId, CreateEmployeeRequest request) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));

        Employee employee = Employee.builder()
                .business(business)
                .fullName(request.getFullName())
                .position(request.getPosition())
                .tcNo(request.getTcNo())
                .phone(request.getPhone())
                .salary(request.getSalary() != null ? request.getSalary() : BigDecimal.ZERO)
                .insuranceCost(request.getInsuranceCost() != null ? request.getInsuranceCost() : BigDecimal.ZERO)
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .notes(request.getNotes())
                .build();

        employee = employeeRepository.save(employee);
        log.info("Personel olusturuldu: {} - isletme={}", employee.getFullName(), business.getName());

        // Personel sabit giderini güncelle
        updatePersonnelFixedCost(businessId);

        return toDto(employee);
    }

    // ─── Personel güncelle ──────────────────────────────────────

    @Transactional
    public EmployeeDto updateEmployee(UUID employeeId, CreateEmployeeRequest request) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));

        if (request.getFullName() != null) employee.setFullName(request.getFullName());
        if (request.getPosition() != null) employee.setPosition(request.getPosition());
        if (request.getTcNo() != null) employee.setTcNo(request.getTcNo());
        if (request.getPhone() != null) employee.setPhone(request.getPhone());
        if (request.getSalary() != null) employee.setSalary(request.getSalary());
        if (request.getInsuranceCost() != null) employee.setInsuranceCost(request.getInsuranceCost());
        if (request.getStartDate() != null) employee.setStartDate(request.getStartDate());
        if (request.getEndDate() != null) employee.setEndDate(request.getEndDate());
        if (request.getNotes() != null) employee.setNotes(request.getNotes());

        employee = employeeRepository.save(employee);
        log.info("Personel guncellendi: {}", employee.getFullName());

        // Personel sabit giderini güncelle
        updatePersonnelFixedCost(employee.getBusiness().getId());

        return toDto(employee);
    }

    // ─── Personel aktif/pasif yap ───────────────────────────────

    @Transactional
    public EmployeeDto toggleEmployeeActive(UUID employeeId) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));

        employee.setActive(!employee.isActive());
        employee = employeeRepository.save(employee);
        log.info("Personel {} durumu: {}", employee.getFullName(), employee.isActive() ? "aktif" : "pasif");

        // Personel sabit giderini güncelle
        updatePersonnelFixedCost(employee.getBusiness().getId());

        return toDto(employee);
    }

    // ─── Personel sil ───────────────────────────────────────────

    @Transactional
    public void deleteEmployee(UUID employeeId) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));

        UUID businessId = employee.getBusiness().getId();
        employeeRepository.delete(employee);
        log.info("Personel silindi: {}", employee.getFullName());

        // Personel sabit giderini güncelle
        updatePersonnelFixedCost(businessId);
    }

    // ─── Personel özeti ─────────────────────────────────────────

    @Transactional(readOnly = true)
    public EmployeeSummaryDto getEmployeeSummary(UUID businessId) {
        List<Employee> employees = employeeRepository.findByBusinessIdOrderByFullNameAsc(businessId);

        int total = employees.size();
        int active = (int) employees.stream().filter(Employee::isActive).count();
        BigDecimal totalSalary = employees.stream()
                .filter(Employee::isActive)
                .map(Employee::getSalary)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalInsurance = employees.stream()
                .filter(Employee::isActive)
                .map(Employee::getInsuranceCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return EmployeeSummaryDto.builder()
                .totalEmployees(total)
                .activeEmployees(active)
                .totalSalary(totalSalary)
                .totalInsurance(totalInsurance)
                .totalCost(totalSalary.add(totalInsurance))
                .build();
    }

    // ─── Personel sabit giderini otomatik güncelle ──────────────

    private void updatePersonnelFixedCost(UUID businessId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));

        // Aktif personellerin toplam maliyetini hesapla
        List<Employee> activeEmployees = employeeRepository
                .findByBusinessIdAndActiveTrueOrderByFullNameAsc(businessId);

        BigDecimal totalPersonnelCost = activeEmployees.stream()
                .map(e -> e.getSalary().add(e.getInsuranceCost()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Mevcut PERSONNEL tipi sabit gideri bul veya oluştur
        List<FixedCost> personnelCosts = fixedCostRepository
                .findByBusinessIdAndTypeOrderByCreatedAtDesc(businessId, "PERSONNEL");

        if (personnelCosts.isEmpty()) {
            if (totalPersonnelCost.compareTo(BigDecimal.ZERO) > 0) {
                FixedCost fc = FixedCost.builder()
                        .business(business)
                        .name("Personel Gideri")
                        .type("PERSONNEL")
                        .amount(totalPersonnelCost)
                        .frequency("MONTHLY")
                        .auto(true)
                        .build();
                fixedCostRepository.save(fc);
                log.info("Personel sabit gideri olusturuldu: {} TL - isletme={}",
                        totalPersonnelCost, business.getName());
            }
        } else {
            FixedCost fc = personnelCosts.get(0);
            fc.setAmount(totalPersonnelCost);
            fixedCostRepository.save(fc);
            log.info("Personel sabit gideri guncellendi: {} TL - isletme={}",
                    totalPersonnelCost, business.getName());
        }
    }

    // ─── DTO Mapper ─────────────────────────────────────────────

    private EmployeeDto toDto(Employee e) {
        return EmployeeDto.builder()
                .id(e.getId())
                .businessId(e.getBusiness().getId())
                .businessName(e.getBusiness().getName())
                .fullName(e.getFullName())
                .position(e.getPosition())
                .tcNo(e.getTcNo())
                .phone(e.getPhone())
                .salary(e.getSalary())
                .insuranceCost(e.getInsuranceCost())
                .totalCost(e.getSalary().add(e.getInsuranceCost()))
                .startDate(e.getStartDate())
                .endDate(e.getEndDate())
                .active(e.isActive())
                .notes(e.getNotes())
                .createdAt(e.getCreatedAt())
                .updatedAt(e.getUpdatedAt())
                .build();
    }
}
