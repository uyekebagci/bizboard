package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CreateEmployeeRequest;
import com.bizboard.common.dto.EmployeeDto;
import com.bizboard.common.dto.EmployeeSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Employee;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.EmployeeRepository;
import com.bizboard.repository.FixedCostRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final BusinessRepository businessRepository;
    private final FixedCostRepository fixedCostRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final BusinessAccessGuard accessGuard;

    // ─── İşletmeye ait personelleri getir ───────────────────────

    @Transactional(readOnly = true)
    public List<EmployeeDto> getEmployeesForBusiness(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        return employeeRepository.findByBusinessIdOrderByFullNameAsc(businessId)
                .stream().map(this::toDto).toList();
    }

    // ─── Personel detayı ────────────────────────────────────────

    @Transactional(readOnly = true)
    public EmployeeDto getEmployee(UUID employeeId, UUID actorUserId) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, employee.getBusiness().getId());
        return toDto(employee);
    }

    // ─── Personel oluştur ───────────────────────────────────────

    @Transactional
    public EmployeeDto createEmployee(UUID businessId, CreateEmployeeRequest request, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
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

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.EMPLOYEE_CREATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "EMPLOYEE", employee.getId(),
                business.getName() + " — personel eklendi: " + employee.getFullName()
                        + " (" + (employee.getPosition() != null ? employee.getPosition() : "-") + ")",
                Map.of(
                        "businessId", businessId,
                        "fullName", employee.getFullName(),
                        "position", employee.getPosition() != null ? employee.getPosition() : "",
                        "salary", employee.getSalary(),
                        "insuranceCost", employee.getInsuranceCost()
                ));

        return toDto(employee);
    }

    // ─── Personel güncelle ──────────────────────────────────────

    @Transactional
    public EmployeeDto updateEmployee(UUID employeeId, CreateEmployeeRequest request, UUID actorUserId) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, employee.getBusiness().getId());

        Map<String, Object> changes = new HashMap<>();

        if (request.getFullName() != null && !Objects.equals(request.getFullName(), employee.getFullName())) {
            changes.put("fullName", Map.of("from", employee.getFullName(), "to", request.getFullName()));
            employee.setFullName(request.getFullName());
        }
        if (request.getPosition() != null && !Objects.equals(request.getPosition(), employee.getPosition())) {
            changes.put("position", Map.of(
                    "from", employee.getPosition() != null ? employee.getPosition() : "",
                    "to", request.getPosition()));
            employee.setPosition(request.getPosition());
        }
        if (request.getTcNo() != null && !Objects.equals(request.getTcNo(), employee.getTcNo())) {
            // TC kimlik no PII — diff'te değerleri tutmuyoruz, sadece değişti bayrağı.
            changes.put("tcNo", "changed");
            employee.setTcNo(request.getTcNo());
        }
        if (request.getPhone() != null && !Objects.equals(request.getPhone(), employee.getPhone())) {
            changes.put("phone", "changed");
            employee.setPhone(request.getPhone());
        }
        if (request.getSalary() != null && request.getSalary().compareTo(employee.getSalary()) != 0) {
            changes.put("salary", Map.of("from", employee.getSalary(), "to", request.getSalary()));
            employee.setSalary(request.getSalary());
        }
        if (request.getInsuranceCost() != null && request.getInsuranceCost().compareTo(employee.getInsuranceCost()) != 0) {
            changes.put("insuranceCost", Map.of("from", employee.getInsuranceCost(), "to", request.getInsuranceCost()));
            employee.setInsuranceCost(request.getInsuranceCost());
        }
        if (request.getStartDate() != null && !Objects.equals(request.getStartDate(), employee.getStartDate())) {
            changes.put("startDate", Map.of(
                    "from", employee.getStartDate() != null ? employee.getStartDate().toString() : "",
                    "to", request.getStartDate().toString()));
            employee.setStartDate(request.getStartDate());
        }
        if (request.getEndDate() != null && !Objects.equals(request.getEndDate(), employee.getEndDate())) {
            changes.put("endDate", Map.of(
                    "from", employee.getEndDate() != null ? employee.getEndDate().toString() : "",
                    "to", request.getEndDate().toString()));
            employee.setEndDate(request.getEndDate());
        }
        if (request.getNotes() != null && !Objects.equals(request.getNotes(), employee.getNotes())) {
            changes.put("notesUpdated", true);
            employee.setNotes(request.getNotes());
        }

        employee = employeeRepository.save(employee);
        log.info("Personel guncellendi: {} ({} alan)", employee.getFullName(), changes.size());

        // Personel sabit giderini güncelle
        updatePersonnelFixedCost(employee.getBusiness().getId());

        User actor = lookupActor(actorUserId);
        Map<String, Object> meta = new HashMap<>();
        meta.put("businessId", employee.getBusiness().getId());
        meta.put("changes", changes);
        meta.put("fieldsChanged", changes.size());
        auditLogService.recordEntityAction(
                AuditAction.EMPLOYEE_UPDATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "EMPLOYEE", employee.getId(),
                employee.getBusiness().getName() + " — personel guncellendi: " + employee.getFullName()
                        + " (" + changes.size() + " alan)",
                meta);

        return toDto(employee);
    }

    // ─── Personel aktif/pasif yap ───────────────────────────────

    @Transactional
    public EmployeeDto toggleEmployeeActive(UUID employeeId, UUID actorUserId) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, employee.getBusiness().getId());

        boolean wasActive = employee.isActive();
        employee.setActive(!wasActive);
        employee = employeeRepository.save(employee);
        log.info("Personel {} durumu: {}", employee.getFullName(), employee.isActive() ? "aktif" : "pasif");

        // Personel sabit giderini güncelle
        updatePersonnelFixedCost(employee.getBusiness().getId());

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.EMPLOYEE_UPDATE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "EMPLOYEE", employee.getId(),
                employee.getBusiness().getName() + " — personel " + (employee.isActive() ? "aktiflestirildi" : "pasiflestirildi")
                        + ": " + employee.getFullName(),
                Map.of(
                        "businessId", employee.getBusiness().getId(),
                        "active", Map.of("from", wasActive, "to", employee.isActive())
                ));

        return toDto(employee);
    }

    // ─── Personel sil ───────────────────────────────────────────

    @Transactional
    public void deleteEmployee(UUID employeeId, UUID actorUserId) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new IllegalArgumentException("Personel bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, employee.getBusiness().getId());

        UUID businessId = employee.getBusiness().getId();
        String businessName = employee.getBusiness().getName();
        String fullName = employee.getFullName();
        String position = employee.getPosition();
        BigDecimal salary = employee.getSalary();

        employeeRepository.delete(employee);
        log.info("Personel silindi: {}", fullName);

        // Personel sabit giderini güncelle
        updatePersonnelFixedCost(businessId);

        User actor = lookupActor(actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.EMPLOYEE_DELETE,
                actorUserId, actor != null ? actor.getUsername() : null,
                "EMPLOYEE", employeeId,
                businessName + " — personel silindi: " + fullName
                        + " (" + (position != null ? position : "-") + ")",
                Map.of(
                        "businessId", businessId,
                        "fullName", fullName,
                        "position", position != null ? position : "",
                        "salary", salary != null ? salary : BigDecimal.ZERO
                ));
    }

    // ─── Personel özeti ─────────────────────────────────────────

    @Transactional(readOnly = true)
    public EmployeeSummaryDto getEmployeeSummary(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
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

    private User lookupActor(UUID actorUserId) {
        if (actorUserId == null) return null;
        return userRepository.findById(actorUserId).orElse(null);
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
