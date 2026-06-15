param(
    [string]$Message = "Update project"
)

$ErrorActionPreference = "Stop"

git status --short
git add -A

$pending = git diff --cached --name-only
if (-not $pending) {
    Write-Host "No changes to commit."
    exit 0
}

git commit -m $Message
git push
