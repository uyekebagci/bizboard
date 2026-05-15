package com.bizboard.api.controller;

import com.bizboard.common.dto.BusinessNoteDto;
import com.bizboard.common.dto.CreateNoteRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BusinessNoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/businesses/{businessId}/notes")
@RequiredArgsConstructor
public class BusinessNoteController {

    private final BusinessNoteService noteService;

    @GetMapping
    public ResponseEntity<List<BusinessNoteDto>> getNotes(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(noteService.getNotesForBusiness(businessId, principal.getId(), principal.isAdmin()));
    }

    @PostMapping
    public ResponseEntity<BusinessNoteDto> createNote(
            @PathVariable UUID businessId,
            @Valid @RequestBody CreateNoteRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(noteService.createNote(businessId, request, principal.getId(), principal.isAdmin()));
    }

    @PutMapping("/{noteId}")
    public ResponseEntity<BusinessNoteDto> updateNote(
            @PathVariable UUID businessId,
            @PathVariable UUID noteId,
            @Valid @RequestBody CreateNoteRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(noteService.updateNote(noteId, request, principal.getId(), principal.isAdmin()));
    }

    @PatchMapping("/{noteId}/pin")
    public ResponseEntity<BusinessNoteDto> togglePin(
            @PathVariable UUID businessId,
            @PathVariable UUID noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(noteService.togglePin(noteId, principal.getId()));
    }

    @DeleteMapping("/{noteId}")
    public ResponseEntity<Void> deleteNote(
            @PathVariable UUID businessId,
            @PathVariable UUID noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.deleteNote(noteId, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
