package com.bizboard.repository;

import com.bizboard.common.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    Optional<User> findByUsername(String username);

    /** v1.6.19 (WP-2): Cron bildirim hedef seçimi (case-insensitive 'admin'). */
    java.util.List<User> findByRoleIgnoreCase(String role);
}
