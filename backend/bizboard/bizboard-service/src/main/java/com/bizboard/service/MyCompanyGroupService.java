package com.bizboard.service;

import com.bizboard.common.dto.CreateMyCompanyGroupRequest;
import com.bizboard.common.dto.MyCompanyGroupDto;
import com.bizboard.common.entity.MyCompanyGroup;
import com.bizboard.repository.MyCompanyGroupRepository;
import com.bizboard.repository.MyCompanyRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * v1.7.x WP 8b961444 TODO 729ce168: MyCompany (Firmalarım) grup CRUD.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MyCompanyGroupService {

    private final MyCompanyGroupRepository repository;
    private final MyCompanyRepository firmRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public List<MyCompanyGroupDto> list() {
        return repository.findAllByOrderByOrderIndexAscNameAsc().stream()
                .map(this::toDto).toList();
    }

    @Transactional
    public MyCompanyGroupDto create(CreateMyCompanyGroupRequest req, UUID actorUserId) {
        String name = req.getName() != null ? req.getName().trim() : "";
        if (name.isEmpty()) throw new IllegalArgumentException("Grup adı zorunlu");
        repository.findByName(name).ifPresent(g -> {
            throw new IllegalArgumentException("Bu isimde grup zaten var: " + name);
        });
        MyCompanyGroup g = MyCompanyGroup.builder()
                .name(name)
                .color(blank(req.getColor()))
                .icon(blank(req.getIcon()))
                .orderIndex(req.getOrderIndex() != null ? req.getOrderIndex() : 0)
                .createdBy(actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null)
                .build();
        g = repository.save(g);
        auditLogService.recordEntityAction(
                "MY_COMPANY_GROUP_CREATE",
                actorUserId, null,
                "MY_COMPANY_GROUP", g.getId(),
                "Firma grubu olusturuldu: " + g.getName(),
                java.util.Map.of("name", g.getName()));
        log.info("[my-company-group] created: {} (id={})", g.getName(), g.getId());
        return toDto(g);
    }

    @Transactional
    public MyCompanyGroupDto update(UUID id, CreateMyCompanyGroupRequest req, UUID actorUserId) {
        MyCompanyGroup g = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Grup bulunamadi"));
        if (req.getName() != null && !req.getName().trim().isEmpty()
                && !req.getName().trim().equals(g.getName())) {
            String newName = req.getName().trim();
            repository.findByName(newName).ifPresent(other -> {
                if (!other.getId().equals(id)) {
                    throw new IllegalArgumentException("Bu isimde grup zaten var: " + newName);
                }
            });
            g.setName(newName);
        }
        if (req.getColor() != null) g.setColor(blank(req.getColor()));
        if (req.getIcon() != null) g.setIcon(blank(req.getIcon()));
        if (req.getOrderIndex() != null) g.setOrderIndex(req.getOrderIndex());
        g = repository.save(g);
        auditLogService.recordEntityAction(
                "MY_COMPANY_GROUP_UPDATE",
                actorUserId, null,
                "MY_COMPANY_GROUP", g.getId(),
                "Firma grubu guncellendi: " + g.getName(),
                java.util.Map.of("name", g.getName()));
        return toDto(g);
    }

    @Transactional
    public void delete(UUID id, UUID actorUserId) {
        MyCompanyGroup g = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Grup bulunamadi"));
        String name = g.getName();
        // ON DELETE SET NULL DB seviyesi; JPA cascade yok — firms.group_id null'a düşer.
        repository.delete(g);
        auditLogService.recordEntityAction(
                "MY_COMPANY_GROUP_DELETE",
                actorUserId, null,
                "MY_COMPANY_GROUP", id,
                "Firma grubu silindi: " + name,
                java.util.Map.of("name", name));
        log.info("[my-company-group] deleted: {} (id={})", name, id);
    }

    private MyCompanyGroupDto toDto(MyCompanyGroup g) {
        int count = firmRepository.findByGroupIdOrderByLegalNameAsc(g.getId()).size();
        return MyCompanyGroupDto.builder()
                .id(g.getId())
                .name(g.getName())
                .color(g.getColor())
                .icon(g.getIcon())
                .orderIndex(g.getOrderIndex())
                .firmCount(count)
                .createdAt(g.getCreatedAt())
                .build();
    }

    private static String blank(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
