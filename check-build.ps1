if (Test-Path "c:/Users/hermane/mano/Urco/urco-backend/node_modules/.bin") {
    Write-Host "npm install completed"
    cd "c:/Users/hermane/mano/Urco/urco-backend"
    npm run build
} else {
    Write-Host "npm install still running..."
}

