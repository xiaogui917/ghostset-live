# GhostSet Live 智能合约静态代码安全审计报告

**审计日期：** 2026-11-23  
**目标代码：** `programs/ghostset-live/src/lib.rs`（Commit / Tag: Solana Blitz v10 Hackathon）  
**技术栈：** Solana / Anchor 1.0.2 / ephemeral-rollups-sdk 0.18.0 / solana-program 3.0.0  
**审计范围：** 静态代码审查（资金安全、权限校验、VRF 回调认证、Commit/Reveal 密码学绑定、二次方算术与版税、状态机流转、委托生命周期、SDK 宏及 UncheckedAccount 校验）

---

## 一、漏洞与缺陷清单（按严重程度分级）

### 【High】H-01：Pre-Delegation 资金死锁（`ShowState::Funded` 阶段无退款/取消路径）

- **文件行号：** [lib.rs#L161](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L161), [lib.rs#L207-L209](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L207-L209), [lib.rs#L542](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L542), [lib.rs#L584](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L584), [lib.rs#L627](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L627)
- **问题描述：**
  在观众通过 `join_show` 存入 SOL 后，Show 状态转入 `ShowState::Funded`，SOL 进入 L1 `Vault`。后续委托指令 `delegate_show` 严格要求：
  1. 必须由 `show.authority` 签名；
  2. 必须全部 4 个座位均已加入（`show.seats.iter().all(|seat| seat.joined)`）。
  
  然而，若出现以下任一现实场景：
  - 仅有 1 ~ 3 个座位充值，第 4 个座位无观众加入；
  - 4 个座位全部充值，但 `show.authority` 离线、私钥丢失或拒绝执行 `delegate_show`；
  
  此时合约中：
  - `delegate_show` 无法执行（受限于座位未满或缺少 authority 签名）；
  - `abort_show` 拒绝执行（第 542 行要求状态为 `Delegated | VrfReady | Running`，拒绝 `Funded`）；
  - `finalize_show` 拒绝执行（第 584 行同上）；
  - `withdraw` 拒绝执行（第 627 行要求 `state == ShowState::OnL1 && show.finalize_scheduled`）。
- **利用/故障场景：**
  任何提前充值加入座位的真实用户资金将被永久锁死在 L1 `Vault` 中，合约内无任何逃生通道（Escape Hatch），形成不可逆的资产锁死。
- **修复建议：**
  1. 扩展 `abort_show`（或新增专门的 `cancel_unstarted_show` 指令），允许在 `show.state == ShowState::Funded` 时由 `authority` 触发取消；
  2. 增加超时保护机制（例如 Show 初始化超过 24 小时仍未委托），允许任意已加入座位的观众免许可（Permissionless）触发取消；
  3. 取消后直接将状态标记为 `ShowState::OnL1` 并设置 `finalize_scheduled = true; cancelled = true;`，使已存入资金的座位可以直接通过 L1 `withdraw` 原路提现退款。

---

### 【Medium】M-01：ER 演出中途 Authority 掉线缺乏免许可超时终止（Mid-Show Stall）

- **文件行号：** [lib.rs#L544-L547](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L544-L547)
- **问题描述：**
  在 `abort_show` 指令中，免许可调用的条件仅为：
  ```rust
  let deadline = show.vrf_requested_at.checked_add(VRF_TIMEOUT_SECONDS).ok_or(GhostSetError::MathOverflow)?;
  let timed_out = show.vrf_status == VrfStatus::Requested && Clock::get()?.unix_timestamp > deadline;
  require!(ctx.accounts.payer.key() == show.authority || timed_out, GhostSetError::Unauthorized);
  ```
  `timed_out` 仅在 `vrf_status == VrfStatus::Requested`（即等待 VRF 回调超时）时成立。
  一旦 VRF 回调成功（`vrf_status == VrfStatus::Ready`），若在后续第 1 ~ N 回合演出中，`show.authority` 突然下线或异常终止，观众无法免许可调用 `abort_show`。
  虽然理论上观众可以自行免许可调用 `open_round` 和 `close_round` 空跑剩余所有回合直到 `closed_rounds == total_rounds` 再调用 `finalize_show`，但这需要等待大量 slot 时间并为每一轮垫付交易手续费。
- **利用/故障场景：**
  线下/线上演出主办方服务端崩溃，VRF 已就绪但未能完整跑完全部回合，导致演出卡死在 ER 中，观众无法即刻取回剩余 Credit。
- **修复建议：**
  记录最后活动 slot 或时间戳（`last_round_slot`），在 `Running` 或 `VrfReady` 状态下，若超过指定时间（如 10 分钟或 1500 slots）无新回合推进，允许任意座位签名者免许可调用 `abort_show` 触发全额退款并最终 finalize 回 L1。

---

### 【Low】L-01：Show 与 Vault 账户 Rent 豁免资金无法注销回收

- **文件行号：** [lib.rs#L667-L670](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L667-L670)
- **问题描述：**
  在所有座位与受益人完成提现后，`show.liability_total == 0`，状态被置为 `ShowState::Closed`。
  但合约未提供 `close_account` 逻辑来销毁 `Show` 和 `Vault` PDA 并将创建时支付的 rent-exempt lamports（约 0.003 SOL）退还给 `authority`。
- **利用/故障场景：**
  无法回收租金垫资，每场 Show 的 PDA 永久残留链上。在测试网尚可忽略，若主网部署将产生不可回收的沉没成本。
- **修复建议：**
  增加 `close_show` 指令，校验 `show.state == ShowState::Closed && vault.total_liability == 0`，清空两个 PDA 的 data 并将 lamports 全部转回 `authority`。

---

### 【Low】L-02：平局与全弃权时赢家曲目确定性偏向 Track 0

- **文件行号：** [lib.rs#L490-L495](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/programs/ghostset-live/src/lib.rs#L490-L495)
- **问题描述：**
  在 `close_round` 中确定赢家曲目的逻辑为：
  ```rust
  let mut winner_track = 0usize;
  for track in 1..TRACK_COUNT {
      if scores[track] > scores[winner_track] {
          winner_track = track;
      }
  }
  ```
  虽然文档说明了“平局按最小 track ID”，但在极端情况下（例如全员未揭示，所有曲目得分均为 0；或者各曲目得分相同），Track 0 享有天然的绝对优势。
- **利用/故障场景：**
  如果博弈双方发现局势对自己不利并选择均不揭示，曲目将无悬念由 Track 0 胜出，可能引发跟投 Track 0 的搭便车行为。
- **修复建议：**
  若希望平局更具不可预测性，可在得分平局时引入本轮的 `mystery_track` 或由 `round_seed` 决定平局归属；若 Track 0 优先级是明确的游戏规则，则应在规则文档中向观众显著警示。

---

### 【Info】I-01：MagicSVM 0.3.0 本地单测对 SDK 0.18.0 VRF 回调的模拟局限

- **文件行号：** [tests-magicsvm-rs/src/lib.rs#L68-L73](file:///home/hatch/workspace/agent-earn/magicblock-blitz/ghostset-live/tests-magicsvm-rs/src/lib.rs#L68-L73)
- **问题描述：**
  测试工程中 `vrf_callback_is_delivered_by_warp_to_slot` 标记了 `#[ignore]`。原因是 `ephemeral-rollups-sdk 0.18.0` 的 `#[vrf]` 宏将请求指令 discriminator 重写为 `10` / `11`（Scoped Per-Program Identity 请求），而 `MagicSVM 0.3.0` 内置的 Mock VRF 引擎仅拦截 Legacy Discriminator（`3`），导致在单元测试中调用 `warp_to_slot` 时不会自动派发 Mock 回调。
- **修复建议：**
  保持测试注释说明，VRF 端到端回调及多轮微回合调度必须在 Devnet（搭配真实验证器与预言机队列 `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc`）进行完整的集成验证。

---

## 二、关键安全要点逐项审计结果

| 审计模块 | 检查项 | 审查结论 | 关键分析说明 |
| :--- | :--- | :---: | :--- |
| **1. 资金安全** | Vault 资产托管与隔离 | **通过** | `Vault` 始终驻留 L1 不参与委托，隔离风险；Show 在 ER 仅做记账；两端 seed 均受 `show_id` 强约束。 |
| | 负债平衡不变量校验 | **通过** | `assert_show_invariant` 严格约束 `credit_total + escrow_total + round_pool + royalty_pending_total == liability_total`；每条资金指令末尾强断言。 |
| | Vault 租金豁免下限保护 | **通过** | 记账与实际转账双重保护，`assert_vault_covers` 确保可用余额覆盖负债，`withdraw` 严格检查 `next_vault_lamports >= vault.rent_minimum`。 |
| | 提现防重入与防重复提现 | **通过** | 严格遵循 Checks-Effects-Interactions：提取 credit/pending 前先清零记账，再修改账户 lamports；校验 `amount > 0` 防空提。 |
| | Initialize 手动 CPI 创建 | **通过** | PDA 种子包含 canonical bump，调用 `system_program::create_account` 分配严格固定大小（`Show::SPACE` 与 `Vault::SPACE`），手动序列化写入 8-byte discriminator，防止二次初始化攻击。 |
| **2. 权限与授权** | 指令 Signer 覆盖 | **通过** | 每条核心指令均校验相应角色：`authority`（delegate/request_vrf）、`payer/authority`（join/commit/reveal）、`recipient`（withdraw）。 |
| | 座位所有权校验 | **通过** | `commit_pledge` 与 `reveal_pledge` 显式校验 `show.seats[index].authority == ctx.accounts.payer.key()`，禁止代投或越权揭示。 |
| | 受益人提现校验 | **通过** | 校验 `show.beneficiaries[item_index] == ctx.accounts.recipient.key()`，非本人签名无法提取待结算版税。 |
| | Crank 指令免许可性 | **通过** | `open_round`、`close_round`、`finalize_show` 允许任意 signer 作为 Crank 调用，无特权后门，前置状态与时钟严格防篡改。 |
| **3. VRF 回调** | 回调签名认证 | **通过** | `#[vrf_callback]` 宏自动注入 `vrf_program_identity: Signer<'info>`，并硬编码绑定至当前 Program 作用域派生的 `scoped_vrf_identity_const(&crate::ID)`，外部恶意账户绝对无法伪造回调。 |
| | Nonce 强绑定与防重放 | **通过** | 请求时递增 `vrf_request_nonce` 并通过 `callback_args` 回传；回调校验 `request_nonce == show.vrf_request_nonce`；状态转为 `VrfReady` 后，重复回调立即报错。 |
| | 超时防过期攻击 | **通过** | 限制 180 秒超时窗口（`Clock::unix_timestamp <= deadline`），过期回调被严格拒绝；超时后开放任意调用方执行 `abort_show`。 |
| **4. Commit/Reveal** | 域分隔与密码学绑定 | **通过** | Hash 使用 `GHOSTSET:PLEDGE:V1` 独立域分隔，绑定 `show_pubkey`、`round`、`seat_index`、`seat_authority`、`track`、`amount`、`secret`，无法跨轮、跨场、跨座位重放。 |
| | 防提前揭示与跟单 | **通过** | `reveal_pledge` 要求 `slot > show.commit_deadline_slot`；`commit_pledge` 要求 `slot <= show.commit_deadline_slot`，Commit 与 Reveal 阶段时间严格互斥。 |
| | 金额与曲目合法性 | **通过** | Reveal 校验 `0 < amount <= pledge_cap` 且 `track < 3`；退款金额 `cap - amount` 校验无误并立即返还 Credit。 |
| | 未揭示惩罚机制 | **通过** | Commit 时全额冻结 `pledge_cap`；未揭示者在 `close_round` 时整个 escrow 被没收注入版税池，不计得分，经济博弈设计健全。 |
| **5. 计分与版税** | 二次方整数平方根 | **通过** | `integer_sqrt` 采用二分查找法，全部使用 checked math 与 `u128`，边界值（`0`、`1`、`u64::MAX`）测试全覆盖，无溢出风险。 |
| | 得分累计溢出防范 | **通过** | 单座位最大得分为 `u32::MAX`，4 座位累加远低于 `u64::MAX`，`checked_add` 保证无越界。 |
| | 版税比例与尾差分配 | **通过** | 初始化严格校验 bps 总和为 10000；计算版税按 `(pool * bps) / 10000` 运算，前两项按 bps 计算，最后一项取 `pool.checked_sub(distributed)`，0 lamport 遗失，全额归属视觉创作者。 |
| **6. 状态机流转** | 状态跃迁完备性 | **通过** | `Uninitialized -> Funded -> Delegated -> VrfReady -> Running -> Finalizing -> OnL1 -> Closed` 状态链条清晰，各指令要求的前置状态严格且排他。 |
| | 微回合阶段切换 | **通过** | `Commit -> Reveal -> Closed` 由时钟 slot 与 crank 指令联动推进，`round_open` 标志位防止单回合重开或并发冲突。 |
| **7. 委托与跨层** | Show 所有权校验 | **通过** | `delegate_show` 在委派前显式断言 `*ctx.accounts.show.owner == ID`，确保未委托状态。 |
| | Undelegate 流程 | **通过** | `finalize_show` 将状态变更为 `OnL1`、置位 `finalize_scheduled` 后，通过 `MagicIntentBundleBuilder` 发起 `commit_and_undelegate` CPI，返回 L1 后状态立即可供提现。 |
| **8. SDK 0.18.0** | 宏属性与账户注入 | **通过** | `#[delegate]`、`#[vrf]`、`#[vrf_callback]`、`#[commit]` 均按 SDK 规范置于 `#[derive(Accounts)]` 之上；宏注入字段类型相符。 |
| | UncheckedAccount 注释 | **通过** | 涉及的 `UncheckedAccount`（`show`、`vault`、`validator`、`oracle_queue`）均附带精确且名副其实的 `/// CHECK:` 安全说明，且均有程序级显式校验保障。 |

---

## 三、总体审计结论

### 结论：**【允许有条件部署至 Devnet】（CONDITIONAL PASS FOR DEVNET）**

GhostSet Live 锚程序的架构设计与密码学实现非常严密：
1. **密码学与资金不变量极其扎实：** Commit/Reveal 域分隔完整，时间窗口互斥彻底；二次方整数平方根算法经过严密数学与单元验证；负债不变量在每一条指令执行前后形成双重护栏，彻底杜绝了超额提现或虚增 Credit 的可能。
2. **MagicBlock ER 特性结合正确：** 正确锁定了兼容的 `ephemeral-rollups-sdk 0.18.0` 与 `anchor-lang 1.0.2`；VRF 请求采用 Scoped Identity PDA 编译期常量机制，回调认证完备无缺陷。

### 上线 Devnet 前建议：
- **针对黑客松演示与联调（高优先级）：**
  在前端与演示脚本中，必须确保 4 个座位全部充值并立即完成 `delegate_show`。若要在 Devnet 提供给公众体验，强烈建议采纳 **H-01** 的修复方案，为 `ShowState::Funded` 阶段补充退出/退款通道，避免因座位未坐满或组织者掉线导致体验者代币永久滞留。
- **针对 VRF 测试：**
  受限于 MagicSVM 0.3.0 对新版 Scoped VRF 的 Mock 支持，所有随机数驱动的微回合切歌逻辑应集中在 Devnet-us（或 Devnet 官方预言机队列 `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc`）进行完整的真实链上联调。
