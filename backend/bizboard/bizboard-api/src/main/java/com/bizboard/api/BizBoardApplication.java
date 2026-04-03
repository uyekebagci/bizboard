package com.bizboard.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.bizboard")
@EntityScan(basePackages = "com.bizboard.common.entity")
@EnableJpaRepositories(basePackages = "com.bizboard.repository")
@EnableScheduling
public class BizBoardApplication {

    public static void main(String[] args) {
        SpringApplication.run(BizBoardApplication.class, args);
    }
}
