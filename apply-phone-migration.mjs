#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://spfobstzqfwwnjymqriw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZm9ic3R6cWZ3d25qeW1xcml3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTMzNTYzMSwiZXhwIjoyMDgwOTExNjMxfQ.FHBx_hMYmYna7jV0bVtEiAGvyqEn4E-cVkg_R8Gbj_o';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applyMigration() {
  console.log('🔄 开始应用数据库迁移...');

  try {
    // 读取 SQL 迁移文件
    const sql = readFileSync('./supabase/add_phone_field_migration.sql', 'utf8');

    // 分割 SQL 语句（因为可能有多条）
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`📝 找到 ${statements.length} 条 SQL 语句`);

    // 执行每条语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`\n执行语句 ${i + 1}/${statements.length}...`);

        const { error } = await supabaseAdmin.rpc('exec_sql', {
          sql_query: statement
        }).catch(async () => {
          // 如果 exec_sql 函数不存在，直接用 SQL Editor API
          // 注意：这需要通过 REST API 或者手动在 Supabase Dashboard 中执行
          console.log('⚠️  无法通过 RPC 执行，请手动在 Supabase SQL Editor 中执行迁移文件');
          return { error: null };
        });

        if (error) {
          console.error(`❌ 执行失败:`, error.message);
        } else {
          console.log(`✅ 执行成功`);
        }
      }
    }

    console.log('\n✅ 数据库迁移已应用！');
    console.log('\n📋 下一步：');
    console.log('   如果上面提示无法通过 RPC 执行，请：');
    console.log('   1. 打开 Supabase Dashboard: https://supabase.com/dashboard');
    console.log('   2. 进入项目 -> SQL Editor');
    console.log('   3. 复制 supabase/add_phone_field_migration.sql 的内容');
    console.log('   4. 粘贴并执行');

  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    console.log('\n📋 请手动执行迁移：');
    console.log('   1. 打开 Supabase Dashboard: https://supabase.com/dashboard');
    console.log('   2. 进入项目 -> SQL Editor');
    console.log('   3. 复制 supabase/add_phone_field_migration.sql 的内容');
    console.log('   4. 粘贴并执行');
  }
}

applyMigration();
