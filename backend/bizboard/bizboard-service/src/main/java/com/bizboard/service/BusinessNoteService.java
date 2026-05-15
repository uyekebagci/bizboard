package com.bizboard.service;

import com.bizboard.common.dto.BusinessNoteDto;
import com.bizboard.common.dto.CreateNoteRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.BusinessNote;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessNoteRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class BusinessNoteService {

    private final BusinessNoteRepository noteRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public List<BusinessNoteDto> getNotesForBusiness(UUID businessId, UUID actorUserId, boolean isAdmin) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        List<BusinessNote> notes;
        if (isAdmin) {
            notes = noteRepository.findByBusinessIdOrderByPinnedDescCreatedAtDesc(businessId);
        } else {
            notes = noteRepository.findByBusinessIdAndAdminOnlyFalseOrderByPinnedDescCreatedAtDesc(businessId);
        }
        return notes.stream().map(this::toDto).toList();
    }

    @Transactional
    public BusinessNoteDto createNote(UUID businessId, CreateNoteRequest request, UUID userId, boolean isAdmin) {
        accessGuard.assertCanAccessBusiness(userId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // admin_only sadece admin tarafından ayarlanabilir, default olarak admin için true
        boolean adminOnly = false;
        if (isAdmin) {
            adminOnly = request.getAdminOnly() != null ? request.getAdminOnly() : true;
        }

        BusinessNote note = BusinessNote.builder()
                .business(business)
                .content(request.getContent())
                .pinned(request.getPinned() != null && request.getPinned())
                .color(request.getColor())
                .adminOnly(adminOnly)
                .createdBy(user)
                .build();

        note = noteRepository.save(note);
        log.info("Not olusturuldu: business={} user={}", business.getName(), user.getFullName());
        return toDto(note);
    }

    @Transactional
    public BusinessNoteDto updateNote(UUID noteId, CreateNoteRequest request, UUID actorUserId, boolean isAdmin) {
        BusinessNote note = noteRepository.findById(noteId)
                .orElseThrow(() -> new IllegalArgumentException("Not bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, note.getBusiness().getId());

        if (request.getContent() != null && !request.getContent().isBlank()) {
            note.setContent(request.getContent());
        }
        if (request.getPinned() != null) {
            note.setPinned(request.getPinned());
        }
        if (request.getColor() != null) {
            note.setColor(request.getColor());
        }
        if (isAdmin && request.getAdminOnly() != null) {
            note.setAdminOnly(request.getAdminOnly());
        }

        note = noteRepository.save(note);
        return toDto(note);
    }

    @Transactional
    public BusinessNoteDto togglePin(UUID noteId, UUID actorUserId) {
        BusinessNote note = noteRepository.findById(noteId)
                .orElseThrow(() -> new IllegalArgumentException("Not bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, note.getBusiness().getId());
        note.setPinned(!note.isPinned());
        note = noteRepository.save(note);
        return toDto(note);
    }

    @Transactional
    public void deleteNote(UUID noteId, UUID actorUserId) {
        BusinessNote note = noteRepository.findById(noteId)
                .orElseThrow(() -> new IllegalArgumentException("Not bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, note.getBusiness().getId());
        noteRepository.delete(note);
        log.info("Not silindi: id={}", noteId);
    }

    private BusinessNoteDto toDto(BusinessNote n) {
        return BusinessNoteDto.builder()
                .id(n.getId())
                .businessId(n.getBusiness().getId())
                .content(n.getContent())
                .pinned(n.isPinned())
                .color(n.getColor())
                .adminOnly(n.isAdminOnly())
                .createdByName(n.getCreatedBy() != null ? n.getCreatedBy().getFullName() : null)
                .createdAt(n.getCreatedAt())
                .updatedAt(n.getUpdatedAt())
                .build();
    }
}
