#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://spfobstzqfwwnjymqriw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwZm9ic3R6cWZ3d25qeW1xcml3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTMzNTYzMSwiZXhwIjoyMDgwOTExNjMxfQ.FHBx_hMYmYna7jV0bVtEiAGvyqEn4E-cVkg_R8Gbj_o';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function fixAdmin() {
  const email = 'derushin5002@gmail.com';
  const userId = '1190ae1d-92db-46b0-82b7-d2b46cb6579a';

  try {
    console.log('🔄 修复管理员账号...');

    // 确认邮箱
    const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        email_confirm: true,
        banned: false,
      }
    );

    if (confirmError) {
      console.error('❌ 确认邮箱失败:', confirmError.message);
    } else {
      console.log('✅ 邮箱已确认');
    }

    console.log('✅ 修复完成！');
    console.log('');
    console.log('📝 现在可以登录:');
    console.log('   邮箱:', email);
    console.log('   密码: Xys20240408.');
    console.log('');
    console.log('🌐 登录地址: http://localhost:3000/auth/login');

  } catch (error) {
    console.error('❌ 发生错误:', error.message);
  }
}

fixAdmin();
