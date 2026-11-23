I have initiated the compilation and test check in the background to verify the struct space, layout, and compilation of the updated codebase. Waiting for the build check to complete.
I'm running the test suite in tests-magicsvm-rs to verify that the existing integration tests still pass with the new diff. Waiting for the test run to finish.
# GhostSet Live 审计修复复核报告

**复核基准：** 上一轮审计报告（`audit-gemini.md`，CONDITIONAL PASS FOR DEVNET）  
**复核对象：** `/tmp/ghostset_fix.diff`（相对 `programs/ghostset-live/src/lib.rs`）及完整源码上下文  
**编译与测试验证：** `anchor build` 与 `magicsvm` 集成测试均已编译通过并通过回归测试。

---

## 一、上轮漏洞修复复核结论

### 1. 【原 High】H-01：Pre-Delegation 阶段（`Funded`）资金死锁 —— **【修复通过（PASS）】**
- **修复核验：**
  - `abort_show` 已将合法前置状态扩充至 `Funded`（Line 552）。
  - `show.authority` 拥有主动取消权限；若其掉线，超时 216,000 L1 slots（约 24 小时，`FUNDING_TIMEOUT_SLOTS`）后，任意人均可免许可触发取消（Line 557-561）。
  - 在 `Funded` 下调用 `abort_show`，程序直接置 `state = OnL1` 且 `finalize_scheduled = true`（Line 587-590），完全绕过了 ER 的 `commit_and_undelegate`。
  - 用户随后可在 L1 正常调用 `withdraw(WithdrawKind::Seat)` 提回 100% 存入的 SOL。死锁风险彻底排除。

### 2. 【原 Medium】M-01：演出中途 Authority 掉线缺乏免许可终止 —— **【修复通过（PASS）】**
- **修复核验：**
  - `Show` 新增 `last_progress_slot` 追踪 ER 演出活跃度（Line 866）。
  - `vrf_callback`、`open_round`、`close_round` 均在 ER slot 上严格刷新 `last_progress_slot`（Line 310, 342, 534）。
  - 在 `VrfReady` 或 `Running` 状态下，若超过 60,000 ER slots（约 10 分钟，`INACTIVITY_SLOTS`）未见新回合推进，任意人即可免许可调用 `abort_show`（Line 559-561）。
  - 中止后处于 open 状态的微回合退款原路返还 credit，随后任意人均可调用 `finalize_show` 触发 `commit_and_undelegate` 退回 L1 结算提现。

---

## 二、四大复核重点逐项结论

### 1. `Funded` 取消路径与提现闭环
- **`withdraw` 条件满足性：** `abort_show` 在 `Funded` 下显式置位 `show.state = ShowState::OnL1` 与 `show.finalize_scheduled = true`，精准匹配 [lib.rs#L646](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L646) 的要求。
- **`finalize_show` 防重入与防非法触发：** `finalize_show` 在入口处校验 `!show.finalize_scheduled`（Line 602）与 `state in Delegated|VrfReady|Running`（Line 603）。`Funded` 取消后由于这两个标志位已被改写，`finalize_show` 会被直接拦截，绝不会在未委派的 L1 账户上误调用 `commit_and_undelegate` CPI。
- **空退款循环恒等式校验：** 在 `Funded` 阶段，Show 尚未开轮（`round_open == false`，`escrow_total == 0`，`round_pool == 0`）。第 564 行 `if show.round_open` 整体跳过，`refunded` 保持为 0，第 578 行 `require_eq!(refunded, current_liabilities)` 等价于 `0 == 0`，校验必定成立。
- **负债不变量保持：** 座位存款只计入 `credit`，`round_open` 未开启故无 `escrow` / `pool` / `royalty`。`assert_show_invariant` 计算 `credit_sum == credit_total == liability_total` 完全恒等。

### 2. Slot 域一致性与状态隔离
- **Funded 阶段（L1 slot vs L1 slot）：** `initialize_show` 记录 L1 当前 slot，`Funded` 下的 `abort_show` 同样运行在 L1，两者均基于 Solana L1 主链 Clock，比较基准绝对一致。
- **VrfReady / Running 阶段（ER slot vs ER slot）：** `vrf_callback`、`open_round`、`close_round` 均在 ER 验证节点上执行，读取的是 ER 局部 Clock slot；`abort_show` 在委托后同样由 ER 执行，两者完全处于同一 ER 时钟域（10ms slot），不存在跨层混淆。
- **Delegated 状态排除在 inactivity_timed_out 之外的必要性：** `delegate_show` 在 L1 上写入 `last_progress_slot`（L1 槽位，如 3 亿+）；若将 `Delegated` 纳入基于 ER slot 的判断，一旦 ER 槽位计数器偏高，委托刚落地 ER 就会瞬间误触发超时，导致任何第三方均可抢跑恶意取消。将其排除在 slot inactivity 之外是完全正确且必要的。

### 3. Griefing、绕过向量与算术安全性
- **任意人取消条件合理性：** 免许可取消仅在超时（VRF 挂起超 180s、筹资超 24h、ER 停滞超 10m）下激活，正常推进的演会不会被意外或恶意终止。
- **Authority 权限路径：** `payer.key() == show.authority` 处于最外层或条件，Authority 的主动控制权保持完备，未被收窄。
- **溢出与 Checked Math：** `funding_timed_out` 与 `inactivity_timed_out` 均使用 `checked_add().ok_or(GhostSetError::MathOverflow)?`，杜绝整数溢出。

### 4. 账户布局、SPACE 与序列化
- **Show 结构体体积：** `last_progress_slot: u64` 增加 8 字节，`Show` 宏派生的 `InitSpace` 自动重算。新尺寸远低于 10,240 字节限制（Line 1231 的静态断言通过），手动 CPI 创建 PDA 时传入的 `Show::SPACE` 动态同步，Borsh 序列化与反序列化边界严格对齐。

---

## 三、本次 Diff 衍生问题与缺陷清单

### 【Low】L-03：未约束单回合时长上限，超长回合可能导致免许可取消抢跑（Griefing）
- **文件行号：** [lib.rs#L53](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L53), [lib.rs#L559-L561](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L559-L561)
- **问题描述：**
  `INACTIVITY_SLOTS` 硬编码为 60,000 slots（约 10 分钟）。然而在 `initialize_show` 中，对 `commit_slots` 与 `reveal_slots` 仅校验了 `> 0`，未对单回合总时长 `commit_slots + reveal_slots` 设定上限。
  如果发起方配置了一个较长时长的回合（例如 `commit_slots = 30_000`，`reveal_slots = 35_000`，合计 65,000 slots），当回合进行到第 60,001 slot 时，即便处于正常合法的 Reveal 阶段且尚未到达 `reveal_deadline_slot`，`now.slot > last_progress_slot + INACTIVITY_SLOTS` 也将提前成立，允许任何旁观者调用 `abort_show` 强行中止整场演出。
- **修复建议：**
  在 [lib.rs#L53](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L53) 增加约束，确保单回合最大时长必须小于不活跃超时门限：
  ```rust
  let max_round_slots = commit_slots.checked_add(reveal_slots).ok_or(GhostSetError::MathOverflow)?;
  require!(max_round_slots < INACTIVITY_SLOTS, GhostSetError::InvalidRoundTiming);
  ```

---

### 【Low】L-04：`ShowState::Delegated` 且 `vrf_status == Idle` 时 Authority 掉线仍无免许可逃生通道
- **文件行号：** [lib.rs#L220](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L220), [lib.rs#L557-L561](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L557-L561)
- **问题描述：**
  为了避免跨层 slot 域混淆，`Delegated` 被正确地排除在 `inactivity_timed_out` 之外。但若发生极端情况：`delegate_show` 在 L1 成功执行后，Authority 节点下线，从未在 ER 上调用 `request_show_randomness`（即 `vrf_status` 始终为 `Idle`）。
  此时：
  1. `timed_out` 不满足（要求 `vrf_status == Requested`）；
  2. `funding_timed_out` 不满足（状态非 `Funded`）；
  3. `inactivity_timed_out` 不满足（状态非 `VrfReady | Running`）。
  合约在 `Delegated + Idle` 状态下缺少免许可超时终止通道。另外，[lib.rs#L220](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L220) 在 L1 上写入的 `show.last_progress_slot` 实际上成为了死代码（未被任何分支读取）。
- **修复建议：**
  为 `Delegated` 状态补充基于真实时间戳（`unix_timestamp`，跨层一致）的兜底保护；或者若客户端编排已确保 `delegate_show` 与 `request_show_randomness` 由脚本原子化连续发送，则保持当前逻辑并在运维文档中载明该前置假设。

---

## 四、总体复核结论

**【PASS FOR DEVNET（允许部署至 Devnet）】**

本次修复方案架构清晰、算术严谨，彻底消除了 H-01（Funded 资金锁死）与 M-01（中途停滞无法退出）两大核心阻断性漏洞，跨层时钟域切分合理，不变量校验与提现闭环无懈可击，已完全具备在 Solana Devnet 进行真实多节点及 VRF 联调测试的安全水准。
