package com.bizboard.service;

import com.bizboard.common.dto.ProfileDto;
import com.bizboard.common.entity.User;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    public ProfileDto getProfile(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        return DtoMapper.toProfileDto(user);
    }
}
