package com.bizboard.security;

import com.bizboard.common.entity.User;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Getter
public class UserPrincipal implements UserDetails {

    private final UUID id;
    private final String username;
    private final String password;
    private final String fullName;
    private final String role;
    private final List<String> accessibleBusinesses;
    private final Collection<? extends GrantedAuthority> authorities;

    public UserPrincipal(User user) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.password = user.getPassword();
        this.fullName = user.getFullName();
        this.role = user.getRole() != null ? user.getRole() : "viewer";

        // Role -> Spring Security authority
        String springRole = "ROLE_" + this.role.toUpperCase(java.util.Locale.ENGLISH);
        this.authorities = List.of(new SimpleGrantedAuthority(springRole));

        String businesses = user.getAccessibleBusinesses();
        if (businesses != null && !businesses.isBlank()) {
            this.accessibleBusinesses = Arrays.stream(businesses.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();
        } else {
            this.accessibleBusinesses = Collections.emptyList();
        }
    }

    public boolean isAdmin() {
        return "admin".equalsIgnoreCase(role);
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
