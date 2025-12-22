这是 Kapon AI  这个公司的 sora2 的视频生成相关接口，我们 sora2 和 sora2pro 的都可以试一下，sora2 pro 主要是用 hd 模式。

 创建角色不需要描述背景，提示词最好是类似这样“对着镜头说 今天天气真不错 我们出去玩吧，与镜头互动“的正面视频。
 且最后的提示词要求用角色对应的内容来替代原来的角色名，且视频生成要求：要求： json必须包含 (character_setting, shots, 缺一不可) ， character_setting是剧本中所有人物，shots是多个镜头数组，每个镜头在 1-10s之间得内容，不要添加额外对话，严格保证剧本中所有内容都输出完 毕，json格式为如下：

{"character_setting":{"姓名":{"age":25,"appearance":"性别，年龄，头发
(颜色，发型），衣服（颜色，款式），缺一不可","name":"全文固定姓
名","voice":"GenderAge（例如：女·27岁） PitchMean（例如：215 Hz）
Tempo（例如：180 SPM） Accent（例如：东京腔轻微卷舌）"}},"shots":
[{"action":"动作","camera":"镜头变化","dialogue":{"role":"姓名","text":"讲
话内容"},"duration":0,"location":"地点","style_tags":"特效效果","time":"具
体时间（白天或晚上）","visual":"镜头内容","weather":"天气"}]}

通过这种方式优化 15s 和 25s中的一些景别切换等等，且要求角色说话的内容要严格按照分镜脚本，不要多增减内容。

baseurl：https://models.kapon.cloud  
apikey：sk-31dWTKpesPhgKiE_WwshxcW_qbjeojMI1Co-MqSiDrSkTnl3OJ-CQCqKSdg   

1. sora2 创建角色

Sora 角色创建
创建可复用的角色，在多个视频中使用同一角色

通过 Sora 角色创建接口，你可以从视频中提取角色，并在后续的视频生成中复用该角色，实现同一角色在不同场景中多次出镜。
​
典型使用流程
准备一段包含目标角色的视频（或使用已生成的视频任务 ID）
调用 /sora/v1/characters 创建角色
在 /v1/videos 中通过 character_url / character_timestamps 引用该角色生成新视频
​
接口信息
接口地址：POST /sora/v1/characters
认证方式：在请求头中添加 Authorization: Bearer <你的API密钥>
如果调用时返回 sora character api is not supported for this channel 或 unsupported_api 错误，说明你当前使用的 API 密钥不支持角色创建功能。请联系平台管理员确认或更换支持该功能的密钥。
​
创建角色
​
请求参数
url：包含目标角色的视频 URL（与 from_task 二选一）
from_task：基于已有的视频任务 ID 创建角色（与 url 二选一）
timestamps：角色在视频中的时间片段，格式如 1,3（表示第 1～3 秒）
​
方式一：通过视频 URL 创建

Copy
curl -X POST "https://models.kapon.cloud/sora/v1/characters" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://filesystem.site/cdn/20251030/javYrU4etHVFDqg8by7mViTWHlMOZy.mp4",
    "timestamps": "1,3"
  }'
​
方式二：通过任务 ID 创建

Copy
curl -X POST "https://models.kapon.cloud/sora/v1/characters" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from_task": "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj",
    "timestamps": "1,3"
  }'
​
响应示例

Copy
{
  "id": "chr_1234567890",
  "username": "dshfdavpv.mooskyflig",
  "permalink": "https://platform.openai.com/characters/chr_1234567890",
  "profile_picture_url": "https://filesystem.site/cdn/avatar.png"
}
响应字段说明：
id：角色 ID
username：角色标识名称，可在提示词中使用（如 @dshfdavpv.mooskyflig）
permalink：角色主页链接
profile_picture_url：角色头像
​
在视频生成中使用角色
创建角色后，可以通过以下两种方式在 /v1/videos 中使用该角色：
​
方式一：使用 character_url 和 character_timestamps
直接使用与角色创建相同的 URL 和时间片段：

Copy
curl -X POST "https://models.kapon.cloud/v1/videos" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-2",
    "prompt": "使用已创建角色，在咖啡馆场景中阅读一本书",
    "seconds": "10",
    "size": "16x9",
    "character_url": "https://filesystem.site/cdn/20251030/javYrU4etHVFDqg8by7mViTWHlMOZy.mp4",
    "character_timestamps": "1,3",
    "private": "false"
  }'
​
方式二：在提示词中使用 @username
在提示词中通过 @username 引用角色：

Copy
curl -X POST "https://models.kapon.cloud/v1/videos" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-2",
    "prompt": "使用 @dshfdavpv.mooskyflig 这个角色在街边咖啡馆中行走",
    "seconds": "10",
    "size": "16x9"
  }'
推荐使用方式一（character_url + character_timestamps），这种方式更明确且兼容性更好。
​
完整示例
以下是从创建角色到生成视频的完整流程：

Copy
export YOUR_API_KEY="sk-xxxxx"
export BASE_URL="https://models.kapon.cloud"

# 步骤 1：创建角色
curl -X POST "$BASE_URL/sora/v1/characters" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://filesystem.site/cdn/20251030/javYrU4etHVFDqg8by7mViTWHlMOZy.mp4",
    "timestamps": "1,3"
  }'

# 步骤 2：使用该角色生成视频
curl -X POST "$BASE_URL/v1/videos" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-2",
    "prompt": "使用已创建角色，在咖啡馆场景中阅读一本书",
    "seconds": "10",
    "size": "16x9",
    "character_url": "https://filesystem.site/cdn/20251030/javYrU4etHVFDqg8by7mViTWHlMOZy.mp4",
    "character_timestamps": "1,3",
    "private": "false"
  }'
角色创建和视频生成会分别计费
如果不需要复用角色，可以直接使用纯文本或参考图生成视频，详见《视频生成》文档


2. sora2 视频生成

视频生成
通过 kapon 代理调用 OpenAI Sora 视频生成接口

POST
/
v1
/
videos

Try it
使用 OpenAI Sora 模型生成视频内容。kapon 支持完整的视频生成工作流，包括任务创建、状态查询和内容下载。
​
创建视频任务
通过提供文本提示词来生成视频：

Copy
curl -X POST "https://models.kapon.cloud/v1/videos" \
  -H "Authorization: Bearer $TOKEN" \
  -F "model=sora-2" \
  -F "prompt=百事可乐宣传片" \
  -F "seconds=10" \
  -F "size=720x1280"
​
请求参数
model：模型名称，支持 sora-2 和 sora-2-pro
prompt：视频生成的文本描述
seconds：视频时长（秒，字符串传递更兼容）。常见可用档位：
sora-2：10、15
sora-2-pro：15、25
OpenAI 官方 API 仅支持：4、8、12
size：视频分辨率（或宽高比）。平台会按上游能力做兼容与映射，建议优先使用“标准分辨率”：
sora-2：720x1280、1280x720
sora-2-pro：720x1280、1280x720、1024x1792、1792x1024 常见兼容输入（会自动映射到上述标准分辨率）：
宽高比：16x9、9x16
时长选择建议：
快速预览：优先 10 秒（若使用 OpenAI 官方 API，请按其仅支持的 4/8/12 秒档位）
正式成片：sora-2-pro 的 25 秒可以呈现更完整叙事，但生成与下载时间也更长
​
角色视频（Character）扩展（特定上游）
当 OpenAI 渠道的上游支持 Sora 角色扩展能力时，平台会对 /v1/videos 进行扩展，支持官方文档中的角色相关参数。典型用法是先通过 /sora/v1/characters 创建一个角色，再在视频提示词或参数中引用该角色。
​
额外参数（仅在支持该扩展能力的上游生效）
character_url：包含目标角色的视频 URL（通常与 /sora/v1/characters 中的 url 一致）
character_timestamps：角色在视频中的时间片段范围，单位秒，格式如 1,3（表示 1～3 秒）
private：是否为私有角色，字符串 "true" 或 "false"（不填时由上游按默认策略处理）
​
JSON 调用示例（支持角色扩展的上游）

Copy
curl -X POST "https://models.kapon.cloud/v1/videos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-2",
    "prompt": "让刚才创建的角色在咖啡馆场景中阅读一本书",
    "seconds": 10,
    "size": "16x9",
    "character_url": "https://filesystem.site/cdn/20251030/example-character.mp4",
    "character_timestamps": "1,3",
    "private": "false"
  }'
在上述特定上游场景下：
JSON 请求会在网关层自动转换为 multipart/form-data，并透传上述字段到上游；
multipart 请求则保持原样透传，你也可以直接使用 -F character_url=... 的形式提交。
​
响应示例

Copy
{
  "id": "video_691209aab0a08198a4e78870277f7e3d0215e09cec47a737",
  "object": "video",
  "created_at": 1762789802,
  "status": "queued",
  "model": "sora-2",
  "prompt": "百事可乐宣传片",
  "progress": 0,
  "seconds": "10",
  "size": "720x1280"
}
​
状态说明
任务创建后会经历以下状态：
queued：任务已排队，等待处理
processing：正在生成视频
completed：生成完成，可以下载视频
failed：生成失败
任务完成后，响应会包含 completed_at（完成时间）和 expires_at（过期时间）字段。视频文件会在过期时间后自动删除。
​
完整示例
创建任务并等待完成：

Copy
# 1. 创建视频任务
RESPONSE=$(curl -X POST "https://models.kapon.cloud/v1/videos" \
  -H "Authorization: Bearer $TOKEN" \
  -F "model=sora-2" \
  -F "prompt=百事可乐宣传片" \
  -F "seconds=10" \
  -F "size=720x1280")

VIDEO_ID=$(echo $RESPONSE | jq -r '.id')
echo "视频任务 ID: $VIDEO_ID"

# 2. 轮询查询状态
while true; do
  RESPONSE=$(curl "https://models.kapon.cloud/v1/videos/$VIDEO_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  STATUS=$(echo $RESPONSE | jq -r '.status')
  PROGRESS=$(echo $RESPONSE | jq -r '.progress')
  
  echo "当前状态: $STATUS (进度: $PROGRESS%)"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✓ 视频生成完成"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "✗ 视频生成失败"
    exit 1
  fi
  
  sleep 5
done

# 3. 下载视频
curl -L "https://models.kapon.cloud/v1/videos/$VIDEO_ID/content" \
  -H "Authorization: Bearer $TOKEN" \
  --output "${VIDEO_ID}.mp4"

echo "✓ 视频已保存到 ${VIDEO_ID}.mp4"
kapon 会对不同供应商的返回结构进行统一封装，status 字段取值为 queued、processing、completed、failed 等。视频完成后会包含 completed_at 和 expires_at 时间戳。
​
计费模型与升级说明
计费模式：Sora 视频任务采用“终态实扣，失败不扣”的模式：
创建阶段：仅记录任务与预估信息，不对用户/Token 实际扣费；
终态结算：当任务进入 completed 或 failed 时，由后台轮询器根据最终时长与价目表一次性结算；
失败任务：不扣费，仅更新计费状态。
新旧版本兼容：
老版本曾采用“创建阶段先扣，失败时退款”的策略，部分历史任务的计费记录可能存在“预扣 + 退款”；
新版本仅对创建时 Quota=0 的任务启用终态计费；历史数据的对账与核对可以通过 logs.metadata.platform_task_id 与 tasks.platform_task_id 进行关联审计。
​
脚本示例（Python，本地文件参考图）
仓库提供了基于 openai Python SDK 的本地验证脚本，可通过 input_reference 上传参考图并自动轮询与下载：

Copy
export OPENAI_BASE_URL="https://models.kapon.cloud/v1"
export OPENAI_API_KEY="$TOKEN"

python3 scripts/sora2_image_to_video_sdk.py \
  --prompt "百事可乐宣传片" \
  --seconds 4 \
  --size 720x1280 \
  --image /absolute/path/to/ref.jpg \
  --output sora_video.mp4
​
参考图生视频（Image-to-Video）
除纯文本生视频外，kapon 也支持“带参考图”的视频生成。按照 OpenAI Sora 的接口规范，在创建任务时以 multipart/form-data 方式上传参考图文件字段 input_reference。
​
curl 示例（multipart）

Copy
curl -X POST "https://models.kapon.cloud/v1/videos" \
  -H "Authorization: Bearer $TOKEN" \
  -F "model=sora-2" \
  -F "prompt=百事可乐宣传片，都市街拍风，年轻活力，镜头运动丰富" \
  -F "seconds=10" \
  -F "size=720x1280" \
  -F "input_reference=@/absolute/path/to/ref.jpg"
若通道为 OpenAI 官方 API，seconds 必须是 4、8 或 12 且需在 multipart 表单中显式提供。请确保 -F seconds=8 使用的是纯数字，不要加引号，也不要误用 Bash/Zsh 的保留变量 SECONDS。
​
Python SDK 示例（openai-python）

Copy
from openai import OpenAI

client = OpenAI(
    base_url="https://models.kapon.cloud/v1",
    api_key="$TOKEN",
)

with open("./ref.jpg", "rb") as f:
    job = client.videos.create(
        model="sora-2",
        prompt="百事可乐宣传片，都市街拍风，年轻活力，镜头运动丰富",
        seconds="10",         # 以字符串传递更兼容
        size="720x1280",
        input_reference=f,     # 关键：参考图文件
    )

print("任务ID:", job.id, "状态:", job.status)

# 轮询
import time
while True:
    cur = client.videos.retrieve(job.id)
    print("状态:", cur.status, "进度:", getattr(cur, "progress", None))
    if cur.status in ("completed", "failed"):
        job = cur
        break
    time.sleep(2)

if job.status == "completed":
    content = client.videos.download_content(job.id)
    content.write_to_file("output.mp4")
    print("已保存到 output.mp4")
else:
    print("生成失败:", getattr(job, "error", None))
本仓库已提供两个可执行脚本便于本地验证：
curl 版本：scripts/validate_image2video.sh（自动下载示例参考图、轮询并下载成片）
SDK 版本：scripts/sora2_image_to_video_sdk.py（基于 openai Python SDK，支持 --image/--seconds/--size 参数）
Authorizations
​
Authorization
stringheaderrequired
API Key

Body

​
model
enum<string>required
模型名称

Available options: veo-3.1-generate-preview, veo-3.1-fast-generate-preview 
Example:
"veo-3.1-fast-generate-preview"

​
prompt
stringrequired
文本提示词

Example:
"A cinematic lion at sunset"

​
seconds

视频时长（秒）：4、6、8

Example:
6

​
size
enum<string>default:1280x720
分辨率

Available options: 1280x720, 720x1280, 1920x1080, 1080x1920 
Example:
"1280x720"

​
input_reference
string[]
参考图 URL 数组（1-3 张）

Example:
["https://example.com/image.jpg"]
Response

200

application/json
任务创建成功

​
id
string
任务 ID

Example:
"video_abc123"

​
object
enum<string>
Available options: video 
Example:
"video"

​
created_at
integer
创建时间戳

Example:
1761234567

​
completed_at
integer
完成时间戳

​
status
enum<string>
任务状态

Available options: queued, in_progress, completed, failed 
Example:
"queued"

​
model
string
模型名称

Example:
"veo-3.1-fast-generate-preview"

​
prompt
string
提示词

​
progress
number
进度（0-100）

Example:
0

​
seconds
integer
视频时长

Example:
6

​
size
string
分辨率

Example:
"1280x720"

​
video_url
string
视频直链（完成后返回）

​
error
object
Show child attributes

3. 视频查询

视频查询
查询视频生成任务的状态和结果

GET
/
v1
/
videos
/
{video_id}

Try it
查询已创建的视频生成任务的当前状态、进度和结果。
​
查询视频任务
通过视频 ID 查询任务详情：

Copy
curl "https://models.kapon.cloud/v1/videos/$VIDEO_ID" \
  -H "Authorization: Bearer $TOKEN"
​
响应示例
任务进行中：

Copy
{
  "id": "video_691209aab0a08198a4e78870277f7e3d0215e09cec47a737",
  "object": "video",
  "created_at": 1762789802,
  "status": "processing",
  "model": "sora-2",
  "prompt": "百事可乐宣传片",
  "progress": 45,
  "seconds": "4",
  "size": "720x1280"
}
任务完成：

Copy
{
  "id": "video_691209aab0a08198a4e78870277f7e3d0215e09cec47a737",
  "object": "video",
  "created_at": 1762789802,
  "completed_at": 1762789891,
  "expires_at": 1762793491,
  "status": "completed",
  "model": "sora-2",
  "prompt": "百事可乐宣传片",
  "progress": 100,
  "seconds": "4",
  "size": "720x1280"
}
​
状态说明
queued：任务已排队，等待处理
processing：正在生成视频
completed：生成完成，可下载视频
failed：生成失败
​
响应字段说明
id：视频任务的唯一标识符
created_at：任务创建时间戳
completed_at：任务完成时间戳（仅在 completed 状态下存在）
expires_at：视频过期时间戳（仅在 completed 状态下存在）
progress：处理进度（0-100）
seconds：视频时长（字符串格式）
size：视频分辨率
​
下载视频内容
直接下载生成的视频文件：

Copy
curl -L "https://models.kapon.cloud/v1/videos/$VIDEO_ID/content" \
  -H "Authorization: Bearer $TOKEN" \
  --output "$VIDEO_ID.mp4"
Authorizations
​
Authorization
stringheaderrequired
API Key

Path Parameters
​
video_id
stringrequired
视频任务 ID

Response

200

application/json
查询成功

​
id
string
任务 ID

Example:
"video_abc123"

​
object
enum<string>
Available options: video 
Example:
"video"

​
created_at
integer
创建时间戳

Example:
1761234567

​
completed_at
integer
完成时间戳

​
status
enum<string>
任务状态

Available options: queued, in_progress, completed, failed 
Example:
"queued"

​
model
string
模型名称

Example:
"veo-3.1-fast-generate-preview"

​
prompt
string
提示词

​
progress
number
进度（0-100）

Example:
0

​
seconds
integer
视频时长

Example:
6

​
size
string
分辨率

Example:
"1280x720"

​
video_url
string
视频直链（完成后返回）



4. 视频下载

视频下载
下载生成的视频文件

GET
/
v1
/
videos
/
{video_id}
/
content

Try it
当视频生成任务完成后，你可以通过下载接口获取视频文件。
​
下载视频文件
使用视频 ID 直接下载生成的视频：

Copy
curl -L "https://models.kapon.cloud/v1/videos/$VIDEO_ID/content" \
  -H "Authorization: Bearer $TOKEN" \
  --output "$VIDEO_ID.mp4"
注意使用 -L 参数以支持重定向，视频文件可能托管在 CDN 上。
​
路径参数
video_id：视频任务的唯一标识符
​
响应
成功（200）：返回 MP4 格式的视频文件流
未找到（404）：视频任务不存在或尚未完成
​
注意事项
下载不消耗额外配额，可以多次下载同一视频
建议在下载后保存到本地存储，避免依赖临时链接
​
时长与文件大小提示
当前支持的视频时长档位：10 秒、15 秒、25 秒（具体可用档位取决于所选模型与渠道）。
同等内容下，时长越长文件越大、生成时间越久；下载时间也会相应增加。
若需更快下载与预览，建议先生成 10 秒版本进行效果确认，再发起更长时长的正式生成。
视频文件过期时间较短，请在任务完成后及时下载。视频 URL 可能包含临时访问令牌，请勿公开分享。
Authorizations
​
Authorization
stringheaderrequired
API Key

Path Parameters
​
video_id
stringrequired
视频任务 ID

Response

200

video/mp4
视频文件

The response is of type file.