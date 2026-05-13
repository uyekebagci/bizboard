# ============================================================================
# BizBoard Backend — multi-stage Dockerfile for Sevalla / any container PaaS.
#
# Build:   docker build -t bizboard-api:local backend/
# Run:     docker run --rm -p 8080:8080 -e SPRING_PROFILES_ACTIVE=prod ... bizboard-api:local
#
# Layers are ordered so dependency resolution is cached when only source code changes.
# ============================================================================

# ── 1) Build stage ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /src

# Pre-copy POMs for dependency caching (Maven wrapper is gitignored, not shipped).
COPY bizboard/pom.xml ./pom.xml
COPY bizboard/bizboard-common/pom.xml     bizboard-common/pom.xml
COPY bizboard/bizboard-repository/pom.xml bizboard-repository/pom.xml
COPY bizboard/bizboard-security/pom.xml   bizboard-security/pom.xml
COPY bizboard/bizboard-service/pom.xml    bizboard-service/pom.xml
COPY bizboard/bizboard-api/pom.xml        bizboard-api/pom.xml

# Use Maven from apt (image-installed). Spring Boot Maven plugin comes from parent POM.
RUN apt-get update && apt-get install -y --no-install-recommends maven && rm -rf /var/lib/apt/lists/*

# Warm dependency cache (no source yet → Maven downloads everything once).
RUN mvn -q -B dependency:go-offline -pl bizboard-api -am || true

# Now copy actual source code and build.
COPY bizboard/bizboard-common/src     bizboard-common/src
COPY bizboard/bizboard-repository/src bizboard-repository/src
COPY bizboard/bizboard-security/src   bizboard-security/src
COPY bizboard/bizboard-service/src    bizboard-service/src
COPY bizboard/bizboard-api/src        bizboard-api/src

RUN mvn -q -B -DskipTests package -pl bizboard-api -am

# Extract the fat-jar into Spring Boot layers for better container layer caching.
RUN mkdir -p /build/layers && \
    cp bizboard-api/target/bizboard-api-*.jar /build/app.jar && \
    cd /build/layers && \
    java -Djarmode=layertools -jar /build/app.jar extract


# ── 2) Runtime stage ────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy

# Useful tools for container probes (curl) + good defaults.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates tzdata && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --system --uid 1001 --home /app --shell /usr/sbin/nologin app

ENV TZ=Europe/Istanbul \
    LANG=C.UTF-8 \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:InitialRAMPercentage=50 -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/heap.hprof"

WORKDIR /app
USER 1001

# Spring Boot's layered jar — these copy commands keep deps in a separate
# image layer that rarely changes, so iteration on app code is fast.
COPY --chown=1001:0 --from=build /build/layers/dependencies/         ./
COPY --chown=1001:0 --from=build /build/layers/spring-boot-loader/   ./
COPY --chown=1001:0 --from=build /build/layers/snapshot-dependencies/ ./
COPY --chown=1001:0 --from=build /build/layers/application/          ./

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8080/actuator/health/liveness || exit 1

# Use the unpacked layered launcher.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
