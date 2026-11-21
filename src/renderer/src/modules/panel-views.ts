import {
  CARE_ITEM_LABELS,
  FEED_ITEM_IDS,
  GIFT_ITEM_IDS,
  formatDuration,
  formatViewCount,
  truncateText,
  type AccessStatus,
  type AiStatus,
  type BilibiliShare,
  type BilibiliStatus,
  type CareActionType,
  type CareItemId,
  type PetCareProfile,
  type QqStatus
} from '../../../shared';
import { escapeHtml } from '../dom';
import type { PanelTab, RendererState } from '../state';

function renderTabButton(state: RendererState, tab: PanelTab, label: string): string {
  const active = state.panelTab === tab;
  const unreadDot = tab === 'bilibili' && state.unreadShare ? '<i class="panel-tab-dot"></i>' : '';

  return `<button type="button" role="tab" class="panel-tab${active ? ' is-active' : ''}" aria-selected="${active}" data-panel-tab="${tab}">${label}${unreadDot}</button>`;
}

function getProgressPercent(value: number, maxValue: number): string {
  return `${Math.round(Math.min(Math.max(value / maxValue, 0), 1) * 100)}%`;
}

function getAiStatusText(status: AiStatus | null): string {
  if (!status) {
    return 'AI 状态读取中。';
  }

  if (!status.encryptionAvailable && status.keySource !== 'environment') {
    return '当前系统无法安全保存 API Key。';
  }

  if (!status.hasApiKey) {
    return '还没配置模型的 API Key。';
  }

  if (!status.settings.enabled) {
    return 'AI 已关闭。';
  }

  if (status.lastError) {
    return status.lastError;
  }

  if (status.lastObservedAt && status.lastObservedTitle) {
    return `上次观察：${status.lastObservedTitle}`;
  }

  return 'AI 已就绪。';
}

function formatClock(iso: string | null): string {
  if (!iso) {
    return '未安排';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '未安排';
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderItemButton(profile: PetCareProfile, itemId: CareItemId, actionType: Extract<CareActionType, 'feed' | 'gift'>): string {
  const count = profile.inventory[itemId] ?? 0;

  return `
    <button class="care-chip" type="button" data-care-action="${actionType}" data-care-item="${itemId}" ${count <= 0 ? 'disabled' : ''}>
      <span>${CARE_ITEM_LABELS[itemId]}</span>
      <strong>${count}</strong>
    </button>
  `;
}

function renderCareSection(profile: PetCareProfile | null): string {
  if (!profile) {
    return `<div class="care-panel"><p class="panel-status-text">养成档案读取中…</p></div>`;
  }

  return `
    <div class="care-panel">
      <div class="care-header">
        <span>Lv.${profile.level}</span>
        <strong>亲密 ${profile.affection}/1000</strong>
      </div>
      <div class="care-meter" aria-label="亲密度">
        <i style="width: ${getProgressPercent(profile.affection, 1000)}"></i>
      </div>
      <div class="care-stats">
        <span>心情 ${profile.moodScore}</span>
        <span>精力 ${profile.energy}</span>
      </div>
      <div class="care-actions">
        <button type="button" data-care-action="pat">摸头</button>
        <button type="button" data-care-action="rest">休息</button>
        <button type="button" data-care-action="daily">补给</button>
      </div>
      <div class="care-section">
        <span>茶点</span>
        <div class="care-chip-row">${FEED_ITEM_IDS.map((itemId) => renderItemButton(profile, itemId, 'feed')).join('')}</div>
      </div>
      <div class="care-section">
        <span>礼物</span>
        <div class="care-chip-row">${GIFT_ITEM_IDS.map((itemId) => renderItemButton(profile, itemId, 'gift')).join('')}</div>
      </div>
    </div>
  `;
}

function renderAiSection(state: RendererState): string {
  const status = state.aiStatus;
  const settings = status?.settings;

  if (!settings) {
    return `
      <div class="ai-section">
        <div class="care-section-title">AI 互动</div>
        <p class="ai-status-text">AI 状态读取中。</p>
      </div>
    `;
  }

  const chatDisabled = state.aiBusy || !settings.enabled;
  const apiDisabled = state.aiBusy || !settings.enabled || !status?.hasApiKey;
  const keyPlaceholder =
    status?.keySource === 'environment'
      ? '正在用环境变量里的 key'
      : status?.hasApiKey
        ? '已保存，需要替换时粘贴新 key'
        : '粘贴模型服务的 API Key';
  const modelOptions = state.aiModels.map((model) => `<option value="${escapeHtml(model)}"></option>`).join('');
  const voiceOptions = state.aiVoices.map((voice) => `<option value="${escapeHtml(voice)}"></option>`).join('');
  const testResult = state.aiTestResult;

  return `
    <div class="ai-section panel-tab-content">
      <div class="panel-section-head">
        <strong>AI 互动</strong>
        <span class="panel-section-sub">${escapeHtml(getAiStatusText(status))}</span>
      </div>
      <form class="ai-chat-form">
        <input class="ai-chat-input" type="text" maxlength="160" placeholder="和胡桃说句话" ${chatDisabled ? 'disabled' : ''}>
        <button type="submit" ${chatDisabled ? 'disabled' : ''}>发送</button>
      </form>
      <div class="ai-toggle-row">
        <label><input type="checkbox" data-ai-setting="enabled" ${settings.enabled ? 'checked' : ''}>AI</label>
        <label><input type="checkbox" data-ai-setting="autoObserveEnabled" ${settings.autoObserveEnabled ? 'checked' : ''}>观察</label>
        <label><input type="checkbox" data-ai-setting="voiceEnabled" ${settings.voiceEnabled ? 'checked' : ''}>语音</label>
      </div>
      <div class="ai-key-row">
        <input class="ai-key-input" type="password" autocomplete="off" placeholder="${keyPlaceholder}" ${status?.encryptionAvailable ? '' : 'disabled'}>
        <button type="button" data-ai-action="save-key" ${status?.encryptionAvailable ? '' : 'disabled'}>保存</button>
        <button type="button" data-ai-action="clear-key" ${status?.keySource === 'stored' ? '' : 'disabled'}>清除</button>
      </div>
      <div class="ai-quick-row">
        <button class="ai-observe-button" type="button" data-ai-action="observe" ${apiDisabled ? 'disabled' : ''}>观察一下</button>
        <button class="ai-voice-test-button" type="button" data-ai-action="test-voice" ${apiDisabled ? 'disabled' : ''}>试音</button>
        <button class="ai-test-button" type="button" data-ai-action="test-connection" ${apiDisabled ? 'disabled' : ''}>测试连接</button>
        <button class="ai-config-button" type="button" data-ai-action="toggle-config" aria-expanded="${state.aiConfigOpen}">${state.aiConfigOpen ? '收起' : '配置'}</button>
      </div>
      ${
        testResult
          ? `<p class="ai-test-result${testResult.ok ? ' is-ok' : ' is-error'}">${
              testResult.ok
                ? `连接正常：${escapeHtml(testResult.model)} · ${testResult.latencyMs}ms · ${escapeHtml(testResult.reply)}`
                : escapeHtml(testResult.error ?? '连接失败')
            }</p>`
          : ''
      }
      <div class="ai-setting-grid" ${state.aiConfigOpen ? '' : 'hidden'}>
        <label>观察间隔（分钟）<input type="number" min="5" max="30" step="1" data-ai-setting="observeIntervalMinutes" value="${settings.observeIntervalMinutes}"></label>
        <label>接口地址<input type="text" data-ai-setting="apiBaseUrl" value="${escapeHtml(settings.apiBaseUrl)}"></label>
        <label>文本模型
          <span class="ai-inline-row">
            <input type="text" class="ai-model-input" list="ai-model-list" data-ai-setting="textModel" value="${escapeHtml(settings.textModel)}">
            <button type="button" class="panel-link-button" data-ai-action="list-models" ${apiDisabled ? 'disabled' : ''}>拉取模型</button>
          </span>
        </label>
        <label>语音引擎
          <select data-ai-setting="ttsEngine">
            <option value="system" ${settings.ttsEngine === 'system' ? 'selected' : ''}>系统语音（离线）</option>
            <option value="off" ${settings.ttsEngine === 'off' ? 'selected' : ''}>不发声</option>
          </select>
        </label>
        <label>音色
          <span class="ai-inline-row">
            <input type="text" class="ai-voice-input" list="ai-voice-list" data-ai-setting="ttsVoice" value="${escapeHtml(settings.ttsVoice)}">
            <button type="button" class="panel-link-button" data-ai-action="list-voices">读取音色</button>
          </span>
        </label>
        <label>人设<textarea maxlength="500" rows="4" data-ai-setting="persona">${escapeHtml(settings.persona)}</textarea></label>
      </div>
      <datalist id="ai-model-list">${modelOptions}</datalist>
      <datalist id="ai-voice-list">${voiceOptions}</datalist>
    </div>
  `;
}

function getQqStatusText(status: QqStatus | null): string {
  if (!status) {
    return 'QQ 状态读取中。';
  }

  if (!status.settings.enabled) {
    return 'QQ 板块已关闭。';
  }

  if (status.state === 'online') {
    return status.botNickname ? `已上线：${status.botNickname}` : '已经连上协议端了。';
  }

  if (status.state === 'connecting') {
    return `等协议端连 ${status.listenUrl}`;
  }

  if (status.state === 'error') {
    return status.lastError ?? '连接出错了。';
  }

  return '还没启动。';
}

function renderQqGroups(state: RendererState): string {
  const status = state.qqStatus;
  const allowed = status?.settings.allowedGroups ?? [];
  const groups = status?.groups ?? [];

  const known = groups
    .map((group) => {
      const inList = allowed.includes(group.groupId);
      return `
        <button type="button" class="qq-group-chip${inList ? ' is-on' : ''}" data-qq-action="${inList ? 'remove-group' : 'add-group'}" data-group-id="${group.groupId}">
          <span>${escapeHtml(truncateText(group.groupName || String(group.groupId), 12))}</span>
          <strong>${inList ? '已加' : '加入'}</strong>
        </button>
      `;
    })
    .join('');

  const onlySaved = allowed
    .filter((groupId) => !groups.some((group) => group.groupId === groupId))
    .map(
      (groupId) => `
        <button type="button" class="qq-group-chip is-on" data-qq-action="remove-group" data-group-id="${groupId}">
          <span>${groupId}</span>
          <strong>已加</strong>
        </button>
      `
    )
    .join('');

  const groupList = known || onlySaved ? known + onlySaved : '<p class="qq-empty">还没加到白名单，胡桃不会在群里说话。</p>';

  return `
    <div class="qq-group-block">
      <div class="panel-section-head">
        <strong>在哪些群聊天</strong>
        <button type="button" class="panel-link-button" data-qq-action="refresh-groups">刷新群列表</button>
      </div>
      <div class="qq-group-row">${groupList}</div>
      <div class="qq-group-row">
        <input class="qq-group-input" type="text" inputmode="numeric" placeholder="也可以手填群号">
        <button type="button" data-qq-action="add-group-manual">加入</button>
      </div>
    </div>
  `;
}

function renderQqReplies(status: QqStatus | null): string {
  const replies = status?.recentReplies.slice(0, 3) ?? [];
  if (replies.length === 0) {
    return '';
  }

  return `
    <div class="qq-recent">
      <span>最近说过</span>
      ${replies
        .map(
          (reply) => `
            <div class="qq-recent-item">
              <span class="qq-recent-group">${escapeHtml(truncateText(reply.groupName || String(reply.groupId), 10))}</span>
              <span class="qq-recent-text">${escapeHtml(reply.text)}</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderQqSection(state: RendererState): string {
  const status = state.qqStatus;
  const settings = status?.settings;

  if (!settings) {
    return `
      <div class="qq-section panel-tab-content">
        <div class="panel-section-head"><strong>QQ 群聊</strong></div>
        <p class="panel-section-sub">QQ 状态读取中。</p>
      </div>
    `;
  }

  const online = status?.state === 'online';

  return `
    <div class="qq-section panel-tab-content">
      <div class="panel-section-head">
        <strong>QQ 群聊</strong>
        <button type="button" class="panel-link-button" data-qq-action="toggle-config" aria-expanded="${state.qqConfigOpen}">${state.qqConfigOpen ? '收起配置' : '配置'}</button>
      </div>
      <p class="panel-section-sub">${escapeHtml(getQqStatusText(status))}</p>
      <div class="qq-toggle-row">
        <label><input type="checkbox" data-qq-setting="enabled" ${settings.enabled ? 'checked' : ''}>开启</label>
        <label><input type="checkbox" data-qq-setting="replyToAt" ${settings.replyToAt ? 'checked' : ''}>@ 必回</label>
        <label><input type="checkbox" data-qq-setting="quietHoursEnabled" ${settings.quietHoursEnabled ? 'checked' : ''}>免打扰</label>
      </div>
      <div class="qq-quick-row">
        <button type="button" data-qq-action="connect" ${!settings.enabled || online ? 'disabled' : ''}>连接</button>
        <button type="button" data-qq-action="disconnect" ${online ? '' : 'disabled'}>断开</button>
        <span class="qq-listen-url">${escapeHtml(status?.listenUrl ?? '')}</span>
      </div>
      <div class="qq-setting-grid" ${state.qqConfigOpen ? '' : 'hidden'}>
        <label>监听端口<input type="number" min="1024" max="65535" step="1" data-qq-setting="wsPort" value="${settings.wsPort}"></label>
        <label>小号 QQ<input type="text" inputmode="numeric" maxlength="12" data-qq-setting="selfQq" value="${escapeHtml(settings.selfQq)}"></label>
        <label>访问 token<input type="password" autocomplete="off" data-qq-setting="accessToken" value="${escapeHtml(settings.accessToken)}"></label>
        <label>叫名字时回复 ${settings.nameReplyChance}%<input type="range" min="0" max="100" step="5" data-qq-setting="nameReplyChance" value="${settings.nameReplyChance}"></label>
        <label>主动插话 ${settings.interjectChance}%<input type="range" min="0" max="40" step="1" data-qq-setting="interjectChance" value="${settings.interjectChance}"></label>
        <label>同群冷却（分钟）<input type="number" min="1" max="60" step="1" data-qq-setting="interjectCooldownMinutes" value="${settings.interjectCooldownMinutes}"></label>
        <label>10 分钟最多<input type="number" min="1" max="20" step="1" data-qq-setting="maxRepliesPer10Minutes" value="${settings.maxRepliesPer10Minutes}"></label>
        <label>安静时段
          <span class="qq-quiet-row">
            <input type="time" data-qq-setting="quietHoursStart" value="${settings.quietHoursStart}">
            <span>至</span>
            <input type="time" data-qq-setting="quietHoursEnd" value="${settings.quietHoursEnd}">
          </span>
        </label>
        <label>群聊人设<textarea maxlength="500" rows="3" data-qq-setting="persona" placeholder="留空就沿用 AI 面板里的胡桃人设">${escapeHtml(
          settings.persona
        )}</textarea></label>
        <label>管理员 QQ（每行一个，能指挥她动电脑）
          <textarea rows="2" data-qq-setting="adminQqs" placeholder="982019603">${escapeHtml(
            settings.adminQqs.join('\n')
          )}</textarea>
        </label>
      </div>
      ${renderQqGroups(state)}
      ${renderQqReplies(status)}
      <p class="panel-hint">今天已说 ${status?.todayReplies ?? 0} 句。协议端（SnowLuma）要先连到上面的地址，胡桃才收得到消息。</p>
    </div>
  `;
}

function getBilibiliStatusText(status: BilibiliStatus | null): string {
  if (!status) {
    return 'B 站状态读取中。';
  }

  if (status.lastError) {
    return status.lastError;
  }

  if (status.browsing) {
    return '正在 B 站里逛，稍等一会儿…';
  }

  if (!status.settings.enabled) {
    return `自动逛站已关闭，共分享过 ${status.totalShared} 条。`;
  }

  return `今天已分享 ${status.todayShared} 条，下次逛站 ${formatClock(status.nextRunAt)}。`;
}

function renderRecentShares(status: BilibiliStatus | null): string {
  const shares = status?.recentShares.slice(0, 3) ?? [];
  if (shares.length === 0) {
    return '';
  }

  return `
    <div class="bilibili-recent">
      <span>最近逛到</span>
      ${shares
        .map(
          (share) => `
            <button type="button" class="bilibili-recent-item" data-bilibili-action="open-share" data-bvid="${share.id}">
              ${escapeHtml(truncateText(share.video.title, 22))}
            </button>
          `
        )
        .join('')}
    </div>
  `;
}

function renderBilibiliSection(state: RendererState): string {
  const status = state.bilibiliStatus;
  const settings = status?.settings;

  if (!settings) {
    return `
      <div class="bilibili-section">
        <div class="care-section-title">B 站漫游</div>
        <p class="bilibili-status-text">B 站状态读取中。</p>
      </div>
    `;
  }

  const interestText = settings.interests.join('、');

  return `
    <div class="bilibili-section panel-tab-content">
      <div class="panel-section-head">
        <strong>B 站漫游</strong>
        <button type="button" class="panel-link-button" data-bilibili-action="toggle-config" aria-expanded="${state.bilibiliConfigOpen}">${state.bilibiliConfigOpen ? '收起配置' : '偏好设置'}</button>
      </div>
      <p class="panel-section-sub">${escapeHtml(getBilibiliStatusText(status))}</p>
      <div class="bilibili-toggle-row">
        <label><input type="checkbox" data-bilibili-setting="enabled" ${settings.enabled ? 'checked' : ''}>自动逛</label>
        <label><input type="checkbox" data-bilibili-setting="quietHoursEnabled" ${settings.quietHoursEnabled ? 'checked' : ''}>免打扰</label>
        <label><input type="checkbox" data-bilibili-setting="aiCommentary" ${settings.aiCommentary ? 'checked' : ''}>AI 文案</label>
      </div>
      <div class="bilibili-quick-row">
        <button type="button" data-bilibili-action="browse" ${status?.browsing ? 'disabled' : ''}>${status?.browsing ? '逛站中…' : '去逛逛'}</button>
        <button type="button" data-bilibili-action="open-home">打开B站</button>
      </div>
      <div class="bilibili-setting-grid" ${state.bilibiliConfigOpen ? '' : 'hidden'}>
        <label>间隔（分钟）<input type="number" min="15" max="360" step="5" data-bilibili-setting="shareIntervalMinutes" value="${settings.shareIntervalMinutes}"></label>
        <label>每日上限<input type="number" min="1" max="24" step="1" data-bilibili-setting="dailyShareLimit" value="${settings.dailyShareLimit}"></label>
        <label>安静时段
          <span class="bilibili-quiet-row">
            <input type="time" data-bilibili-setting="quietHoursStart" value="${settings.quietHoursStart}">
            <span>至</span>
            <input type="time" data-bilibili-setting="quietHoursEnd" value="${settings.quietHoursEnd}">
          </span>
        </label>
        <label>兴趣关键词<input type="text" maxlength="180" data-bilibili-setting="interests" value="${escapeHtml(interestText)}"></label>
        <label class="bilibili-check"><input type="checkbox" data-bilibili-setting="allowLongVideos" ${settings.allowLongVideos ? 'checked' : ''}>也接受 20 分钟以上的长视频</label>
        <button type="button" class="bilibili-clear-button" data-bilibili-action="clear-history">清空逛站记录</button>
      </div>
      ${renderRecentShares(status)}
    </div>
  `;
}

function getAccessStatusText(status: AccessStatus | null): string {
  if (!status) {
    return '权限状态读取中。';
  }

  const { policy } = status;
  if (!policy.enabled) {
    return '本机访问已关闭，胡桃只会聊天，碰不到你的电脑。';
  }

  const abilities = [
    policy.allowRead ? `读文件（${policy.readRoots.length} 个目录）` : '',
    policy.allowScreenshot ? '看屏幕' : '',
    policy.allowLaunch ? `开程序（${policy.launchAllowlist.length} 个）` : '',
    policy.allowShell ? '跑命令（需你点确认）' : ''
  ].filter(Boolean);

  if (abilities.length === 0) {
    return '总开关开着，但四项能力都还关着。';
  }

  return `已允许：${abilities.join('、')}。本小时已用 ${status.opsLastHour}/${policy.maxOpsPerHour} 次。`;
}

function renderAccessPending(status: AccessStatus | null): string {
  const pending = status?.pending ?? [];
  if (pending.length === 0) {
    return '<p class="panel-hint">没有等你确认的操作。</p>';
  }

  return `
    <div class="access-pending">
      <span>等你确认</span>
      ${pending
        .map(
          (entry) => `
            <div class="access-pending-item">
              <code>${escapeHtml(truncateText(entry.target, 60))}</code>
              <div class="access-pending-actions">
                <button type="button" class="panel-link-button" data-access-action="approve" data-pending-id="${escapeHtml(entry.id)}">允许</button>
                <button type="button" class="panel-link-button" data-access-action="deny" data-pending-id="${escapeHtml(entry.id)}">拒绝</button>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderAccessAudit(status: AccessStatus | null): string {
  const audit = (status?.audit ?? []).slice(-3).reverse();
  if (audit.length === 0) {
    return '';
  }

  return `
    <div class="access-audit">
      <span>最近的本地操作</span>
      ${audit
        .map(
          (entry) => `
            <div class="access-audit-item">
              <span class="access-audit-actor">${escapeHtml(entry.actor)}</span>
              <span class="access-audit-action">${entry.ok ? '✅' : '⛔'} ${escapeHtml(entry.action)}</span>
              <span class="access-audit-target">${escapeHtml(truncateText(entry.target, 28))}</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderAccessSection(state: RendererState): string {
  const status = state.accessStatus;
  const policy = status?.policy;

  if (!policy) {
    return `
      <div class="access-section panel-tab-content">
        <div class="panel-section-head"><strong>权限</strong></div>
        <p class="panel-section-sub">权限状态读取中。</p>
      </div>
    `;
  }

  const launchText = policy.launchAllowlist
    .map((entry) => `${entry.label}|${entry.target}`)
    .join('\n');

  return `
    <div class="access-section panel-tab-content">
      <div class="panel-section-head">
        <strong>本机权限</strong>
        <button type="button" class="panel-link-button" data-access-action="toggle-config" aria-expanded="${state.accessConfigOpen}">${state.accessConfigOpen ? '收起配置' : '配置'}</button>
      </div>
      <p class="panel-section-sub">${escapeHtml(getAccessStatusText(status))}</p>
      <div class="access-toggle-row">
        <label><input type="checkbox" data-access-setting="enabled" ${policy.enabled ? 'checked' : ''}>总开关</label>
        <label><input type="checkbox" data-access-setting="allowRead" ${policy.allowRead ? 'checked' : ''}>读文件</label>
        <label><input type="checkbox" data-access-setting="allowScreenshot" ${policy.allowScreenshot ? 'checked' : ''}>看屏幕</label>
        <label><input type="checkbox" data-access-setting="allowLaunch" ${policy.allowLaunch ? 'checked' : ''}>开程序</label>
        <label><input type="checkbox" data-access-setting="allowShell" ${policy.allowShell ? 'checked' : ''}>跑命令</label>
      </div>
      <div class="access-quick-row">
        <button type="button" data-access-action="open-workbench">打开工作台</button>
        <button type="button" data-access-action="screenshot" ${policy.enabled && policy.allowScreenshot ? '' : 'disabled'}>让她看一眼屏幕</button>
      </div>
      <div class="access-setting-grid" ${state.accessConfigOpen ? '' : 'hidden'}>
        <label>只读目录（每行一个绝对路径）<textarea rows="3" data-access-setting="readRoots" placeholder="E:\\Project\\HuTao">${escapeHtml(policy.readRoots.join('\n'))}</textarea></label>
        <label>允许打开（每行「名字|路径或网址」）<textarea rows="3" data-access-setting="launchAllowlist" placeholder="记事本|C:\\Windows\\notepad.exe">${escapeHtml(launchText)}</textarea></label>
        <label>每小时操作上限<input type="number" min="1" max="200" step="1" data-access-setting="maxOpsPerHour" value="${policy.maxOpsPerHour}"></label>
        <label>命令超时（毫秒）<input type="number" min="3000" max="60000" step="1000" data-access-setting="shellTimeoutMs" value="${policy.shellTimeoutMs}"></label>
      </div>
      ${renderAccessPending(status)}
      ${renderAccessAudit(status)}
      <p class="panel-hint">跑命令永远要在这里点「允许」才会执行；关掉的选项，模型连工具都看不到。</p>
    </div>
  `;
}

export function renderCarePanel(state: RendererState): string {
  const content =
    state.panelTab === 'care'
      ? `${renderCareSection(state.careProfile)}<p class="panel-hint">小提示：10 秒内连摸 3 次头，会有惊喜。</p>`
      : state.panelTab === 'bilibili'
        ? renderBilibiliSection(state)
        : state.panelTab === 'qq'
          ? renderQqSection(state)
          : state.panelTab === 'access'
            ? renderAccessSection(state)
            : renderAiSection(state);

  return `
    <div class="panel-tabs" role="tablist" aria-label="胡桃面板">
      ${renderTabButton(state, 'care', '互动')}
      ${renderTabButton(state, 'bilibili', 'B站')}
      ${renderTabButton(state, 'ai', 'AI')}
      ${renderTabButton(state, 'qq', 'QQ')}
      ${renderTabButton(state, 'access', '权限')}
    </div>
    <div class="panel-body" role="tabpanel">
      ${content}
    </div>
  `;
}

export function renderShareCard(
  share: BilibiliShare,
  coverDataUrl: string | null,
  coverFailed: boolean,
  busy: boolean
): string {
  const { video } = share;
  const cover = coverDataUrl
    ? `<img class="share-thumb" src="${escapeHtml(coverDataUrl)}" alt="${escapeHtml(video.title)} 封面">`
    : `<div class="share-thumb is-placeholder">${coverFailed ? '封面暂缺' : '封面加载中…'}</div>`;

  return `
    <div class="share-card" data-bvid="${share.id}">
      <div class="share-card-head">
        <span class="share-tag">B 站漫游</span>
        <button class="share-close" type="button" data-bilibili-action="dismiss" aria-label="关闭分享卡">×</button>
      </div>
      <div class="share-body">
        ${cover}
        <div class="share-info">
          <div class="share-title">${escapeHtml(video.title)}</div>
          <div class="share-meta">
            <span class="share-up">${escapeHtml(video.upName)}</span>
            <span>${formatDuration(video.durationSeconds)} · ${formatViewCount(video.viewCount)}播放</span>
          </div>
        </div>
      </div>
      <div class="share-quip" title="${escapeHtml(share.message)}">${escapeHtml(share.message)}</div>
      <div class="share-reason">${escapeHtml(share.reason)}</div>
      <div class="share-actions">
        <button type="button" class="share-primary" data-bilibili-action="open">去 B 站看看</button>
        <button type="button" data-bilibili-action="copy">复制链接</button>
        <button type="button" data-bilibili-action="reroll" ${busy ? 'disabled' : ''}>换一个</button>
        <button type="button" data-bilibili-action="dislike">不感兴趣</button>
      </div>
      <div class="share-footer">
        <button type="button" class="share-like" data-bilibili-action="like">喜欢这类</button>
        <span>${share.source === 'auto' ? '自己逛到的' : '应你要求逛的'}</span>
      </div>
    </div>
  `;
}
