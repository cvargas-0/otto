
all: build

tailwind-install:
	@if not exist tailwindcss.exe powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-windows-x64.exe' -OutFile 'tailwindcss.exe'"


build: tailwind-install
	@echo "Building..."
	@.\tailwindcss.exe -i web/assets/css/tailwind.css -o web/assets/css/styles.css
	@go build -o main.exe main.go

run:
	@go run main.go

clean:
	@echo "Cleaning..."
	@rm -f main

watch:
	@powershell -ExecutionPolicy Bypass -Command "if (Get-Command air -ErrorAction SilentlyContinue) { \
		air; \
		Write-Output 'Watching...'; \
	} else { \
		Write-Output 'Installing air...'; \
		go install github.com/air-verse/air@latest; \
		air; \
		Write-Output 'Watching...'; \
	}"

.PHONY: all build run clean watch tailwind-install