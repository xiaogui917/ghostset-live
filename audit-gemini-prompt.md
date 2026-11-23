# GhostSet Live 锚程序代码审计（Gemini 3.8 Flash-high）

## 背景
Solana Blitz v10 黑客松（MagicBlock），项目 GhostSet Live：Ephemeral Rollup 里的密封二次方赞助歌单秀。观众用密封二次方赞助实时决定下一首歌，赞助款按版税自动分给 DJ 50% / 作曲 30% / 视觉 20%。奖金 $1,000 USDC，提交截止 2026-11-27 22:00 HKT。

## 审计对象
- 程序源码：`/home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs`（约 1200 行，请通读全文）
- 设计文档：`/home/hatch/workspace/agent-earn/magicblock-blitz/DESIGN.md`（若不存在，读 `ghostset-live/` 下的 README.md）
- 依赖：anchor-lang 1.0.2、ephemeral-rollups-sdk 0.18.0（features: anchor、vrf、access-control）、solana-program 3.0.0

## 程序要点
- Show 与 Vault 两个固定大小 PDA 账户（不 realloc）；状态机 Uninitialized → Funded → Delegated → VrfReady → Running → Finalizing → OnL1 → Closed。
- 12 条指令：initialize_show、join_show、delegate_show、request_show_randomness、vrf_callback、open_round、commit_pledge、reveal_pledge、close_round、abort_show、finalize_show、withdraw。
- 4 个座位、3 条曲目、3 个受益人；版税 bps [5000, 3000, 2000] 合计 10000。
- VRF：`#[vrf]` 请求 + `#[vrf_callback]` 回调，nonce 绑定，180 秒超时，回调须幂等。
- commit/reveal：域分隔 hash 绑定 show/round/seat/authority/track/amount/secret；commit 时托管固定上限 pledge_cap，未揭示没收 escrow。
- 二次方计分：score[t] = Σ floor_sqrt(amount)；整数平方根独立函数 + checked math、u128 中间计算。
- 负债不变量：Vault 可用 lamports >= 用户 credit + escrow + 受益人待提 + 未结算池；每条指令末尾 assert_show_invariant + assert_vault_covers。
- 委托：`#[delegate]` + MagicIntentBundleBuilder；提交：`#[commit]` commit_and_undelegate；VRF 队列只允许 DEFAULT_EPHEMERAL_QUEUE / DEFAULT_EPHEMERAL_TEST_QUEUE。

## 审计要求
只做静态审查，不执行命令、不改文件。重点查：
1. 资金安全：Vault 托管、提现、租金下限、负债不变量有无绕过；initialize 时手动 create_account CPI + 序列化写入是否正确。
2. 授权：每条指令的 signer / authority 检查是否充分（join、commit、reveal、withdraw、abort、finalize）。
3. VRF 回调认证与重放/超时处理；nonce 绑定是否严密。
4. commit/reveal 绑定是否严密：能否换曲目、换金额、重放、提前揭示。
5. 二次方计分与版税分配的算术：溢出、舍入、平局处理、余数归属。
6. 状态机非法跃迁；回合阶段（Commit/Reveal/Closed）检查。
7. 委托/commit/undelegate 流程：delegate 时的 show owner 检查、finalize 顺序、commit 后状态。
8. Anchor 与 ephemeral-rollups-sdk 0.18.0 的用法错误（宏注入账户、CPI 参数、UncheckedAccount 的 CHECK 注释是否名副其实）。

## 输出格式
按严重程度分级（Critical / High / Medium / Low / Info）列出每个问题：文件行号、问题描述、利用场景、修复建议。没有问题的方面也逐项说明通过。最后给总体结论：能否上 devnet。只输出审计报告，不要复述源码。
