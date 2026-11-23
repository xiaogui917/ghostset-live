# GhostSet Live：VRF 回调 + finalize 修复记录（2026-11-23）

## 已修复（本地 commit，未推送；程序 ID 不变）

### Bug 1：VRF 回调烧光全部算力
- 根因：`#[vrf_callback]` 宏注入的 `#[account(address = Pubkey::new_from_array(scoped_vrf_identity_const(&crate::ID).0))]` 在运行时求值纯 Rust Ed25519 派生（`const_crypto`，只供编译期），每次回调烧光 200,000+ CU。
- 修复：顶层编译期常量 `SCOPED_VRF_IDENTITY`（`Pubkey::new_from_array(scoped_vrf_identity_const(&crate::ID).0)`），`VrfCallback` 显式声明 `vrf_program_identity` 字段（identity 在前、show 在后，IDL 顺序不变）。常量已核实与链下 PDA 派生一致：`GvJtcNdcm3tD1zJPuUTjwSwpa95Wcrmm585jtSCuv3nG`。
- 新 .so：485,232 字节（原 515,464），sha256 `64ece47d6d072e290a8b2e92c08ec1cd3d2188ec2fb18460e3adc778384321cb`（原 `ef82fdb2…`）。IDL 唯一变化：vrf_callback 的 identity 字段多了 address 常量。

### Bug 2：finalize_show 报 ExternalAccountDataModified
- 根因：`FinalizeShow.show` 是 typed `Account<Show>`，Anchor 在 handler 返回后自动写回；Magic CPI 调度 undelegate 后所有权已转出，写回触发 SIMD-0460 检查。
- 修复：`show` 改 `UncheckedAccount`（seeds + 普通 bump）；handler 用 `read_show` 做全部原检查（另加 owner 检查），`write_show` 在 Magic CPI **之前**写盘，CPI 后不再碰 show。沿用本项目 `delegate_show` 已验证的模式。
- `VRF_TIMEOUT_SECONDS` 180 → 600 秒（预言机首次回调实测约 119 秒）；demo 脚本 VRF 等待 190 秒 → 660 秒，finalize L1 等待 180 秒 → 600 秒并加 owner 检查。

## 验证（均通过）
- 三家会诊：Kimi 与 Gemini 一致推荐方案 A/A；Claude Opus 4.6 因 agy 额度耗尽（429，96 小时后恢复）未能参与。
- Kimi 实施（CodeArts CLI，--variant max），diff 已逐行复核，无计划外改动。
- `anchor build` 通过；MagicSVM 生命周期测试 `minimal_delegate_er_write_commit_undelegate_lifecycle` 通过（abort → finalize → L1 落回 OnL1 + finalize_scheduled）。
- Gemini 3.8 Flash-high 审计 PASS（五项全过，可部署）。

## 待办（部署被资金卡住）
- 死局 show 8513420953816546564 已 abort（交易 `4qpckVzeEdRxgFwj2mRUKtzmawE5viMFGEXpN6j7pVXRH83tiivspx21k5xL8yokU6kA2J6nmMm78sawvnhC8apz`，cancelled=true）；另两个废弃 show 也已定位：301313116374024048（`GtFsfYkvd3YCybFya5247DQR5saqDRam5RsprSffVN6k`）与 14440634207599454842（`C3hQwD3jPauzXhzCbCWU2fbHug45q2bcXyaSxeUBL7Mq`），各锁 2.0 SOL。
- **资金缺口**：新 buffer 租金 2.46597932 SOL；house 0.93689004 SOL，4 席各 0.099985 SOL，流动合计 1.33683 SOL，缺口约 1.13 SOL。三 show vault 共锁 6.0 SOL，但须先重部署（修复后的 finalize）才能取出——循环依赖。
- **解锁**：网页水龙头约今晚 22:40 HKT 后可再领（8 小时内已领满 2 次）；领 5 SOL 后按以下顺序走：
  1. `solana program write-buffer target/deploy/ghostset_live.so --url https://api.devnet.solana.com --keypair <house> --use-rpc --max-sign-attempts 20 --commitment processed`（新 buffer，不要复用旧 buffer），再 `solana program deploy --buffer <新buffer> --program-id target/deploy/ghostset_live-keypair.json`，核对链上程序 hash 与本地一致。
  2. 依次跑 `node scripts/recover-show.mjs <showId>` 回收三 show（8513420953816546564、301313116374024048、14440634207599454842）：abort（如已取消则跳过）→ finalize → 4 席 withdraw。
  3. 席位补到 0.55 SOL 以上（demo 的 ensureFunds 要求），跑 `npm run demo:show` 端到端，验证真实 VRF 回调、多轮、版税提现。
- 部署用 `--keypair ~/workspace/agent-earn/.secrets/ghostset_house.json`（默认 `~/.config/solana/id.json` 不存在，不要用）；PATH 须含 `$HOME/.local/share/solana/install/active_release/bin`。
