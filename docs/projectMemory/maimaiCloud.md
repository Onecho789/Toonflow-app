# 麦麦云服务器与部署记录

本文件于2026-11-03从 D:\2api-codes\ssh-server\maimaiCloud.md 迁入，作为当前项目的部署主记忆。后续维护更新本文件，并先读 releaseWorkflow.md。以下线上健康状态来自上次发布验收，本次目录整理未连接生产复验；记录不包含明文密码。

## 连接与项目

- 服务器：159.75.178.145
- SSH：root，端口 22。
- 公网地址：https://159.75.178.145:8100
- 本机源码：D:\2api-codes\maimai\cloud，当前分支 goRewrite。直接在这个项目目录构建和修改。
- 服务器目录：/opt/maimai-cloud
- Compose 文件：/opt/maimai-cloud/docker-compose.yml
- 环境文件：/opt/maimai-cloud/.env，权限 600。IMAGE 控制应用版本；保留其他配置与密钥。
- Compose 项目：maimai-cloud
- 应用容器：maimai-cloud-app-1；PostgreSQL：maimai-cloud-postgres-1；Redis：maimai-cloud-redis-1。
- 宿主机 127.0.0.1:8101 映射容器 8100；公网 HTTPS 入口使用 8100。
- 平台：linux/amd64（服务器 x86_64）。
- 镜像仓库：ccr.ccs.tencentyun.com/echotools/maimai-cloud。

## 本机凭据

SSH 凭据已由 Windows DPAPI 加密保存在：
C:\Users\Administrator\.codex\serverConnections\maimaiCloud.xml

凭据仅由当前 Windows 用户和本机解密，不放到源码仓库、不放进聊天提示词、不打印密码。使用 PowerShell 的 Import-Clixml 读取 PSCredential；Python Paramiko 已安装，版本 5.0.0。连接前加载 C:\Users\Administrator\.ssh\known_hosts，保持主机密钥校验。

可读取用户名，确认凭据记录：
Import-Clixml -LiteralPath 'C:\Users\Administrator\.codex\serverConnections\maimaiCloud.xml' | Select-Object UserName

建立连接时只在进程内取 GetNetworkCredential().Password；如传给子进程，使用任务专用环境变量并在 finally 清除。不要把密码加入命令参数、日志或文档。

其他凭据（root 密码、管理员账号、.env 密钥、测试账号、镜像仓库、new-api 服务器说明）统一记在 D:\2api-codes\资料\maimaiCredentials.md，条目清单见 [releaseWorkflow.md](releaseWorkflow.md) 的凭据小节；该文件不能复制进 Git 仓库，内容不抄进本记录。

## 当前线上版本（2026-11-06）

2026-11-06 01:27（北京时间）已更新到 **2.18.0-20261106**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.18.0-20261106
摘要：sha256:abd4545414b8f8b0dcb57cc38711eba96c3bf277c80df76f41250ea3acee591a
源码提交：ebeb7c188dd3c95921d0314b3cf24dd6c628d184（uiRedesign，未推送 origin，origin 停在 102e134；二进制与 web dist 均从独立 clone 构建，已删除 clone），vcs.modified=false。

本次 gpt-image-2.6 GIF 动图：模型 meta.gif=true 时接受 output_format=gif、frame_count（2–16，未传补 9）、frame_duration_ms（20–2000）；未声明 gif 返回 400 unsupported_format，GIF 带参考图/遮罩返回 400 unsupported_reference（OpenAI edits 不支持 GIF），帧参数不配 GIF 返回 400。费用 = 单价 × 张数 × 档位倍率 × 帧数 × meta.gifFramePrice（缺省 1，按帧估算，待实测账单校准）。后台模型表单新增「动图 GIF」开关与每帧倍率。无数据库迁移，schema 仍为 66。配套桌面 2.1.16。
应用 running=true、restarts=0，启动 2026-11-05T17:26:56Z，日志 version=2.18.0-20261106；部署前后活动任务与未结算用量均为 0；max_images 列存在（渠道 1、5 已填 15）；Redis PONG、Bun 1.4.3；内网及公网首页、/admin、/admin/models、/admin/redemptionCodes、/console、/login、/api/pay/config 200，匿名 /api/admin/models、/api/admin/redemptionCodes/1/code、/v1/models 401；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/gifRelease20261106（databaseBefore.dump 156489610 字节 SHA256 de2e2c49…、releaseRollback.sh SHA256 31a63852…），回退到 2.17.0-20261106，只恢复 IMAGE；证据 docs/history/gifRelease20261106/，构建上下文 cloud\build\release218020261106。生产回退未执行；后台尚未配置 gpt-image-2.6 模型与渠道，未在生产实际出 GIF。

### 上次发布：2.17.0-20261106

2026-11-06 00:07（北京时间）曾更新到 **2.17.0-20261106**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.17.0-20261106
摘要：sha256:0a2c8273b7ad723f799f1061c659e278ad386342e3cea48bc2c66446bf59d811
源码提交：2be98d487edd4650e71cf687a0bce0e6e3279e48（uiRedesign，已推送 origin，本地分支已设跟踪；二进制与 web dist 均从独立 clone 构建，已删除 clone），vcs.modified=false。

本次渠道新增「单次最多张数」：迁移 66 加 channels.max_images（可空，1–15，check 约束），管理端渠道编辑页（含图片能力的渠道类型）可填，0 表示清空按默认 8。图片拆批的每批张数取本次可能调用的前 2 个渠道里最小的上限（填了按填的，可高于 8；未填按 8）。起因：渠道「生图2」上游限制 n ≤ 4，6 张请求返回 422。上线后 5 个渠道均为 null（行为与 2.16.4 相同），需管理员在后台给「生图2」填 4。
应用 running=true、restarts=0，启动 2026-11-05T16:06:59Z，日志 version=2.17.0-20261106；schema=66、max_images 列存在；部署前后活动任务与未结算用量均为 0；Redis PONG、Bun 1.4.3；内网及公网首页、/admin、/admin/models、/admin/redemptionCodes、/console、/login、/api/pay/config 200，匿名 /api/admin/models、/api/admin/redemptionCodes/1/code、/v1/models 401；env 600、diff 仅 IMAGE。本地在临时库验证迁移 66 与写入语义（未传保留、0 清空、16 被拒），临时库已删除。
备份与回退：/opt/maimai-cloud/backups/maxImagesRelease20261106（databaseBefore.dump 155552509 字节 SHA256 0d1ce04a…、releaseRollback.sh SHA256 3c7d3f0f…），回退到 2.16.4-20261105，只恢复 IMAGE，max_images 列保留（旧镜像不读取）；证据 docs/history/maxImagesRelease20261106/，构建上下文 cloud\build\release217020261106。生产回退未执行；未在生产后台实际保存该字段或出多张图。

### 上次发布：2.16.4-20261105

2026-11-05 21:42（北京时间）曾更新到 **2.16.4-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.16.4-20261105
摘要：sha256:ce89394630aa0dd3f47c04e611fb745bfceff85166f5fc47e0292a5c169fc8f9
源码提交：480f0c0ea54b7f5c116639d5a6dc769e4642fade（uiRedesign，已推送 origin；二进制从独立 clone 构建，已删除 clone），vcs.modified=false。web/ 与 2.16.3 无差异，复用 release216320261105 的 dist（diff -r 一致）。

本次仅服务端计费与选渠道：流式断流（未收到最终 usage）按已生成字符数兜底计 completion；结算补扣允许余额变负（欠费期间预扣自然失败）；视频提交与客户端断开解耦、改按上游结果结算，已结算任务重试沿用已存状态；图片任务超时/重启丢失按预扣全额计费（interrupted，错误「服务重启，生成结果丢失」）；停机时等待后台任务最多 35 秒。请求分组下无该模型渠道时：其他分组有则 400 group_unavailable（提示可用分组），否则 503 no_available_channel。配套桌面 2.1.13（不再静默切到首个分组）。无数据库迁移，schema 仍为 65。
应用 running=true、restarts=0，启动 2026-11-05T13:42:10Z，日志 version=2.16.4-20261105；首次预检遇 1 个进行中图片任务自动中止（未改动线上），等其结算归零后重跑；部署前后活动任务与未结算用量均为 0；code_cipher 列存在；Redis PONG、Bun 1.4.3；内网及公网首页、/admin、/admin/models、/admin/redemptionCodes、/console、/login、/api/pay/config 200，匿名 /api/admin/models、/api/admin/redemptionCodes/1/code、/v1/models 401；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/billingRelease20261105（databaseBefore.dump 89666965 字节 SHA256 b4f5bc58…、releaseRollback.sh SHA256 3a548718…），回退到 2.16.3-20261105，只恢复 IMAGE；证据 docs/history/billingRelease20261105/，构建上下文 cloud\build\release216420261105。生产回退未执行；未在生产实际触发断流、欠费或 group_unavailable。

### 上次发布：2.16.3-20261105

2026-11-05 18:28（北京时间）曾更新到 **2.16.3-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.16.3-20261105
摘要：sha256:8842d526ffcd872a7d38b6bbbfe583e798f33c9e1619a0fc0dff453bccd500af
源码提交：a181d9de7b7d13794084c7036b856ef240fd3b26（uiRedesign，已推送 origin；二进制与 web dist 均从独立 clone 构建，已删除 clone），vcs.modified=false。server/ 与 2.16.2 无差异。

本次仅前端：主题由 Glass Iris 改为星云梦境（深色星云夜空、浅色梦幻紫天，紫 → 兰紫 → 粉 → 桃强调色，侧栏、余额卡、登录品牌面、首页 CTA 为夜空场景面并叠星点层）。接口与路由不变，无数据库迁移，schema 仍为 65。
应用 running=true、restarts=0，启动 2026-11-05T10:28:20Z，日志 version=2.16.3-20261105；部署前后活动任务与未结算用量均为 0；code_cipher 列存在；Redis PONG、Bun 1.4.3；内网及公网首页、/admin、/admin/models、/admin/redemptionCodes、/console、/login、/api/pay/config 200，匿名 /api/admin/models、/api/admin/redemptionCodes/1/code、/v1/models 401；公网 index CSS（index-BbAPnHcO.css）含新主色 #6c5ce7；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/nebulaRelease20261105（databaseBefore.dump 71921823 字节 SHA256 0ce7edb6…、releaseRollback.sh SHA256 cd601601…），回退到 2.16.2-20261105，只恢复 IMAGE；证据 docs/history/nebulaRelease20261105/，构建上下文 cloud\build\release216320261105。生产回退未执行。

### 上次发布：2.16.2-20261105

2026-11-05 17:49（北京时间）曾更新到 **2.16.2-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.16.2-20261105
摘要：sha256:6047b901d93fd29d16443f955e231a4ca6668b72bbd887f48a9dc63857b785f8
源码提交：e65b850fba38f574af2d4917bc287911097fe5fd（uiRedesign，已推送 origin；二进制与 web dist 均从独立 clone 构建，已删除 clone），vcs.modified=false。server/ 与 2.16.1 无差异。

本次仅前端：管理后台、用户中心、首页与登录页改为 Glass Iris 风格（近黑底蓝紫冷光、Inter Tight 随包打包、玻璃控件与渐变细描边），移除临时配色 demo。接口与路由不变，无数据库迁移，schema 仍为 65。
应用 running=true、restarts=0，启动 2026-11-05T09:49:16Z，日志 version=2.16.2-20261105；部署前后活动任务与未结算用量均为 0；code_cipher 列存在；Redis PONG、Bun 1.4.3；内网及公网首页、/admin、/admin/models、/admin/redemptionCodes、/console、/login、/api/pay/config 200，匿名 /api/admin/models、/api/admin/redemptionCodes/1/code、/v1/models 401；公网 index CSS（index-FI5qJ1Tv.css）含新主色 #2f6bff；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/glassIrisRelease20261105（databaseBefore.dump 74560342 字节 SHA256 6b5def63…、releaseRollback.sh SHA256 f6a063bb…），回退到 2.16.1-20261105，只恢复 IMAGE；证据 docs/history/glassIrisRelease20261105/，构建上下文 cloud\build\release216220261105。生产回退未执行。

### 上次发布：2.16.1-20261105

2026-11-05 16:18（北京时间）曾更新到 **2.16.1-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.16.1-20261105
摘要：sha256:458e61a2f112e3fe401c8978db2a52b571c9a0aaa53c7fd737762af5b91a4128
源码提交：62d7a7fa91c1cfcba9f6602ba510da23365b46c5（uiRedesign，已推送 origin；从独立 clone 构建，已删除 clone），vcs.modified=false。web/ 与 2.16.0 无差异，复用 release216020261105 的 dist（逐文件比对一致）。

本次图片接口 n 上限 8→15：超过 8 张拆成每批最多 8 张、最多 4 路并行的上游请求；各批都成功但张数不足时按 n=1 补齐；多批合并 data 返回，按实际张数结算。配套桌面 2.1.10（客户端提交 e9d9a2f）。无数据库迁移，schema 仍为 65。
应用 running=true、restarts=0，启动 2026-11-05T08:18:13Z，日志 version=2.16.1-20261105；部署前后活动任务与未结算用量均为 0；code_cipher 列存在；Redis PONG、Bun 1.4.3；内网及公网首页、/admin/models、/admin/redemptionCodes、/api/pay/config 200，匿名 /api/admin/models、/api/admin/redemptionCodes/1/code、/v1/models 401；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/batchImageRelease20261105（databaseBefore.dump 82191186 字节 SHA256 5a96db8b…、releaseRollback.sh SHA256 cb56f8b9…），回退到 2.16.0-20261105，只恢复 IMAGE；证据 docs/history/batchImageRelease20261105/，构建上下文 cloud\build\release216120261105。生产回退未执行；未在生产实际生成超过 8 张。

### 上次发布：2.16.0-20261105

2026-11-05 16:08（北京时间）已更新到 **2.16.0-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.16.0-20261105
摘要：sha256:ee6210559b7fce5056bbdc7f99fbb53e744052ea18e65b26669cbdad1026d0da
源码提交：2bfab018b335a0027b2715f0d3b13efbb9e6f53b（uiRedesign，已推送 origin；从独立 clone 构建），vcs.modified=false。

本次管理端视觉重做（品牌侧栏 152px、宽松表格、手机卡片布局、深色模式保留）；兑换码新建时用设置加密密钥加密留存完整码，新增 GET /api/admin/redemptionCodes/{id}/code 供再次复制（审计 redemptionReveal），旧码无密文显示「不可复制」；全站调用拆成 12 列并支持列设置。迁移 64→65：redemption_codes 加 code_cipher 列。
应用 running=true、restarts=0，启动 2026-11-05T08:08:32Z；部署前后活动任务与未结算用量均为 0；schema=65、code_cipher 列存在；Redis PONG、Bun 1.4.3；内网及公网首页、/admin/models、/admin/redemptionCodes、/api/pay/config 200，匿名 /api/admin/models、/api/admin/redemptionCodes/1/code、/v1/models 401；公网首页入口 assets/index-BsF9u-bw.js 与本次 dist 一致；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/uiRedesignRelease20261105（databaseBefore.dump 82191441 字节 SHA256 4fdc2a68…、releaseRollback.sh SHA256 83c7adda…），回退到 2.15.2-20261105，只恢复 IMAGE，code_cipher 列保留（旧镜像不读取）；证据 docs/history/uiRedesignRelease20261105/，构建上下文 cloud\build\release216020261105。生产回退未执行；未在生产登录后台做浏览器验收、未在生产创建兑换码。

### 上次发布：2.15.2-20261105

2026-11-05 14:31（北京时间）已更新到 **2.15.2-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.15.2-20261105
摘要：sha256:eabe0350d9c6e8879ac771426ebcf330a1110de1144945b7484c122f93ab26d3
源码提交：de595569b6b816f186b745ae63501f4ad4a49737（uiRedesign，已推送 origin；基于 goRewrite 6b6579f，只多共享记忆提交和本次 image.go 改动），vcs.modified=false。web 静态文件与 2.15.1 相同（两提交间 web/ 无差异，复用 2.15.1 上下文的 dist）。

本次图片接口支持 other.pixels（"WxH"）：按 gpt-image 约束校验（16 的倍数、长边 ≤ 3840、总像素 655360–8294400），优先于 sizeMap 换算并从请求体移除；计费档位按面积推算（≤2016×864 为 1K、≤2048² 为 2K、更大为 4K）。配套桌面 2.1.9（客户端提交 565756f）。无数据库迁移，schema 仍为 64。
应用 running=true、restarts=0，启动 2026-11-05T06:31:54Z；部署前后活动任务与未结算用量均为 0；Redis PONG、Bun 1.4.3；内网及公网首页、/admin/models、/api/pay/config 200，匿名 /api/admin/models、/v1/models 401；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/pixelsRelease20261105（databaseBefore.dump 82191215 字节 SHA256 28cb110e…、releaseRollback.sh SHA256 f61c4c61…），回退到 2.15.1-20261105；证据 docs/history/pixelsRelease20261105/，构建上下文 cloud\build\release215220261105。生产回退未执行，未用自定义像素实际生成。

### 上次发布：2.15.1-20261105

2026-11-05 11:01（北京时间）已更新到 **2.15.1-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.15.1-20261105
摘要：sha256:310cd51d83af29eb5533d1c3a408d57a1c5d22f07bd6abba2061721ce8908a34
源码提交：6b6579ff7a3c83c11c25f1f60d562ea72d111353（goRewrite，已推送 origin），vcs.modified=false。

本次图片像素换算改用 infinite-canvas 的固定尺寸表（1K/2K/4K × 9 种比例，补 9:21，如 1K 16:9 → 1536x864、4K 1:1 → 2880x2880），表外组合按 gpt-image 约束换算（16 的倍数、长边 ≤ 3840、总像素 655360–8294400）；移除 meta.rawSize，尺寸格式按协议决定：内置 OpenAI 发像素，上传协议收档位加比例。上游只认档位时在 sizeMap 填 1K。线上无模型使用 rawSize。客户端对应提交 4d657b0。无数据库迁移，schema 仍为 64。
应用 running=true、restarts=0，启动 2026-11-05T03:01:56Z；部署前后活动任务与未结算用量均为 0；Redis PONG、Bun 1.4.3；内网及公网首页、/admin/models、/api/pay/config 200，匿名 /api/admin/models、/v1/models 401；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/sizeTableRelease20261105（databaseBefore.dump 79219684 字节 SHA256 3cca4089…、releaseRollback.sh SHA256 4a7b85ba…），回退到 2.15.0-20261105；证据 docs/history/sizeTableRelease20261105/。生产回退未执行，未在浏览器验收后台表单，未用新尺寸实际生成。

### 上次发布：2.15.0-20261105

2026-11-05 10:13（北京时间）已更新到 **2.15.0-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.15.0-20261105
摘要：sha256:c95a00e52372316e8ebc01414aa4d233a0f59dfe71aac51c2b9f2659e0449fbf
源码提交：4ba121bf0d623b4a8736dd2b77d96bca7fe22d8f（goRewrite），vcs.modified=false。

本次媒体模型能力改为“留空即不限制”：网关只校验声明过的 imageSizes/imageRatios，sizeMap 缺失的组合按档位换算像素（长边 = 档位 × 1024，取 64 倍数），新增 meta.rawSize（档位原样转发）；后台新建模板不再预填尺寸、时长，去掉两条必填校验。客户端对应提交 0d79d2b 补通用选项。无数据库迁移，schema 仍为 64。
现有 6 个媒体模型都已声明尺寸、比例与时长，客户端选项不变；gpt-image-1.5、gpt-image-2 只声明 1K、没有 sizeMap，此前 size=1K 原样转发，现在换算为像素。这两个模型近期调用都因上游渠道失败，没有成功样本可对照。
应用 running=true、restarts=0，启动 2026-11-05T02:13:13Z；部署前后活动任务与未结算用量均为 0；Redis PONG、Bun 1.4.3；内网及公网首页、/admin/models、/api/pay/config 200，匿名 /api/admin/models、/v1/models 401；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/mediaDefaultsRelease20261105（databaseBefore.dump 79219696 字节 SHA256 c26e8a00…、releaseRollback.sh SHA256 4c71492d…），回退到 2.14.1-20261105；证据 docs/history/mediaDefaultsRelease20261105/。生产回退未执行，本次未在临时库或浏览器验收后台表单。

### 上次发布：2.14.1-20261105

2026-11-04 18:19（北京时间）已更新到 **2.14.1-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.14.1-20261105
摘要：sha256:a71db7c173ed9714da919a5a8806d706ea436f3302d824ee222c6626e42dfeef
源码提交：92da8edf8db89e33172be870137e02139bf83d84（goRewrite，已推送 origin），vcs.modified=false。

本次去掉文本模型“最大输出”参数（与 new-api 一致，输出上限由调用方 max_tokens 决定；客户端缺省按内置模型表，再缺省 32768）。后台表单与列表不再显示，保存时丢弃 meta.maxOutputTokens。迁移 63→64 清除已存值：claude-opus-5-5 16384、gpt-6-astra 128384、gpt-6.1-sol 128000（原值在备份数据库中）。
应用 running=true、restarts=0，启动 2026-11-04T10:19:29Z；部署前后活动任务与未结算用量均为 0；内网及公网首页、/admin/models、/admin/pricing、/api/pay/config 200，匿名 /api/admin/models、/v1/models 401；env 600、diff 仅 IMAGE。
备份与回退：/opt/maimai-cloud/backups/maxOutputRelease20261105（databaseBefore.dump 11395115 字节 SHA256 1c755f3a…、releaseRollback.sh SHA256 08ee313d…），回退到 2.14.0-20261105；证据 docs/history/maxOutputRelease20261105/。生产回退未执行。

### 上次发布：2.14.0-20261105

2026-11-04 17:40（北京时间）已更新到 **2.14.0-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.14.0-20261105
摘要：sha256:b64ec602aa67a17d88dd8ee52a48c4cd360a805a2f07bc8d89fdba4dc664d1da
源码提交：52a9ee6ee9fd17036fb4bac09a48bd0cd937f488（goRewrite，已推送 origin）；Go 内嵌 VCS 与 OCI revision 均为此提交，vcs.modified=false。

本次上线定价页改版与缓存计费（对齐 new-api 定价页）：“模型定价”改为模型列表（模式、价格摘要）+ 右侧“编辑模型定价”面板，按美元/百万 token 填输入、输出、缓存读取、缓存写入（5 分钟 / 1 小时），可选按 Token / 按次，提供 Claude/OpenAI/DeepSeek 缓存模板；JSON 视图为 new-api 同名六张倍率表。模型编辑器复用同一表单；messages 协议隐藏“上游格式”并补充最大输出说明。网关按缓存 token 分别计费，用量明细显示缓存读/写。
数据库迁移 61→63：model_pricing 新增 cache_ratio、cache_creation_ratio、cache_creation_1h_ratio（全为空，即与输入同价，现有扣费不变）；usage_logs 新增 cache_read_tokens、cache_write_tokens（默认 0）。claude-opus-5-5 仍未定价，需在后台填价后才对外提供。
部署仅原子替换 .env 的 IMAGE（其他字段不变、600），Compose 仅重建 app。
应用 running=true、restarts=0；Redis PONG、Bun 1.4.3；启动日志版本 2.14.0-20261105，启动 2026-11-04T09:40:38Z。部署前 activeVideo/activeImage/pendingUsage 均为 0；部署后 1 秒有一条用户 gpt-image-2.5-flare 请求进入并成功结算（cost=1000，与旧价一致）。
内网及公网 HTTPS 首页、/admin/pricing、/admin/models、/api/pay/config 均 200；匿名 GET /api/admin/pricing、/api/admin/models、PUT /api/admin/pricing、GET /v1/models 均 401。
发布前在本机临时库完成迁移、定价接口往返与浏览器验收；生产未登录后台、未改价格，生产回退未执行。

### 上次发布：2.13.0-20261105

2026-11-04 16:01（北京时间）已更新到 **2.13.0-20261105**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.13.0-20261105
摘要：sha256:e68dab3651eb0754d61b201f88cf9fdcb38ed121b2f2a63f95d7185a83dea8ae
源码提交：5838803a5c7a1548b063e7aeebcb8a8f3d41eb9b（goRewrite，已推送 origin）；Go 内嵌 VCS 与 OCI revision 均为此提交，vcs.modified=false。

本次上线 Anthropic 原生协议与提供商卡片：新增 anthropic 渠道类型与 /v1/messages 原生透传（x-api-key 鉴权、Anthropic 格式错误、含缓存 token 的计量）；路由按“类型 + 协议”匹配，协议不符返回 protocol_mismatch；后台新建渠道改为提供商卡片选择（内置 OpenAI 兼容与 Claude 预设，上传协议显示为插件），模型登记带协议。客户端对应提交 df0087a 把 messages 映射为 anthropic-messages，尚未打包桌面版。
无数据库迁移，schema 仍为 61。现有 2 个文本模型协议为 responses、渠道为 openai，不受影响。
部署仅原子替换 .env 的 IMAGE（其他字段不变、600），Compose 仅重建 app。
应用 running=true、restarts=0；activeVideo=0、activeImage=0、pendingUsage=0；Redis PONG、Bun 1.4.3。启动日志版本 2.13.0-20261105，启动 2026-11-04T08:01:58Z。
内网及公网 HTTPS 首页、/admin/channels、/admin/models、/api/pay/config 均 200；匿名 /api/admin/channels/types、/api/admin/models/missing、/v1/models 均 401；匿名 POST /v1/messages 返回 Anthropic 格式 401（authentication_error），无效 x-api-key 401。
发布前在本机临时库用假 Anthropic 上游完成流式透传、计费、协议不符拒绝与浏览器卡片页验收；生产未登录后台、未新建 anthropic 渠道、未发起生成，生产回退未执行。

### 上次发布：2.12.0-20261104

2026-11-04 已更新到 **2.12.0-20261104**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.12.0-20261104
摘要：sha256:4a3f17e7cd527784d681e15ea4ec44d6ac7db17d838c67f4f0a9faea17028d92
源码提交：43ea5b7d570cace0ecf6d0b331c10c6332290fc9（goRewrite，已推送 origin）；Go 内嵌 VCS 与 OCI revision 均为此提交，vcs.modified=false。

本次上线模型管理与定价改造（对齐 new-api）：定价改为倍率（模型倍率 1 = 每百万输入 token 2 美元，补全倍率乘输出；图片/视频按次美元价），按 settings `pricing.usdRate`=7.2 换元；定价单独存 model_pricing，可先于模型登记；未定价模型不对外提供（503 pricing_not_configured）。后台新增缺失模型登记、批量操作与筛选、分页签编辑抽屉（描述、标签）及“模型定价”页（表格/JSON、汇率）。
数据库迁移 56→61。生产 6 个模型全部换算为定价、无未定价模型：gpt-6-astra、gpt-6.1-sol 倍率 0.0694…、补全 4（输入 1 元、输出 4 元每百万 token，不变）；两个 gpt-image-2.5 与两个 grok-imagine-video 按次 0.01388… 美元（0.1 元，不变）。models 旧价格列保留供回退。
部署仅原子替换 .env 的 IMAGE（其他字段不变、600），Compose 仅重建 app。
应用 running=true、restarts=0；activeVideo=0、activeImage=0、pendingUsage=0；Redis PONG、Bun 1.4.3。启动日志版本 2.12.0-20261104，启动 2026-11-04T06:04:30Z。
内网及公网 HTTPS 首页、/admin/models、/admin/pricing、/api/pay/config 均 200；匿名 GET /api/admin/models、/api/admin/models/missing、/api/admin/pricing、PUT /api/admin/pricing/rate、GET /v1/models 均 401。
发布前在本机临时库完成迁移逐模型对比、22 项接口冒烟与浏览器验收；生产未登录后台、未改价格、未发起生成，生产回退未执行。

### 上次发布：2.11.0-20261103

2026-11-03 已更新到 **2.11.0-20261103**。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.11.0-20261103
摘要：sha256:4acb58f17f299f5df200a070147eb07ce2b060962d2331f7175916174d6b3bf9
源码提交：d5be9f858ec2e3c5f596849e238dae79b57bec6d；Go 内嵌 VCS 与 OCI revision 均为此提交，vcs.modified=false。

本次上线麦浪额度兑换：1 元 = 1 麦浪；在线充值保留原回调；新增管理员生成兑换码、用户一次性兑换和兑换记录；支付设置新增独立的兑换开关及外部商店链接。公开配置 redemptionEnabled=true，redemptionShopUrl 留空，待管理员填写实际商店地址。
部署仅原子替换 .env 的 IMAGE，其他配置与600权限保持，Compose仅重建app。
数据库迁移从54升至56，redemption_codes表已存在。Grok和OpenAI协议current/previous指针与发布前完全一致。
应用running=true、restarts=0；activeVideo=0、activeImage=0、pendingUsage=0；Redis PONG、Bun 1.4.3。
启动日志版本2.11.0-20261103，启动时间2026-11-02T18:29:13.546Z（北京时间2026-11-03 02:29:13.546）。
内网及公网HTTPS首页、/wallet、/api/pay/config均HTTP200；匿名GET /api/admin/redemptionCodes、GET /api/wallet/redemptions和POST /api/wallet/redeem均HTTP401。
本次未创建生产用户或兑换码，未执行充值支付；生产回滚未执行。

### 上次发布：2.10.3-202611030129

2026-11-03 已更新到 2.10.3-202611030129。
镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.10.3-202611030129
摘要：sha256:57709f3aa717312a1a37fe8a82a68a7edab47c6aa43fc8cc53a6c191d1e59042

本次：发布视频下载主地址与 fallback 支持，激活 Grok 1.2.0。优先使用同一上游任务的内容代理，下载失败后使用原视频地址；主地址与备用地址分别校验鉴权头。
Grok 当前修订：f8f85bef333fecb4da9ecfdb267a9cbad30472092346ed9a252c15138fdad6c0
上一修订：20b359ab0d3e905cd4d0ba1f88f472343ea4ad92299cd0b48089d87f3836869d
本次经旧 revision 与 previous_revision 精确校验后显式激活 1.2.0，历史修订保留；上传/恢复后重启不会覆盖。
只修复已完成任务 video_98f2e71cea094800a69baa4ac7ebaf1c 的固定 revision，条件包含任务 ID、protocolId、旧 revision、completed 和 settled；其他任务未迁移。该 3 秒任务净费仍为 0.3000 元，未再次生成。
数据库版本54；running=true，restarts=0；Redis PONG，Bun 1.4.3。
启动：2026-11-02T17:34:17.947489802Z；本机与公网首页HTTP200；匿名协议API返回401。客户端 collect 已HTTP200/completed，现有3秒任务成品已下载至工作区；FFmpeg解码通过，848×480、24fps、73帧、3.04秒，含AAC音轨。用户ESC停止UI，节点回填未执行。
领取后再次核对：目标任务净扣仍0.3000元，目标之后无新视频请求或任务，activeVideoTasks=0；未重复生成。
实际关联：OpenAI 图片仅 ccnccn 生图；Grok 视频仅 ccnccn Grok 视频。bot 文本继续走文本端点。
上次版本已验证能力400、源码新旧版本读取、默认升级、自定义与恢复版本重启保留。本次发布前无活跃视频任务、无 pending 用量记录，发布中未新发起生成。
视频编辑/延长等宿主入参及上游特殊计费未扩展，现有失败退款规则保留。

## 桌面本地安装包 2.1.9（2026-11-05）

- 源码提交：970bec1（版本），功能提交 565756f，分支 codex/simplifyMediaModels。内容：图片工具栏（信息、裁剪、放大、反推提示词、删除节点）、多图堆叠展示、图像设置面板重排（质量、自定义宽高、透明背景、张数 1–8）。自定义宽高经 other.pixels 转发，需云端提交 de59556（分支 uiRedesign，未部署）才按面积计费。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.9。安装包 `MaiMaiStudio-2.1.9-Setup.exe` 55,620,929 字节，SHA256 `a32e20f4a1831ade5f497aabd3abb900452f7de3f24baaddd1b71988e3fbac81`；清单 version=2.1.9、hash=2u2ec56c0xa9o。
- 打包退出 0；快照与 artifacts 一致；归档内含新设置面板、堆叠角标、反推提示词与 1–8 张校验。本地交付，未运行安装器，GitHub 仍为 2.1.0、更新源仍为空。详情见 releaseWorkflow.md。

## 上次桌面本地安装包 2.1.8（2026-11-05）

- 源码提交：cc5ba52（版本），功能提交 4d657b0，分支 codex/simplifyMediaModels。图片像素补齐改用与云端 2.15.1-20261105 相同的固定尺寸表，通用比例补 9:21。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.8。安装包 `MaiMaiStudio-2.1.8-Setup.exe` 55,604,248 字节，SHA256 `5ec61d202d8997a8f4d2bec1a72dd113c8c9c0380f4815fcae731cb0612ccd0d`；清单 version=2.1.8、hash=x8zkapnhcppb。
- 打包退出 0；快照与 artifacts 一致；归档 1729 项，含新尺寸表。本地交付，未运行安装器，GitHub 仍为 2.1.0、更新源仍为空。详情见 releaseWorkflow.md。

## 上次桌面本地安装包 2.1.7（2026-11-05）

- 源码提交：40a134c（版本），功能提交 0d79d2b，分支 codex/simplifyMediaModels。后台未声明的尺寸、比例、时长、分辨率由客户端补通用选项，与云端 2.15.0-20261105 配套。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.7。安装包 `MaiMaiStudio-2.1.7-Setup.exe` 55,603,645 字节，SHA256 `c68acf330ef374a98811270ff8b2cec51599b2cdfe75269981ccf0a84d21166d`；清单 version=2.1.7、hash=jvjp9gcgs7xc。
- 打包退出 0；快照与 artifacts 一致；归档 1729 项，含新代码。本地交付，未运行安装器，GitHub 仍为 2.1.0、更新源仍为空。详情见 releaseWorkflow.md。

## 上次桌面本地安装包 2.1.6（2026-11-05）

- 源码提交：6f9fa48（版本），功能提交 633bcd6，分支 codex/simplifyMediaModels。包含 @ 提及大图预览与画布高亮、节点短编号、悬浮对话框自由缩放与最大化、askUser 长选项换行。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.6。安装包 `MaiMaiStudio-2.1.6-Setup.exe` 55,606,955 字节，SHA256 `7c99242eb18c10494626a78a261581fbd34dcdf721d0652b54ab3dda7aa4ba4c`；清单 version=2.1.6、hash=u1hkyk7bsm72。
- 打包退出 0；快照与 artifacts 哈希一致；归档 1729 项、11 个节点插件齐全且含新代码。本地交付，未运行安装器，GitHub 仍为 2.1.0、更新源仍为空。详情见 releaseWorkflow.md。

## 更早桌面本地安装包 2.1.5（2026-11-05）

- 源码提交：a643650cb324a9b49ed486de794557d177f5c4c7（版本），分支 codex/simplifyMediaModels。包含 2.1.4 之后的 messages 协议映射（df0087a）、分镜表与角色库、成片时间线、生成节点增强、画布组输入与 JSON 导入导出、角色库修复（7bd6c50），以及 Claude 内置上限按官方补齐（f7daa19，claude-opus-5-5 等取 1M / 128K）。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.5。安装包 `MaiMaiStudio-2.1.5-Setup.exe` 55,603,692 字节，SHA256 `564d51d824ba3ca15c308e300fe3f8c58c40badc89bef66d4f3be1b8d9eda9a0`；清单 version=2.1.5、hash=2otkef5rvimk0。
- 打包退出 0；快照与 artifacts 哈希一致；归档 1729 项、11 个节点插件齐全，app/bun/index.js 含 claude-opus-5-5 条目。本地交付，未运行安装器，GitHub 仍为 2.1.0、更新源仍为空。详情见 releaseWorkflow.md。

## 更早桌面本地安装包 2.1.4（2026-11-04）

- 源码提交：92bae921a0df5e26245c3af6d8c0ce96a60dd464（修复 6edc944），分支 codex/simplifyMediaModels，2026-11-04 已推送 origin。修复图片下载「EUNKNOWN: unknown error, uv_spawn」：另存为 exe 无法启动时改用系统 PowerShell 弹窗，两者都失败时提示安全软件拦截。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.4。安装包 `MaiMaiStudio-2.1.4-Setup.exe` 55,557,551 字节，SHA256 `f2e9dcf70bd70383a7ca794eeb84f6c079a17d085d4d08ab76aac188bf4415c8`；清单 version=2.1.4、hash=2tgxuqgucfqv9。
- 打包退出 0、7-Zip `Everything is Ok`，兜底逻辑在包内确认存在。本地交付，未运行安装器，GitHub 仍为 2.1.0、更新源仍为空。详情、证据和回退见 releaseWorkflow.md 及 `docs/history/saveDialogDesktop21420261104/`。

## 上次桌面本地安装包 2.1.3（2026-11-04）

- 源码提交：2a64f19e65085e431b2a14756ea7788d4fc1b2fa，分支 codex/simplifyMediaModels；包含功能提交 7dc6f0a 的默认小手与工具顺序调整，进入工作区固定 selectedTool=hand，顺序为「添加 → 小手 → 框选箭头」。
- 构建命令：`bun run release:desktop 2.1.3 --initial`，退出 0。Bun 1.4.3；Windows x64；完整重建 Web、9 个节点插件、tools、ext、MCP 与桌面宿主。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.3。
- 安装包：`MaiMaiStudio-2.1.3-Setup.exe`，55,555,910 字节；SHA256 `292d9cb3a27d6a95967ff88e6cba8acd3f55d64e482272abf2b7ef63972786e6`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,233,028 字节；SHA256 `b4afcb72333a9bb9d8ce4bf50e6f5792d553e127afd08ffa56e026f31fb813a3`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `3e6aea70f6736804ff21e0bae9807b651466001bf9ce33edb5d5f70c5c1cf011`；version=2.1.3、stable/win/x64、hash=24tflcod9m5bx。
- 验证：修改前后桌面现有 typecheck 均退出 0；完整打包退出 0；7-Zip 完整性检查输出 `Everything is Ok`、退出 0。三资产快照与 artifacts 哈希一致，包内版本与清单一致，Web 入口与 9 个节点齐全；workspace 主 chunk 与本次 Web 构建一致，包含固定 hand 默认值以及小手先于框选的按钮顺序。
- 本次为本地安装包交付；GitHub 公开版本仍为 2.1.0，更新源仍为空。安装器留给用户运行测试，原有 AGENTS.md 修改保留。
- 构建日志、原始/修改后版本配置、差异及副本回退证据：`docs/history/canvasDesktop21320261104/`。ROLLBACK.sh 仅在独立配置副本恢复 app.version=2.1.2，SHA256 与原始配置一致；实际源码和产物保持 2.1.3，不更换已安装程序。
- 旧 2.1.2 安装包保留在其原快照目录；打包前已核对 SHA256 与旧记录一致。共享记忆修改前副本保存在本轮证据目录的 memoryBefore/。


## 上次桌面本地安装包 2.1.2（2026-11-04）

- 源码提交：e863f07e43b60d59d90de3342d8cdd4dcfd20297，分支 codex/simplifyMediaModels。包含空白拖动平移、Ctrl/Space 临时框选、滚轮直接缩放、视图与主工具栏分组、画布外观面板；原有 AGENTS.md 修改保留。
- 构建命令：`bun run release:desktop 2.1.2 --initial`，退出 0。Bun 1.4.3；Windows x64；完整重建 Web、9 个节点插件、tools、ext、MCP 与桌面宿主。
- 版本快照：D:\2api-codes\maimai\client\build\desktop\releases\2.1.2。
- 安装包：`MaiMaiStudio-2.1.2-Setup.exe`，55,558,298 字节；SHA256 `4eb3b65d9d20b3ba3854cce5b43a8b6459d7b588037ed2324bae3c8bee4b3d87`。
- 更新归档：`stable-win-x64-MaiMaiStudio.tar.zst`，58,257,193 字节；SHA256 `5e0da1e141583b5f32fb6629b35d394e4b26f4d5b833ce8dd93abbe711e85c1d`。
- 更新清单：`stable-win-x64-update.json`，209 字节；SHA256 `2409c0b58dcb195532e31688d4f04fcbb798c5f6e08468a2ce78180812d32906`；version=2.1.2、stable/win/x64、hash=3auovr8uo0d3d。
- 验证：桌面现有 typecheck 退出 0；NSIS 构建退出 0；7-Zip 完整性检查 `Everything is Ok`、退出 0。归档内版本与清单一致，Web 入口与 9 个节点齐全；压缩 Web 中确认 pan=None、zoom=None / Ctrl、selection=Ctrl / Space，以及外观/背景/滑条/临时框选标记。
- 交付为本地安装包，供用户安装测试；GitHub 公开版本仍为 2.1.0，更新源仍为空。未运行安装器或替换已安装程序，实际画布交互待用户验收。
- 源码原始/修改后快照、差异、日志、三资产摘要与回退验证：`docs/history/canvasDesktop21220261104/`。ROLLBACK.sh 在独立副本恢复 9 个文件，SHA256 全部匹配，配置恢复 2.1.1；当前源码及安装包保持 2.1.2。脚本仅恢复源码，不撤销提交或更换已安装程序。
- 旧 2.1.1 安装包保留在其原版本快照目录，SHA256 与旧记录一致；共享记忆修改前副本保存在本轮证据目录的 memoryBefore/。

## 上次桌面本地安装包 2.1.1（2026-11-03）

画布交互调整已生成 Windows x64 完整安装包，源码提交 `af1dd9803ef7f3d89fbee9a049d68f59209837cb`。客户端配置版本为 2.1.1；此次交付为本地安装包，云端线上版本仍以本文件原2.11.0记录为准。

- 安装包：D:\2api-codes\maimai\client\build\desktop\releases\2.1.1\MaiMaiStudio-2.1.1-Setup.exe。
- 大小：55,554,914 字节；SHA256：`4f18ccc3b377a58aef842fc6c2f76199e498557149320fd5e29d5959f9beec33`。
- 更新清单：stable/win/x64，version=2.1.1，hash=k3lwy0s95yh0；归档及清单位于同一版本目录。
- 构建命令 `bun run release:desktop 2.1.1 --initial` 退出0，安装器完整性检查输出 `Everything is Ok`。归档内Web与全部9个节点插件已核验，本轮按钮改动已进入图片/生图节点。
- 原始源码/修改快照、哈希与回退验证位于 `docs/history/canvasDesktop21120261103/`；7文件回退副本哈希一致且恢复版本2.1.0，当前源码保持2.1.1。
- 旧2.1.0安装包仍保留在 D:\2api-codes\Toonflow-app\build\desktop\releases\2.1.0\MaiMaiStudio-2.1.0-Setup.exe，哈希与原记录一致。本次没有执行已安装程序的替换或生产回退。
- 完整三资产摘要与说明见 [发布流程](releaseWorkflow.md)；共享记忆修改前副本存于本次证据目录 `memoryBefore/`。

## 构建与发布

使用 server/Dockerfile，根 Dockerfile 属于旧 TS 版本。
Go：CGO_ENABLED=0 GOOS=linux GOARCH=amd64，go build -trimpath -ldflags "-s -w -X maimai/internal/config.Version=<版本>"。
前端：web 目录 bun run typecheck 和 bun run build，构建资源放镜像上下文 web/。
Docker：docker build --platform linux/amd64 -f server/Dockerfile -t <带版本镜像> <包含 maimai 与 web 的上下文>。
推送使用已登录的腾讯云镜像仓库。每次使用唯一版本标签并核对服务器拉取后的 digest。

上次麦浪发布构建上下文（历史路径，产物未迁入新目录）：
D:\2api-codes\maimai-cloud\build\mailangRelease20261103

发布前先读当前镜像、Compose 路径和数据库版本，确认活动任务及未结算用量归零，备份数据库及部署配置。先显式拉取目标镜像并核对 digest，再只更新 .env 的 IMAGE 行，使用原权限原子替换，保留其他字段，并重查配置与任务状态。在 /opt/maimai-cloud 执行：
docker compose -f docker-compose.yml up -d --no-deps --wait --wait-timeout 60 --timeout 40 app

发布后核对容器版本与重启次数、数据库/Redis、Bun、HTTPS 页面与新接口。后续用户明确要求更新、推送或部署时再执行相应操作，单纯读取这份记录不重复发布。

## 本次备份与回退

目录：/opt/maimai-cloud/backups/anthropicRelease20261105（权限700）。
包含 envBefore、composeBefore.yml、imageBefore.txt、stateBefore.txt（模型协议与渠道类型）、databaseBefore.dump、databaseContents.txt、envAfter、releaseRollback.sh。
数据库备份：1123162 字节，权限600；SHA256 66579d2b8af3ffa2337ac24d551f1d11a2b2da5ab6e08d1f5c18ee7b9a68ab08；pg_restore --list 168 行。
旧镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.12.0-20261104。
回退入口：/opt/maimai-cloud/backups/anthropicRelease20261105/releaseRollback.sh（权限700，SHA256 e066e46e2dd13f883bdd377d8e4a684ce915a0c1a1c82dc76cbf4c493f89d2cc，与本地副本一致，sh -n 通过）；本次未执行回退。
回退只在镜像与 .env 仍为本次发布状态时恢复旧 IMAGE 并重建 app；本次无迁移，不恢复数据库。发布后新建的 anthropic 渠道和 messages 模型旧镜像不认，回退前先停用。

### 上次发布备份与回退（2.12.0）

目录：/opt/maimai-cloud/backups/pricingRelease20261104（权限700）。
包含 envBefore、composeBefore.yml、imageBefore.txt、stateBefore.txt（含迁移前各模型旧价格）、databaseBefore.dump、databaseContents.txt、envAfter、releaseRollback.sh。
数据库备份：1121452 字节，权限600；SHA256 525fd72e0a82fc51bd419da55eaa9f95785402c83bbe654f41ad748627f136ac；pg_restore --list 165 行。
旧镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.11.0-20261103。
回退入口：/opt/maimai-cloud/backups/pricingRelease20261104/releaseRollback.sh（权限700，SHA256 7ffa8fcd608715321083cdcc2aac599d1dc39d36522a03441d115feb5301b5df，与本地副本一致，sh -n 通过）；本次未执行回退。
回退只在镜像与 .env 仍为本次发布状态时恢复旧 IMAGE 并重建 app；保留 model_pricing 等新表，不恢复数据库。旧镜像读 models 旧价格列，发布后在新后台改的价格回退后不生效。

### 上次发布备份与回退（2.11.0）

目录：/opt/maimai-cloud/backups/mailangRelease20261103（权限700）。
包含 envBefore、composeBefore.yml、imageBefore.txt、stateBefore.json、databaseBefore.dump、databaseContents.txt、envAfter、stateAfter.json、releaseRollback.sh。
数据库备份：1115013字节，权限600；SHA256 dd4ca850abdc01e74b0f24d64877a25126b4003b4a9251f39d30d74e86af4b2b；pg_restore --list退出0、目录154行。
旧镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.10.3-202611030129。
回退入口：/opt/maimai-cloud/backups/mailangRelease20261103/releaseRollback.sh（权限700）。
脚本与本地副本逐字节一致，sh -n和内嵌Python语法检查通过；本次未在生产执行回退。
回退只在当前镜像及.env仍符合本次发布状态时恢复旧IMAGE，再重建app；保留新增表、兑换码、历史协议和账目，不自动恢复整个数据库备份。

### 上次发布备份与回退

目录：/opt/maimai-cloud/backups/grokDownloadRelease202611030130
包含 envBefore、composeBefore.yml、imageBefore.txt、stateBefore.json、databaseBefore.dump、databaseContents.txt、releaseState.json、releaseSource.ts、releaseMetadata.json、activationAfter.json、releaseRollback.sh。
数据库备份：1114874 字节，权限600；pg_restore --list通过。
SHA256：0380f7ecfafac0036fbc7c41a08cdb992e6aa1501620c96ed1d6a9b215bca523
旧镜像：ccr.ccs.tencentyun.com/echotools/maimai-cloud:2.10.2-202611022305
回退入口：/opt/maimai-cloud/backups/grokDownloadRelease202611030130/releaseRollback.sh
脚本权限700、语法检查通过，本次未执行线上回退。
回退只恢复IMAGE，以及仍处于本次发布状态的Grok协议指针和该目标任务的旧修订号；保留历史版本、视频任务和账目。若管理员后续更改对应状态，条件不符会停止。写回 .env 前重复检查快照，避免覆盖并发修改。数据库备份不自动恢复。
生产回退脚本仅执行 bash -n 与内嵌 Python 语法检查，本次没有在生产运行回退。此前备份仍保留。

## 本次交付记录

D:\2api-codes\maimai\docs\history\cachePricingRelease20261105\（releasePrepare.txt、releaseDeployCommand.txt、releaseVerify.txt、releaseRollback.sh）；备份与回退 /opt/maimai-cloud/backups/cachePricingRelease20261105（envBefore、composeBefore.yml、imageBefore.txt、databaseBefore.dump 3613736 字节 SHA256 7cf18c6c…、databaseContents.txt、envAfter、releaseRollback.sh 700 SHA256 02e5330b…），回退到 2.13.0-20261105，只恢复 IMAGE，新增列保留。

### 2.13.0 发布记录

D:\2api-codes\maimai\docs\history\anthropicRelease20261105\（releasePrepare.txt、releaseDeployCommand.txt、releaseVerify.txt、releaseRollback.sh）

### 2.12.0 发布记录

D:\2api-codes\maimai\docs\history\pricingRelease20261104\（releasePrepare.txt、releaseDeployCommand.txt、releaseVerify.txt、releaseRollback.sh）

### 2.11.0 发布记录

D:\2api-codes\maimai\docs\history\mailangRelease20261103\releaseDeployment.txt
D:\2api-codes\maimai\docs\history\mailangRelease20261103\releaseCloud.txt
D:\2api-codes\maimai\docs\history\mailangRelease20261103\releaseRollback.sh

### 上次发布记录

D:\2api-codes\.codexArtifacts\grokDownloadFallback20261103\releaseDeployment.txt
D:\2api-codes\.codexArtifacts\grokDownloadFallback20261103\releaseRollback.sh

上次发布时源码未提交；现已由8d7ab2e保存此前上线协议功能，并由d5be9f858ec2e3c5f596849e238dae79b57bec6d提交本次麦浪功能。
