# ---------- Build stage ----------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Copy pom.xml first so Docker caches downloaded dependencies
# separately from source code changes (much faster rebuilds).
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B clean package -DskipTests

# ---------- Runtime stage ----------
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Run as a non-root user
RUN useradd -ms /bin/bash spring
USER spring

COPY --from=build /app/target/*.jar app.jar

# Render injects $PORT at runtime; application.properties already reads it.
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
