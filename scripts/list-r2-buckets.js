/**
 * 列出所有 R2 存储桶
 *
 * 使用方法：node scripts/list-r2-buckets.js
 */

const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env.local') });

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

async function listBuckets() {
  try {
    console.log('\n========================================');
    console.log('  查询 R2 存储桶列表');
    console.log('========================================\n');

    const response = await r2Client.send(new ListBucketsCommand({}));

    if (!response.Buckets || response.Buckets.length === 0) {
      console.log('❌ 未找到任何 bucket');
      console.log('\n请在 Cloudflare Dashboard 中创建 bucket:');
      console.log('   https://dash.cloudflare.com/ → R2 Object Storage → Create bucket\n');
      return;
    }

    console.log(`✅ 找到 ${response.Buckets.length} 个 bucket:\n`);

    response.Buckets.forEach((bucket, index) => {
      console.log(`${index + 1}. ${bucket.Name}`);
      console.log(`   创建时间: ${bucket.CreationDate?.toISOString()}`);
      console.log('');
    });

    console.log('\n💡 使用建议:');
    console.log('   如果要使用已有的 bucket，请在 .env.local 中修改:');
    console.log('   R2_BUCKET_NAME=<your-bucket-name>\n');

  } catch (error) {
    console.error('\n❌ 查询失败:', error.message);

    if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
      console.error('\n可能原因:');
      console.error('   1. API Key 权限不足');
      console.error('   2. API Key 已过期或无效');
      console.error('   3. R2 Endpoint 配置错误\n');
      console.error('请检查 .env.local 中的 R2 配置。\n');
    }

    process.exit(1);
  }
}

listBuckets();
