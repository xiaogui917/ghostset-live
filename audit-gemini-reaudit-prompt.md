# GhostSet Live 审计修复复核（Gemini 3.8 Flash-high，聚焦 diff）

## 背景
你是 Solana/Anchor 安全审计员。上一轮审计（audit-gemini.md，结论 CONDITIONAL PASS FOR DEVNET）发现 H-01（Funded 阶段资金死锁）与 M-01（演出中途 authority 掉线无免许可终止）。现已修复，只复核本次 diff，不重审全文件。

## 复核对象
- diff 文件：/tmp/ghostset_fix.diff（git diff，相对 ghostset-live/ 的 programs/ghostset-live/src/lib.rs）
- 完整源码对照：/home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs
- 上轮审计报告：/home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/audit-gemini.md

## 修复内容摘要
1. Show 新增 u64 字段 last_progress_slot（InitSpace 自动计入 SPACE）；initialize_show 置为当前 Clock slot；delegate_show、vrf_callback、open_round、close_round 更新为当前 slot。
2. 新增常量 INACTIVITY_SLOTS = 60000（ER slot 约 10ms，约 10 分钟）、FUNDING_TIMEOUT_SLOTS = 216000（L1 slot 约 400ms，约 24 小时）。
3. abort_show：状态范围扩到 Funded|Delegated|VrfReady|Running；免许可条件新增 funding_timed_out（Funded 且 slot > last_progress_slot + 216000）与 inactivity_timed_out（仅 VrfReady|Running 且 slot > last_progress_slot + 60000）；Funded 取消时直接置 state = OnL1、finalize_scheduled = true、cancelled = true、vrf_status = Aborted，不走 commit_and_undelegate。

## 复核重点
1. Funded 取消路径：withdraw 的 OnL1 && finalize_scheduled 条件是否满足；finalize_show 是否会被重复触发（finalize_scheduled 检查）；退款循环空操作时 refunded == escrow + pool 校验是否成立；不变量是否保持。
2. slot 域一致性：Funded 用 L1 slot 对 L1 slot；VrfReady/Running 用 ER slot 对 ER slot；Delegated 被排除在 inactivity 规则之外是否正确（delegate_show 在 L1 上写 last_progress_slot，若纳入会在 ER 上误触发）。
3. 有无新增 griefing 或绕过：任意人取消的条件是否过宽；authority 路径是否收窄；checked math 是否完备。
4. 其余未改动逻辑是否受新字段影响（Show 布局变化、SPACE、序列化）。

## 输出
只输出复核结论：每个问题按严重程度分级（Critical/High/Medium/Low/Info）给行号、描述、修复建议；无问题则逐项说明通过；最后给一句话总体结论（能否上 devnet）。不要复述源码。
