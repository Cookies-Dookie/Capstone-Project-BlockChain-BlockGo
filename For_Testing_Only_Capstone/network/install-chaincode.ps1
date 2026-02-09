# Chaincode Installation Helper Script with Retry Logic
# This script handles the Docker socket communication issues gracefully

param(
    [string]$ChaincodePath = "../chaincode",
    [string]$PeerContainer = "peer0.registrar.capstone.com",
    [string]$PackageName = "registrar.tar.gz",
    [int]$MaxRetries = 3,
    [int]$RetryDelay = 10
)

Write-Host "=== Hyperledger Fabric Chaincode Installation Helper ===" -ForegroundColor Cyan
Write-Host ""

# Function to check if Docker is running
function Test-DockerRunning {
    try {
        docker ps > $null 2>&1
        return $?
    } catch {
        return $false
    }
}

# Function to check if peer container is running
function Test-PeerRunning {
    param([string]$Container)
    
    $status = docker ps --filter "name=$Container" --format "{{.Status}}" 2>$null
    return ($status -and $status -match "Up")
}

# Function to restart peer container
function Restart-PeerContainer {
    param([string]$Container)
    
    Write-Host "Restarting peer container..." -ForegroundColor Yellow
    docker restart $Container > $null
    Start-Sleep -Seconds 8
    
    if (Test-PeerRunning -Container $Container) {
        Write-Host "Success - Peer container restarted successfully" -ForegroundColor Green
        return $true
    }
    return $false
}

# Function to build and package chaincode
function Build-Chaincode {
    param([string]$Path)
    
    Write-Host "Step 1: Building chaincode..." -ForegroundColor Cyan
    
    $chaincodePath = Resolve-Path $Path -ErrorAction SilentlyContinue
    if (-not $chaincodePath) {
        Write-Host "Error - Chaincode path not found: $Path" -ForegroundColor Red
        return $false
    }
    
    # Vendor dependencies and build
    Write-Host "  - Vendoring dependencies and building..." -ForegroundColor Gray
    $buildCmd = 'go mod vendor && GOOS=linux GOARCH=amd64 go build -o chaincode .'
    docker run --rm -v "${chaincodePath}:/app" -w /app golang:1.20-alpine sh -c $buildCmd 2>&1 | Out-Null
    
    if (-not $?) {
        Write-Host "Error - Failed to build chaincode" -ForegroundColor Red
        return $false
    }
    
    Write-Host "Success - Chaincode built successfully" -ForegroundColor Green
    
    # Package chaincode
    Write-Host "  - Packaging chaincode..." -ForegroundColor Gray
    docker run --rm -v "${chaincodePath}:/opt/gopath/src/github.com/chaincode" -w /opt/gopath/src/github.com/chaincode hyperledger/fabric-tools:latest peer lifecycle chaincode package $PackageName --path . --lang golang --label registrar_1.0 2>&1 | Out-Null
    
    if (-not $?) {
        Write-Host "Error - Failed to package chaincode" -ForegroundColor Red
        return $false
    }
    
    Write-Host "Success - Chaincode packaged successfully" -ForegroundColor Green
    return $true
}

# Function to install chaincode with retry logic
function Install-Chaincode {
    param(
        [string]$Container,
        [string]$Package,
        [string]$ChaincodePath,
        [int]$Retries
    )
    
    Write-Host ""
    Write-Host "Step 2: Installing chaincode on peer..." -ForegroundColor Cyan
    
    $packagePath = Join-Path (Resolve-Path $ChaincodePath) $Package
    
    for ($i = 1; $i -le $Retries; $i++) {
        Write-Host "  Attempt $i of $Retries..." -ForegroundColor Gray
        
        # Copy package to peer container
        docker cp $packagePath "${Container}:/tmp/$Package" 2>&1 | Out-Null
        
        if (-not $?) {
            Write-Host "  Error - Failed to copy package to container" -ForegroundColor Red
            continue
        }
        
        # Attempt installation
        $output = docker exec -e CORE_PEER_LOCALMSPID=Org1MSP -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/msp $Container peer lifecycle chaincode install "/tmp/$Package" 2>&1
        
        $exitCode = $LASTEXITCODE
        
        # Check for success
        if ($exitCode -eq 0 -and $output -match "Chaincode code package identifier") {
            Write-Host ""
            Write-Host "Success - Chaincode installed successfully!" -ForegroundColor Green
            Write-Host ""
            
            # Extract and display package ID
            $packageId = $output | Select-String -Pattern "Chaincode code package identifier: (.+)" | ForEach-Object { $_.Matches.Groups[1].Value }
            
            if ($packageId) {
                Write-Host "Package ID: $packageId" -ForegroundColor Cyan
                Write-Host ""
                Write-Host "Save this Package ID for the next steps!" -ForegroundColor Yellow
            }
            
            return $true
        }
        
        # Check for specific errors
        if ($output -match "broken pipe") {
            Write-Host "  Error - Docker socket communication error (broken pipe)" -ForegroundColor Red
            
            if ($i -lt $Retries) {
                Write-Host "  Attempting to restart peer container..." -ForegroundColor Yellow
                Restart-PeerContainer -Container $Container
                Start-Sleep -Seconds $RetryDelay
            }
        } elseif ($output -match "already installed") {
            Write-Host "  Warning - Chaincode already installed" -ForegroundColor Yellow
            return $true
        } else {
            Write-Host "  Error - Installation failed" -ForegroundColor Red
            Write-Host "  Details: $output" -ForegroundColor Red
        }
        
        if ($i -lt $Retries) {
            Write-Host "  Waiting $RetryDelay seconds before retry..." -ForegroundColor Gray
            Start-Sleep -Seconds $RetryDelay
        }
    }
    
    return $false
}

# Function to provide troubleshooting steps
function Show-TroubleshootingSteps {
    Write-Host ""
    Write-Host "=== Troubleshooting Steps ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Restart Docker Desktop:" -ForegroundColor White
    Write-Host "   - Right-click Docker Desktop icon and select Quit Docker Desktop" -ForegroundColor Gray
    Write-Host "   - Wait 30 seconds" -ForegroundColor Gray
    Write-Host "   - Start Docker Desktop again" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Increase Docker Resources (Settings -> Resources):" -ForegroundColor White
    Write-Host "   - Memory: 6-8 GB" -ForegroundColor Gray
    Write-Host "   - CPUs: 4+" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Restart WSL2 (if using WSL2 backend):" -ForegroundColor White
    Write-Host "   wsl --shutdown" -ForegroundColor Gray
    Write-Host "   Then restart Docker Desktop" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. Clean Docker system:" -ForegroundColor White
    Write-Host "   docker system prune -a" -ForegroundColor Gray
    Write-Host ""
}

# Main execution
try {
    # Check Docker
    if (-not (Test-DockerRunning)) {
        Write-Host "Error - Docker is not running. Please start Docker Desktop." -ForegroundColor Red
        exit 1
    }
    
    # Check peer container
    if (-not (Test-PeerRunning -Container $PeerContainer)) {
        Write-Host "Error - Peer container '$PeerContainer' is not running." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Success - Docker and peer container are running" -ForegroundColor Green
    Write-Host ""
    
    # Build and package chaincode
    if (-not (Build-Chaincode -Path $ChaincodePath)) {
        Write-Host ""
        Write-Host "Error - Failed to build chaincode. Please check the errors above." -ForegroundColor Red
        exit 1
    }
    
    # Install chaincode with retry logic
    $success = Install-Chaincode -Container $PeerContainer -Package $PackageName -ChaincodePath $ChaincodePath -Retries $MaxRetries
    
    if (-not $success) {
        Write-Host ""
        Write-Host "Error - Chaincode installation failed after $MaxRetries attempts" -ForegroundColor Red
        Show-TroubleshootingSteps
        exit 1
    }
    
    Write-Host "=== Next Steps ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Approve chaincode definition for your organization" -ForegroundColor White
    Write-Host "2. Commit chaincode definition to the channel" -ForegroundColor White
    Write-Host "3. Invoke/query chaincode functions" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "Error - Unexpected error occurred" -ForegroundColor Red
    Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Red
    Show-TroubleshootingSteps
    exit 1
}
