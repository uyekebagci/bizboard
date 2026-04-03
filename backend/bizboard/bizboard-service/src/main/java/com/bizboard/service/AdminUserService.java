package com.bizboard.service;

import com.bizboard.common.dto.CreateUserRequest;
import com.bizboard.common.dto.UpdateUserRequest;
import com.bizboard.common.dto.UserDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminUserService {

    private final UserRepository userRepository;
    private final BusinessRepository businessRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserDto> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::toUserDto)
                .toList();
    }

    @Transactional
    public UserDto createUser(CreateUserRequest request) {
        // Username kontrolü
        if (userRepository.findByUsername(request.getUsername()).isPresent()) {
            throw new IllegalArgumentException("Bu kullanici adi zaten kullaniliyor");
        }

        // İşletme ID'lerini string olarak birleştir
        String businessIdsStr = request.getBusinessIds().stream()
                .map(UUID::toString)
                .collect(Collectors.joining(","));

        // Admin rolü için "all" ata
        if ("admin".equalsIgnoreCase(request.getRole())) {
            businessIdsStr = "all";
        }

        User user = User.builder()
                .username(request.getUsername())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role(request.getRole().toLowerCase(java.util.Locale.ENGLISH))
                .accessibleBusinesses(businessIdsStr)
                .onboardingCompleted(true)
                .active(true)
                .build();

        user = userRepository.save(user);
        return toUserDto(user);
    }

    @Transactional
    public UserDto updateUser(UUID userId, UpdateUserRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));

        if (request.getFullName() != null && !request.getFullName().isBlank()) {
            user.setFullName(request.getFullName());
        }

        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        if (request.getRole() != null) {
            user.setRole(request.getRole().toLowerCase(java.util.Locale.ENGLISH));
        }

        if (request.getBusinessIds() != null && !request.getBusinessIds().isEmpty()) {
            if ("admin".equalsIgnoreCase(request.getRole())) {
                user.setAccessibleBusinesses("all");
            } else {
                String businessIdsStr = request.getBusinessIds().stream()
                        .map(UUID::toString)
                        .collect(Collectors.joining(","));
                user.setAccessibleBusinesses(businessIdsStr);
            }
        }

        if (request.getActive() != null) {
            user.setActive(request.getActive());
        }

        user = userRepository.save(user);
        return toUserDto(user);
    }

    @Transactional
    public void deleteUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Kullanici bulunamadi"));

        if ("admin".equalsIgnoreCase(user.getRole())) {
            throw new IllegalArgumentException("Admin kullanici silinemez");
        }

        userRepository.delete(user);
    }

    private UserDto toUserDto(User user) {
        List<UUID> businessIds = new ArrayList<>();
        List<String> businessNames = new ArrayList<>();

        String accessible = user.getAccessibleBusinesses();
        if (accessible != null && !accessible.isBlank()) {
            if ("all".equalsIgnoreCase(accessible)) {
                List<Business> all = businessRepository.findAll();
                for (Business b : all) {
                    businessIds.add(b.getId());
                    businessNames.add(b.getName());
                }
            } else {
                List<UUID> ids = Arrays.stream(accessible.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .map(UUID::fromString)
                        .toList();
                List<Business> businesses = businessRepository.findAllById(ids);
                for (Business b : businesses) {
                    businessIds.add(b.getId());
                    businessNames.add(b.getName());
                }
            }
        }

        return UserDto.builder()
                .id(user.getId())
                .username(user.getUsername())
                .fullName(user.getFullName())
                .role(user.getRole())
                .active(user.isActive())
                .businessIds(businessIds)
                .businessNames(businessNames)
                .createdAt(user.getCreatedAt())
                .build();
    }
}
