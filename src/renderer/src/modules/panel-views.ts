import {
  CARE_ITEM_LABELS,
  FEED_ITEM_IDS,
  GIFT_ITEM_IDS,
  formatDuration,
  formatViewCount,
  truncateText,
  type AiStatus,
  type BilibiliShare,
  type BilibiliStatus,
  type CareActionType,
  type CareItemId,
  type PetCareProfile
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

  if (!status.encryptionAvailable) {
    return '当前系统无法安全保存 API Key。';
  }

  if (!status.hasApiKey) {
    return '请保存新的 MiniMax API Key。';
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
  const keyPlaceholder = status?.hasApiKey ? '已保存，需要替换时粘贴新 key' : '粘贴新的 MiniMax API Key';

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
        <button type="button" data-ai-action="clear-key" ${status?.hasApiKey ? '' : 'disabled'}>清除</button>
      </div>
      <div class="ai-quick-row">
        <button class="ai-observe-button" type="button" data-ai-action="observe" ${apiDisabled ? 'disabled' : ''}>观察一下</button>
        <button class="ai-voice-test-button" type="button" data-ai-action="test-voice" ${apiDisabled ? 'disabled' : ''}>试音</button>
        <button class="ai-config-button" type="button" data-ai-action="toggle-config" aria-expanded="${state.aiConfigOpen}">${state.aiConfigOpen ? '收起' : '配置'}</button>
      </div>
      <div class="ai-setting-grid" ${state.aiConfigOpen ? '' : 'hidden'}>
        <label>间隔<input type="number" min="5" max="30" step="1" data-ai-setting="observeIntervalMinutes" value="${settings.observeIntervalMinutes}"></label>
        <label>接口<input type="text" data-ai-setting="apiBaseUrl" value="${escapeHtml(settings.apiBaseUrl)}"></label>
        <label>文本<input type="text" data-ai-setting="textModel" value="${escapeHtml(settings.textModel)}"></label>
        <label>语音<input type="text" data-ai-setting="voiceId" value="${escapeHtml(settings.voiceId)}"></label>
        <label>人设<textarea maxlength="500" rows="4" data-ai-setting="persona">${escapeHtml(settings.persona)}</textarea></label>
      </div>
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

export function renderCarePanel(state: RendererState): string {
  const content =
    state.panelTab === 'care'
      ? `${renderCareSection(state.careProfile)}<p class="panel-hint">小提示：10 秒内连摸 3 次头，会有惊喜。</p>`
      : state.panelTab === 'bilibili'
        ? renderBilibiliSection(state)
        : renderAiSection(state);

  return `
    <div class="panel-tabs" role="tablist" aria-label="胡桃面板">
      ${renderTabButton(state, 'care', '互动')}
      ${renderTabButton(state, 'bilibili', 'B站')}
      ${renderTabButton(state, 'ai', 'AI')}
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
