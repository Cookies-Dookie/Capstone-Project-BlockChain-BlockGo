FROM golang:1.23-alpine as builder

WORKDIR /chaincode

COPY . .

RUN go mod edit -go=1.23

RUN go mod tidy
RUN go mod vendor

RUN GOOS=linux GOARCH=amd64 go build -o registrar .

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /chaincode/registrar .

CMD ["./registrar"]