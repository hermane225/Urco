# Clean and reinstall node_modules
cd "c:/Users/hermane/mano/Urco/urco-backend"

Write-Host "Removing corrupted node_modules..."
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue

Write-Host "Removing package-lock.json..."
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue

Write-Host "Running fresh npm install..."
npm install

Write-Host "Running build..."
npm run build

