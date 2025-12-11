
上线测试bug1

p代表优先级，p0最高

1. timeline 先隐藏，这个版本没上这个功能（p0）
2. 用户要有一个注册登录功能吧，游客只能创建项目，但是不能够调用AI发起请求（p0）
3. 资源中的角色生成，多了个。的拼接，有问题，大模型应该自己就生成了标点符号了（p1）
4. 文本大模型交互，需要有一个停止键最好（p1）
5. seedream结合资源中的角色或者场景的提示词，目前的逻辑是什么，需不需要改（p1）
6. 目前Gemini grid的生成内容有bug，我角色或者场景等资源，是默认每个只选择了一个的，为什么你这里上传了这么多参考图，我看到有很多重复的角色被上传了。直接报错了page-207d6e5fa1a8da76.js:1 Grid generation error: Error: Request Entity Too Large

FUNCTION_PAYLOAD_TOO_LARGE
，需要修复（p0），我看 console 里面提示词是这样的<
[geminiService Grid Debug] Final gridPrompt: MANDATORY LAYOUT: Create a precise 2x2 GRID containing exactly 4 distinct storyboard panels.
  - The output image MUST be a single image divided into a 2 (rows) by 2 (columns) matrix.
  - There must be EXACTLY 2 horizontal rows and 2 vertical columns.
  - Each panel must be completely separated by a thin, distinct, solid black line.
  - DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes.
  - The grid structure must be perfectly aligned for slicing.

  PANEL ASPECT RATIO REQUIREMENT (CRITICAL):
  - Each panel MUST be in LANDSCAPE orientation (horizontal/横屏), wider than it is tall.
  - The aspect ratio for EACH individual panel should be 21:9.
  - This means the OVERALL grid image will be 21:9.
  - Ensure each panel maintains the 21:9 aspect ratio when the grid is sliced.

  STORYBOARD CONTENT (Create 4 DIFFERENT shots based on these descriptions):

画风：国风 3D 动漫

分镜要求（4 个镜头，按顺序对应 Grid 从左到右、从上到下的位置）：
Grid位置1（镜头#4）: Wide Shot - Static
   国风3D动漫风格。乌江边，清晨。江水滔滔，雾气缭绕。一叶孤舟停在岸边。项羽牵着乌骓马站在江畔，身后远处是追击的烟尘。画面构图苍凉辽阔，冷色调，体现英雄末路的孤寂。静止镜头建立新场景。
Grid位置2（镜头#14）: Close-Up - Pan
   国风3D动漫风格。项羽的面部特写。他望着滚滚江水，又回头看向江东方向。脸上血迹斑斑，神情复杂，充满愧疚与自尊。眼神从迷茫转为决绝。微风吹乱他的发丝。镜头缓慢摇过他的脸庞。
Grid位置3（镜头#15）: Low Angle Shot - Static
   国风3D动漫风格。乌江边。项羽推开乌骓马，独自屹立。他挺直脊梁，仰头大笑（悲凉的笑）。背景是压顶的黑云和逼近的汉军旌旗。仰拍镜头，展现霸王最后的尊严与傲气。
Grid位置4（镜头#16）: Medium Shot - Static
   国风3D动漫风格。乌江边。项羽横剑在颈。他最后看了一眼手中的剑（仿佛看到虞姬）。动作没有任何犹豫，手起剑落。逆光拍摄，剪影效果，强调悲剧色彩而非血腥细节。静止镜头。

额外要求：按照要求生成对应分镜内容
角色: 项羽 | 场景: 乌江边
角色: 项羽 | 场景: 乌江边
角色: 项羽 | 场景: 乌江边
角色: 项羽 | 场景: 乌江边

【角色信息】
项羽: 西楚霸王，力拔山兮气盖世的末路英雄，充满悲剧色彩的顶级武将。. 外貌：国风 3D 动漫，写实比例与高精度材质，强调厚重的金属质感与战损细节。。男性，约 30 岁，西楚霸王/统帅。。身高 195cm 以上，极度强壮的倒三角魁梧身形，肌肉线条如岩石般分明，极具压迫感。。面部轮廓硬朗如刀削，浓眉入鬓，拥有传说中的“重瞳”（双瞳孔），眼神锐利透着疲惫与不屈。。凌乱的墨色长发，头顶束金冠但已歪斜，几缕碎发垂在额前，随风狂乱飞舞。。身披乌金兽面吞头连环铠，战甲布满刀痕箭创，身后系着残破的猩红战袍，手持巨型霸王戟。。神情肃杀而苍凉，紧抿嘴唇，散发着被困绝境却依然傲视天下的威严与悲壮气场。。双腿岔开如松般站立，单手拄戟插入地面，身体微前倾，如一座即将崩塌的高山。 (第一个参考图)、(第二个参考图)
虞姬: 霸王的挚爱，外柔内刚，乱世中凄美绝艳的一抹亮色。. 外貌：国风 3D 动漫，强调丝绸布料的流体解算与皮肤的通透感，唯美且哀婉。女性，约 20-23 岁，宠姬/舞者。身姿修长曼妙，腰肢纤细若柳，体态轻盈，具有古典美人的柔和曲线。标准的鹅蛋脸，肤若凝脂，眉目含情，眼角绘有淡淡的绯红妆容，凄美动人。如瀑的青丝半挽云鬓，插着一支精致的银花步摇，发丝间略显凌乱，透着决绝之意。素白渐变至血红色的广袖流仙裙（楚地风格），腰间束素带，衣袂飘飘，手中握有一对精巧的鸳鸯剑。嘴角带着凄楚而温柔的浅笑，眼中含泪却目光坚定，流露出对爱人的深情与赴死的决绝。呈拔剑起舞的定格姿态，身形后仰如新月，一手持剑背于身后，一手兰花指轻抚剑身。 (第三个参考图)、(第四个参考图)、(第五个参考图)、(第六个参考图)、(第七个参考图)、(第八个参考图)

【参考图像】
(第一个参考图) - 角色: 项羽
(第二个参考图) - 角色: 项羽
(第三个参考图) - 角色: 虞姬
(第四个参考图) - 角色: 虞姬
(第五个参考图) - 角色: 虞姬
(第六个参考图) - 角色: 虞姬
(第七个参考图) - 角色: 虞姬
(第八个参考图) - 角色: 虞姬


  CRITICAL INSTRUCTIONS:
  - Each numbered description corresponds to ONE specific panel in the grid (read left-to-right, top-to-bottom).
  - Each panel MUST match its corresponding shot description EXACTLY (shot size, camera angle, action, characters).
  - DO NOT show the same scene from different angles - each panel is a DIFFERENT shot/scene.
  - If reference images are provided, use them for character/scene consistency across different shots.
  - Maintain consistent art style and lighting mood across all panels while showing different shots.

  Technical Requirements:
  - Cinematic lighting, 4K resolution.
  - Professional color grading and composition.
  - No text, no captions, no UI elements.
  - No watermarks.
  - No broken grid lines.
  - REMEMBER: Each panel is 21:9 (landscape/横屏).
>
7. 用户生成剧本之后不知道要干什么，需要引导，应该是引导他们去生成或者上传资源里的角色三视图。（p1）
8. UI太丑，比如主题切换之后有部分的UI没有切换。（p1）
[图片]
9. agent模式这里面，为什么会有重复的消息。（p1）
[图片]
10. 放大缩小功能缺失 ctrl+滚轮 放大缩小画布（p1）
11. 网页主页最下面缺少 Copyright ©2026 xysai.ai All rights reserved.（p2）