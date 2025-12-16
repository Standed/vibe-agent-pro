# 积分系统文档

> Video Agent Pro 的积分消耗与管理系统

---

## 📋 系统概览

Video Agent Pro 使用**积分系统**来管理 AI 服务的使用，确保资源合理分配。

### 核心特性

- ✅ **统一积分配置** - 所有操作的积分消耗集中管理
- ✅ **环境变量覆盖** - 灵活调整积分策略
- ✅ **角色差异化定价** - admin 免费，vip 8 折，user 原价
- ✅ **原子性消耗** - 数据库事务保证一致性
- ✅ **交易记录** - 完整的积分消耗历史
- ✅ **不足拦截** - API 层级的积分检查

---

## 💰 积分配置

### 默认积分价格表

**文件位置**: `src/config/credits.ts`

```typescript
export const CREDITS_CONFIG = {
  // Gemini 系列
  GEMINI_GRID_2X2: 5,        // 2x2 Grid 生成 (4 个视图)
  GEMINI_GRID_3X3: 10,       // 3x3 Grid 生成 (9 个视图)
  GEMINI_GRID_2X3: 8,        // 2x3 Grid 生成 (6 个视图)
  GEMINI_GRID_3X2: 8,        // 3x2 Grid 生成 (6 个视图)
  GEMINI_IMAGE: 8,           // 单张图片生成
  GEMINI_TEXT: 2,            // 文本生成 (聊天、剧本等)
  GEMINI_ANALYZE: 3,         // 图片分析
  GEMINI_EDIT: 5,            // 图片编辑

  // SeeDream 系列
  SEEDREAM_GENERATE: 12,     // SeeDream 图片生成
  SEEDREAM_EDIT: 10,         // SeeDream 图片编辑

  // 火山引擎系列
  VOLCANO_GENERATE: 12,      // 火山引擎图片生成
  VOLCANO_VIDEO: 50,         // 视频生成 (较贵)

  // 其他操作
  UPLOAD_PROCESS: 1,         // 图片上传处理
  BATCH_OPERATION: 5,        // 批量操作基础费用
};
```

### 环境变量覆盖

**支持通过环境变量动态调整价格**：

```env
# .env.local

# 调整 Grid 生成价格
CREDITS_GEMINI_GRID_2X2=3        # 降价：5 → 3
CREDITS_GEMINI_GRID_3X3=15       # 涨价：10 → 15

# 调整视频生成价格
CREDITS_VOLCANO_VIDEO=40         # 降价：50 → 40

# 调整文本生成价格
CREDITS_GEMINI_TEXT=1            # 降价：2 → 1

# VIP 折扣率（默认 0.8 = 8折）
VIP_DISCOUNT_RATE=0.7            # 改为 7 折

# 管理员免费（默认 true）
ADMIN_FREE=true
```

**加载逻辑**：

```typescript
// src/config/credits.ts
function loadCreditsConfig() {
  const config = { ...DEFAULT_CREDITS_CONFIG };

  // 遍历所有配置项，检查环境变量
  for (const key of Object.keys(config)) {
    const envKey = `CREDITS_${key}`;
    const envValue = process.env[envKey] || process.env[`NEXT_PUBLIC_${envKey}`];

    if (envValue) {
      const numValue = parseInt(envValue, 10);
      if (!isNaN(numValue) && numValue >= 0) {
        config[key] = numValue;
        console.log(`[Credits Config] ✅ 从环境变量覆盖: ${key} = ${numValue}`);
      }
    }
  }

  return config;
}

export const CREDITS_CONFIG = loadCreditsConfig();
```

---

## 👥 角色定价策略

### 角色定义

```typescript
export type UserRole = 'admin' | 'vip' | 'user';
```

| 角色 | 定价策略 | 初始积分 | 说明 |
|------|---------|---------|------|
| **admin** | 免费 (0 积分) | 999,999 | 管理员，所有操作免费 |
| **vip** | 8 折 | 500 | VIP 用户，所有操作 80% 价格 |
| **user** | 原价 | 100 | 普通用户，标准价格 |

### 实际价格计算

```typescript
// src/config/credits.ts
export function calculateCredits(
  operation: keyof typeof CREDITS_CONFIG,
  userRole: 'user' | 'admin' | 'vip'
): number {
  const baseCost = CREDITS_CONFIG[operation];

  // 管理员免费
  if (userRole === 'admin' && ADMIN_FREE) {
    return 0;
  }

  // VIP 用户打折
  if (userRole === 'vip') {
    return Math.ceil(baseCost * VIP_DISCOUNT_RATE);
  }

  // 普通用户原价
  return baseCost;
}
```

**示例计算**：

```typescript
// Gemini 3x3 Grid 生成（默认 10 积分）

calculateCredits('GEMINI_GRID_3X3', 'admin');  // → 0 积分（免费）
calculateCredits('GEMINI_GRID_3X3', 'vip');    // → 8 积分（10 * 0.8）
calculateCredits('GEMINI_GRID_3X3', 'user');   // → 10 积分（原价）

// Volcano 视频生成（默认 50 积分）

calculateCredits('VOLCANO_VIDEO', 'admin');    // → 0 积分（免费）
calculateCredits('VOLCANO_VIDEO', 'vip');      // → 40 积分（50 * 0.8）
calculateCredits('VOLCANO_VIDEO', 'user');     // → 50 积分（原价）
```

---

## 🔒 积分消耗流程

### API Route 标准流程

**所有 AI API 都遵循相同的流程**：

```typescript
// src/app/api/gemini-grid/route.ts
import {
  authenticateRequest,
  checkCredits,
  consumeCredits,
} from '@/lib/auth-middleware';
import { calculateCredits } from '@/config/credits';

export async function POST(request: NextRequest) {
  try {
    // ========== Step 1: 验证用户身份 ==========
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) {
      return authResult.error; // 401 Unauthorized
    }

    const { user } = authResult;
    // user = { id, email, role, credits }

    // ========== Step 2: 计算实际积分消耗 ==========
    const requiredCredits = calculateCredits('GEMINI_GRID_3X3', user.role);
    // admin → 0, vip → 8, user → 10

    // ========== Step 3: 检查积分是否足够 ==========
    const creditsCheck = checkCredits(user, requiredCredits);
    if (!creditsCheck.success) {
      return creditsCheck.error; // 403 Forbidden: 积分不足
    }

    // ========== Step 4: 执行 AI 操作 ==========
    const result = await generateGrid(prompt, gridRows, gridCols);

    // ========== Step 5: 消耗积分 ==========
    await consumeCredits(
      user.id,
      requiredCredits,
      'generate-grid',      // 操作类型
      'Gemini Grid 生成'    // 描述（可选）
    );

    // ========== Step 6: 返回结果 ==========
    return NextResponse.json({ fullImage: result });

  } catch (error: any) {
    console.error('Grid generation error:', error);
    return NextResponse.json(
      { error: error.message || '生成失败' },
      { status: 500 }
    );
  }
}
```

### 积分检查

```typescript
// src/lib/auth-middleware.ts
export function checkCredits(
  user: AuthenticatedUser,
  requiredCredits: number
): { success: true } | { error: NextResponse } {
  if (user.credits < requiredCredits) {
    return {
      error: NextResponse.json(
        {
          error: `积分不足，需要 ${requiredCredits} 积分，当前仅有 ${user.credits} 积分`,
          currentCredits: user.credits,
          requiredCredits,
        },
        { status: 403 }
      ),
    };
  }

  return { success: true };
}
```

### 积分消耗（原子性操作）

```typescript
// src/lib/auth-middleware.ts
export async function consumeCredits(
  userId: string,
  amount: number,
  operationType: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 调用数据库 RPC 函数（原子性操作）
    const { data, error } = await supabaseAdmin.rpc('consume_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: operationType,
      p_description: description || null,
    });

    if (error) {
      console.error('Failed to consume credits:', error);
      return { success: false, error: error.message };
    }

    const result = data as any;
    if (!result?.success) {
      return { success: false, error: result?.error || '积分消耗失败' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception in consumeCredits:', error);
    return { success: false, error: error.message };
  }
}
```

---

## 🗄️ 数据库实现

### consume_credits() 函数

**原子性事务，防止并发问题**：

```sql
-- supabase/schema.sql
CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation_type TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_current_credits INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 1. 锁定用户行，防止并发修改
  SELECT credits INTO v_current_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- 2. 检查用户是否存在
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '用户不存在'
    );
  END IF;

  -- 3. 检查积分是否足够
  IF v_current_credits < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '积分不足',
      'current_credits', v_current_credits,
      'required_credits', p_amount
    );
  END IF;

  -- 4. 扣除积分
  UPDATE profiles
  SET credits = credits - p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 5. 记录交易
  INSERT INTO credit_transactions (
    user_id,
    amount,
    operation_type,
    description,
    created_at
  ) VALUES (
    p_user_id,
    -p_amount,  -- 负数表示消耗
    p_operation_type,
    p_description,
    NOW()
  ) RETURNING id INTO v_transaction_id;

  -- 6. 返回成功
  RETURN jsonb_build_object(
    'success', true,
    'credits_after', v_current_credits - p_amount,
    'amount_consumed', p_amount,
    'transaction_id', v_transaction_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### profiles 表

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'vip')),
  credits INTEGER NOT NULL DEFAULT 100,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
```

### credit_transactions 表

```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,  -- 正数=充值，负数=消耗
  operation_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
```

---

## 📊 积分查询

### 获取用户积分余额

```typescript
// src/lib/supabase/credits.ts
export async function getUserCredits(): Promise<number> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return 0;
    }

    const { data } = await supabase.rpc('get_user_credits', {
      p_user_id: user.id,
    });

    return data || 0;
  } catch (error) {
    console.error('Get user credits error:', error);
    return 0;
  }
}
```

**数据库函数**：

```sql
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  SELECT credits INTO v_credits
  FROM profiles
  WHERE id = p_user_id;

  RETURN COALESCE(v_credits, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 获取交易历史

```typescript
// src/lib/supabase/credits.ts
export async function getCreditTransactions(limit = 50) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { data: [], error: new Error('Not authenticated') };
    }

    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    return { data: data || [], error };
  } catch (error) {
    return { data: [], error };
  }
}
```

---

## 🎁 积分充值

### 手动充值（管理员操作）

```sql
-- 直接更新用户积分
UPDATE profiles
SET credits = credits + 1000,
    updated_at = NOW()
WHERE email = 'user@example.com';

-- 记录充值交易
INSERT INTO credit_transactions (user_id, amount, operation_type, description)
VALUES (
  (SELECT id FROM profiles WHERE email = 'user@example.com'),
  1000,
  'manual_recharge',
  '管理员手动充值'
);
```

### 自动充值（支付回调）

```typescript
// 未来实现：支付成功回调
export async function handlePaymentSuccess(userId: string, amount: number, orderId: string) {
  // 1. 验证支付订单
  const orderValid = await verifyPaymentOrder(orderId);
  if (!orderValid) {
    throw new Error('订单验证失败');
  }

  // 2. 充值积分
  await supabaseAdmin
    .from('profiles')
    .update({ credits: supabase.raw(`credits + ${amount}`) })
    .eq('id', userId);

  // 3. 记录交易
  await supabaseAdmin.from('credit_transactions').insert({
    user_id: userId,
    amount,
    operation_type: 'payment_recharge',
    description: `支付充值 - 订单号: ${orderId}`,
  });
}
```

---

## 🔧 配置示例

### 降低价格（促销）

```env
# .env.local - 双十一促销
CREDITS_GEMINI_GRID_3X3=7        # 10 → 7 (7折)
CREDITS_VOLCANO_VIDEO=35         # 50 → 35 (7折)
VIP_DISCOUNT_RATE=0.6            # VIP 额外 6 折
```

### 提高价格（控制成本）

```env
# .env.local - 成本上涨
CREDITS_GEMINI_GRID_3X3=15       # 10 → 15
CREDITS_VOLCANO_VIDEO=80         # 50 → 80
VIP_DISCOUNT_RATE=0.9            # VIP 9 折
```

### 管理员付费模式

```env
# .env.local - 所有人都付费
ADMIN_FREE=false
```

---

## 📈 积分策略建议

### 定价策略

1. **Grid 生成**: 按视图数量定价
   - 2x2 (4 视图) → 5 积分
   - 3x3 (9 视图) → 10 积分

2. **视频生成**: 高价策略（成本高）
   - 50 积分/视频

3. **文本生成**: 低价策略（鼓励使用）
   - 2 积分/次

### 角色策略

1. **admin**: 完全免费（内部测试）
2. **vip**: 8 折优惠（付费用户）
3. **user**: 原价（免费用户）

### 初始积分

1. **admin**: 999,999（无限制）
2. **vip**: 500（试用后付费）
3. **user**: 100（体验后升级）

---

## 🐛 常见问题

### 1. 积分扣除失败

**原因**: 并发请求导致数据不一致

**解决**: `consume_credits()` 使用 `FOR UPDATE` 锁行，确保原子性

### 2. 积分余额不更新

**原因**: 前端缓存了旧的积分余额

**解决**: 每次操作后重新查询积分

```typescript
// 操作后刷新积分
await generateGrid(...);
const newCredits = await getUserCredits();
setCredits(newCredits);
```

### 3. VIP 折扣未生效

**原因**: `calculateCredits()` 未正确传递 `userRole`

**解决**: 确保从 `authenticateRequest()` 获取正确的 `user.role`

```typescript
const { user } = await authenticateRequest(request);
const requiredCredits = calculateCredits('GEMINI_GRID_3X3', user.role);
```

### 4. 管理员仍被扣积分

**原因**: `ADMIN_FREE` 设置为 `false`

**解决**: 检查环境变量

```env
ADMIN_FREE=true  # 或 NEXT_PUBLIC_ADMIN_FREE=true
```

---

## 📚 相关文档

- **认证系统**: [AUTHENTICATION.md](./AUTHENTICATION.md) - 角色权限管理
- **API 架构**: [API_ARCHITECTURE.md](./API_ARCHITECTURE.md) - 积分检查流程
- **数据库 Schema**: [supabase/schema.sql](./supabase/schema.sql) - 完整表结构

---

**最后更新**: 2025-12-17
**维护者**: Claude Code + 西羊石团队
