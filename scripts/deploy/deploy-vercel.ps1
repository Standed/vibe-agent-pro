# Vercel 部署脚本 - 自动配置环境变量并部署
# 使用方法: .\scripts\deploy-vercel.ps1

Write-Host "🚀 开始配置 Vercel 环境变量..." -ForegroundColor Green

# 读取 .env.local 文件
$envFile = ".env.local"
if (!(Test-Path $envFile)) {
    Write-Host "❌ 错误: 找不到 .env.local 文件" -ForegroundColor Red
    exit 1
}

# 需要配置到 Vercel 的环境变量（排除 NEXT_PUBLIC_ 开头的，这些会自动处理）
$envVars = @(
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ENDPOINT",
    "GEMINI_API_KEY",
    "GEMINI_TEXT_API_KEY",
    "GEMINI_IMAGE_API_KEY",
    "GEMINI_AGENT_API_KEY",
    "GEMINI_STORYBOARD_MODEL",
    "GEMINI_AGENT_MODEL",
    "GEMINI_TEXT_MODEL",
    "GEMINI_ANALYZE_MODEL",
    "GEMINI_IMAGE_MODEL",
    "VOLCANO_API_KEY",
    "VOLCANO_BASE_URL",
    "SEEDREAM_MODEL_ID",
    "SEEDANCE_MODEL_ID",
    "DOUBAO_MODEL_ID"
)

Write-Host "📝 检测到需要配置的环境变量:" -ForegroundColor Cyan
$envVars | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }

Write-Host ""
Write-Host "⚠️  由于 Vercel CLI 限制，需要手动在 Dashboard 配置环境变量" -ForegroundColor Yellow
Write-Host ""
Write-Host "请按照以下步骤操作:" -ForegroundColor Cyan
Write-Host "1. 访问: https://vercel.com/william-shis-projects-b479c055/video-agent-pro/settings/environment-variables" -ForegroundColor White
Write-Host "2. 复制 VERCEL_ENV_CONFIG.md 文件中的所有环境变量" -ForegroundColor White
Write-Host "3. 在 Vercel 中逐个添加（Environment: Production, Preview, Development 全选）" -ForegroundColor White
Write-Host "4. 保存后，在 Deployments 页面点击 'Redeploy' 重新部署" -ForegroundColor White
Write-Host ""
Write-Host "📄 环境变量配置文件: VERCEL_ENV_CONFIG.md" -ForegroundColor Green
Write-Host ""

# 询问是否已经配置完成
$ready = Read-Host "是否已经在 Vercel Dashboard 配置完环境变量？(y/n)"

if ($ready -eq "y" -or $ready -eq "Y") {
    Write-Host ""
    Write-Host "🚀 开始部署到 Vercel..." -ForegroundColor Green
    vercel --prod

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ 部署成功！" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ 部署失败，请检查 Vercel Dashboard 的部署日志" -ForegroundColor Red
        Write-Host "📊 查看日志: https://vercel.com/william-shis-projects-b479c055/video-agent-pro" -ForegroundColor Cyan
    }
} else {
    Write-Host ""
    Write-Host "👍 请先配置完环境变量，然后重新运行此脚本" -ForegroundColor Yellow
}
