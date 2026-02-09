# Chaincode Invocation Helper Script for PowerShell
# Handles JSON escaping correctly for Hyperledger Fabric

param(
    [Parameter(Mandatory=$true)]
    [string]$Function,
    
    [Parameter(Mandatory=$false, ValueFromRemainingArguments=$true)]
    [string[]]$Args = @(),
    
    [Parameter(Mandatory=$false)]
    [string]$Channel = "registrar-channel",
    
    [Parameter(Mandatory=$false)]
    [string]$Chaincode = "registrar",
    
    [Parameter(Mandatory=$false)]
    [string]$Peer = "peer0.registrar.capstone.com:7051"
)

Write-Host "=== Hyperledger Fabric Chaincode Invocation ===" -ForegroundColor Cyan
Write-Host ""

# Build the Args array with Function first
$allArgs = @($Function)
if ($Args.Count -gt 0) {
    # Split comma-separated args if they come in as a single string
    foreach ($arg in $Args) {
        if ($arg -match ',') {
            $allArgs += $arg -split ','
        } else {
            $allArgs += $arg
        }
    }
}

# Manually build JSON array to ensure it's always an array
$jsonElements = $allArgs | ForEach-Object { "`"$($_.Trim())`"" }
$jsonArray = "[" + ($jsonElements -join ",") + "]"
$ctorJson = "{`"Args`":$jsonArray}"

Write-Host "Function: $Function" -ForegroundColor White
if ($Args.Count -gt 0) {
    Write-Host "Arguments: $($allArgs[1..($allArgs.Length-1)] -join ', ')" -ForegroundColor White
}
Write-Host "Channel: $Channel" -ForegroundColor White
Write-Host "Chaincode: $Chaincode" -ForegroundColor White
Write-Host ""
Write-Host "Constructor JSON: $ctorJson" -ForegroundColor Gray
Write-Host ""

# Execute the invoke command
Write-Host "Invoking chaincode..." -ForegroundColor Yellow

# Use splatting to make the command cleaner
$invokeArgs = @(
    "exec"
    "-e"
    "CORE_PEER_LOCALMSPID=Org1MSP"
    "-e"
    "CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/crypto-config/peerOrganizations/registrar.capstone.com/users/Admin@registrar.capstone.com/msp"
    "-e"
    "CORE_PEER_ADDRESS=$Peer"
    "fabric-tools"
    "peer"
    "chaincode"
    "invoke"
    "-o"
    "orderer.capstone.com:7050"
    "--tls"
    "true"
    "--cafile"
    "/etc/hyperledger/fabric/crypto-config/ordererOrganizations/capstone.com/orderers/orderer.capstone.com/tls/ca.crt"
    "-C"
    $Channel
    "-n"
    $Chaincode
    "-c"
    $ctorJson
)

& docker @invokeArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Success - Chaincode invoked successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Error - Chaincode invocation failed" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Example Usage ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Create a student:" -ForegroundColor White
Write-Host '  .\invoke-chaincode.ps1 -Function CreateStudent -Args "002","John Doe","Engineering"' -ForegroundColor Gray
Write-Host ""
Write-Host "Query a student:" -ForegroundColor White
Write-Host '  .\invoke-chaincode.ps1 -Function GetStudent -Args "001"' -ForegroundColor Gray
Write-Host ""
Write-Host "Update a student:" -ForegroundColor White
Write-Host '  .\invoke-chaincode.ps1 -Function UpdateStudent -Args "001","Updated Name","Updated Department"' -ForegroundColor Gray
Write-Host ""
