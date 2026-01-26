/**
 * 创建 Cloudflare R2 存储桶
 *
 * 使用方法：node scripts/create-r2-bucket.js
 */

const { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// 初始化 R2 客户端
const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function checkBucketExists() {
  try {
    await r2Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function createBucket() {
  try {
    console.log(`\n🔍 检查 bucket: ${BUCKET_NAME}`);

    const exists = await checkBucketExists();

    if (exists) {
      console.log(`✅ Bucket "${BUCKET_NAME}" 已存在，无需创建`);
      return;
    }

    console.log(`📦 创建 bucket: ${BUCKET_NAME}...`);

    await r2Client.send(new CreateBucketCommand({
      Bucket: BUCKET_NAME,
    }));

    console.log(`✅ Bucket "${BUCKET_NAME}" 创建成功！`);

    // 配置 CORS（允许浏览器访问）
    console.log(`\n🔧 配置 CORS 规则...`);

    await r2Client.send(new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));

    console.log(`✅ CORS 配置成功！`);
    console.log(`\n🎉 R2 存储桶已就绪，可以开始上传文件了！\n`);

  } catch (error) {
    console.error(`\n❌ 创建 bucket 失败:`, error.message);
    console.error(`\n详细信息:`, error);
    process.exit(1);
  }
}

// 验证配置
function validateConfig() {
  const missing = [];

  if (!BUCKET_NAME) missing.push('R2_BUCKET_NAME');
  if (!R2_ENDPOINT) missing.push('R2_ENDPOINT');
  if (!ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');

  if (missing.length > 0) {
    console.error(`\n❌ 缺少必要的环境变量:`);
    missing.forEach(key => console.error(`   - ${key}`));
    console.error(`\n请在 .env.local 文件中配置这些变量。\n`);
    process.exit(1);
  }
}

// 主函数
async function main() {
  console.log('\n========================================');
  console.log('  Cloudflare R2 存储桶创建工具');
  console.log('========================================\n');

  console.log('📋 当前配置:');
  console.log(`   Bucket: ${BUCKET_NAME}`);
  console.log(`   Endpoint: ${R2_ENDPOINT}`);
  console.log(`   Access Key: ${ACCESS_KEY_ID?.substring(0, 8)}...`);
  console.log('');

  validateConfig();
  await createBucket();
}

main();
