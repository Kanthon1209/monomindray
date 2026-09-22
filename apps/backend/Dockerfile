# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/mindray /app/mindray.go

# Runtime stage
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/mindray /app/mindray
COPY --from=builder /app/etc /app/etc

EXPOSE 8080

CMD ["/app/mindray", "-f", "/app/etc/mindray-api.yaml"]
