# GhostSet Live

一场由四个开发座位用密封二次方赞助实时决定曲目的链上演出；回合在 MagicBlock Ephemeral Rollup 内执行，赞助款按 DJ 50%、作曲 30%、视觉 20% 记账，最终一次 commit + undelegate 回 Solana L1 提现。

## 架构

- `Show` PDA：`["show", show_id.to_le_bytes()]`，固定大小，保存四个座位、三个曲目、当前回合、VRF 状态、得分历史和全部负债；只委托这个数据账户。
- `Vault` PDA：`["vault", show_id.to_le_bytes()]`，始终留在 L1，保存 rent 下限与总负债，实际 lamports 覆盖座位 credit、回合 escrow、未结算池和受益人待提款。
- L1：创建、座位充值、委托、最终提现。
- ER：一次 VRF 请求与异步回调、开回合、commit/reveal、结算、取消、最终 commit + undelegate。
- 公共演示隐私只承诺应用层 hash commit/reveal；reveal 后明细公开，不宣称公共 ER 是 TEE/PER。

状态机：`Uninitialized → Funded → Delegated → VrfReady → Running → Finalizing → OnL1 → Closed`。`abort_show` 设置取消标记并退回当前回合尚未分配的 escrow/pool，之后可走同一 finalize 路径。

## Commitment

```text
hashv(
  "GHOSTSET:PLEDGE:V1",
  show_pubkey,
  round_index_u8,
  seat_index_u8,
  seat_authority_pubkey,
  track_u8,
  amount_u64_le,
  secret_32_bytes,
)
```

每座位每回合 commit 时托管相同上限 `B`；有效 reveal 必须满足 `0 < amount <= B`，立即退回 `B - amount`。未揭示者的整个 `B` 在关回合时进入赞助池但不计分。得分为各曲目有效 pledge 的 `floor_sqrt(amount)` 之和，得分并列时赢家固定取最小 track ID（确定性规则）。版税前两项按 bps 向下取整，尾差给视觉受益人。

## 回合、取消与 VRF 规则

- `commit_slots` 与 `reveal_slots` 均按 ER slot 计（约 10 ms/slot）；20 秒回合约 2,000 slot，且两者之和必须小于 `INACTIVITY_SLOTS` 的 60,000 slot。
- `delegate_show` 与 `request_show_randomness` 须由同一脚本连续发送。若 authority 在委托成功后、请求 VRF 前掉线，`Delegated + Idle` 状态没有免许可超时通道，须由 authority 本人调用 `abort_show`（已知限制）。
- 除 authority 可主动取消外，满足以下超时条件后，任意人均可调用 `abort_show`：

| 状态或条件 | 超时规则 |
| --- | --- |
| `Funded` | 超过 216,000 L1 slot（约 24 小时） |
| VRF 请求挂起（`vrf_status = Requested`） | 超过 180 秒 |
| `VrfReady` / `Running` 无进展 | 超过 60,000 ER slot（约 10 分钟） |

- MagicSVM 0.3.0 在本地不会履行 `ephemeral-rollups-sdk` 0.18.0 的 scoped VRF 请求；VRF 回调与多轮流程以 devnet 真实预言机的验证结果为准。

## 版本

- Anchor `1.0.2`
- `ephemeral-rollups-sdk =0.18.0`，features：`anchor`、`vrf`、`access-control`
- MagicSVM `0.3.0`
- 程序 ID：`J51DHXGLVp6biftQf9ZhWCqYeH1AF8xWaX95EboE9GM3`

## 运行

先安装锁版工具链并构建程序：

```bash
npm run build
```

运行整数平方根单元测试和 MagicSVM 测试：

```bash
cargo test -p ghostset-live --lib
npm test
```

MagicSVM 测试读取 `target/deploy/ghostset_live.so`，覆盖：

1. 初始化与四座位充值 → 委托 → ER 写入 → 最终 commit + undelegate → L1 读回；
2. ER VRF 请求 → `warp_to_slot` 触发异步回调 → 读取 `VrfReady`。

本地完整 ER 服务可使用固定版本：

```bash
npx --yes --package=@magicblock-labs/ephemeral-validator@1.1.1 mb-stack
```

本地 stack、MagicSVM 与 devnet 验证的边界不同；路由、真实 VRF 预言机、跨层传播和提现仍需后续 devnet 端到端验证。不要提交 keypair、`.env` 或本地秘密文件。
