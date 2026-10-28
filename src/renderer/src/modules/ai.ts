import type { AiReply, AiSettings, AiSettingsPatch } from '../../../shared';
import { requireApi } from '../api';
import { AI_OBSERVE_INITIAL_DELAY_MS, AI_OBSERVE_MIN_IDLE_MS } from '../constants';
import { state } from '../state';
import { showBubble, showBurst } from './bubble';
import { setTemporaryMood } from './mood';
import { refreshPanel } from './panel';
import { noteInteraction, stopRoam } from './roam';import { playReplyVoice } from './voice';

export function showAiReply(reply: AiReply, silentFailure = false): void {
  if (!reply.ok && silentFailure) {
    return;
  }

  stopRoam();
  noteInteraction();
  setTemporaryMood(reply.ok ? (reply.source === 'desktop-observation' ? 'curious' : 'happy') : 'curious', 1900);
  showBubble(reply.text, reply.ok ? 5200 : 3200);
  showBurst(reply.ok ? 'happy' : 'curious');
  playReplyVoice(reply);
}

export async function refreshAiStatus(): Promise<void> {
  state.aiStatus = await requireApi().getAiStatus();
  refreshPanel();
}

export function scheduleAiObservation(delayMs?: number): void {
  window.clearTimeout(state.timers.aiObserve);
  const status = state.aiStatus;

  if (!status?.settings.enabled || !status.settings.autoObserveEnabled || !status.hasApiKey) {
    return;
  }

  const intervalMs = status.settings.observeIntervalMinutes * 60_000;
  state.timers.aiObserve = window.setTimeout(() => {
    void runAutomaticObservation();
  }, delayMs ?? intervalMs);
}

async function runAutomaticObservation(): Promise<void> {
  const status = state.aiStatus;

  if (!status?.settings.enabled || !status.settings.autoObserveEnabled || !status.hasApiKey) {
    return;
  }

  if (
    state.dragging ||
    state.panelMode !== 'none' ||
    state.mood !== 'idle' ||
    Date.now() - state.lastInteractionAt < AI_OBSERVE_MIN_IDLE_MS
  ) {
    scheduleAiObservation();
    return;
  }

  const reply = await requireApi().observeDesktopNow();
  showAiReply(reply, true);
  await refreshAiStatus();
  scheduleAiObservation();
}

export async function updateAiSettingFromInput(input: HTMLInputElement): Promise<void> {
  const setting = input.dataset.aiSetting as keyof AiSettings | undefined;
  if (!setting) {
    return;
  }

  const patch: AiSettingsPatch = {};
  if (setting === 'enabled' || setting === 'autoObserveEnabled' || setting === 'voiceEnabled') {
    patch[setting] = input.checked;
  } else if (setting === 'observeIntervalMinutes') {
    patch.observeIntervalMinutes = Number(input.value);
  } else if (setting === 'apiBaseUrl' || setting === 'textModel' || setting === 'ttsModel' || setting === 'voiceId') {
    patch[setting] = input.value;
  }

  state.aiStatus = await requireApi().updateAiSettings(patch);
  refreshPanel();
  scheduleAiObservation(AI_OBSERVE_INITIAL_DELAY_MS);
}

export async function updateAiSettingFromTextArea(textarea: HTMLTextAreaElement): Promise<void> {
  if (textarea.dataset.aiSetting !== 'persona') {
    return;
  }

  state.aiStatus = await requireApi().updateAiSettings({
    persona: textarea.value
  });
  refreshPanel();
}

export async function handleAiAction(action: string): Promise<void> {
  const api = requireApi();
  if (state.aiBusy) {
    return;
  }

  if (action === 'toggle-config') {
    state.aiConfigOpen = !state.aiConfigOpen;
    refreshPanel();
    return;
  }

  const pendingKey =
    action === 'save-key' ? (document.querySelector<HTMLInputElement>('.ai-key-input')?.value.trim() ?? '') : '';

  state.aiBusy = true;
  refreshPanel();

  try {
    if (action === 'save-key') {
      if (!pendingKey) {
        showBubble('先粘贴新的 MiniMax API Key。', 2600);
        return;
      }

      state.aiStatus = await api.saveMiniMaxApiKey(pendingKey);
      state.aiConfigOpen = false;
      showBubble(state.aiStatus.hasApiKey ? 'MiniMax API Key 已安全保存。' : '保存失败，请稍后重试。', 3000);
      scheduleAiObservation(AI_OBSERVE_INITIAL_DELAY_MS);
      return;
    }

    if (action === 'clear-key') {
      state.aiStatus = await api.clearMiniMaxApiKey();
      showBubble('MiniMax API Key 已清除。', 2600);
      scheduleAiObservation();
      return;
    }

    if (action === 'observe') {
      const reply = await api.observeDesktopNow();
      showAiReply(reply);
      await refreshAiStatus();
      scheduleAiObservation();
      return;
    }

    if (action === 'test-voice') {
      const reply = await api.testAiVoice();
      showAiReply(reply);
      await refreshAiStatus();
    }
  } finally {
    state.aiBusy = false;
    refreshPanel();
  }
}

export async function handleAiChatSubmit(form: HTMLFormElement): Promise<void> {
  const api = requireApi();
  if (state.aiBusy) {
    return;
  }

  const input = form.querySelector<HTMLInputElement>('.ai-chat-input');
  const text = input?.value.trim() ?? '';
  if (!text) {
    showBubble('要和本堂主说点什么？', 2400);
    return;
  }

  state.aiBusy = true;
  refreshPanel();

  try {
    if (input) {
      input.value = '';
    }

    const reply = await api.sendAiMessage({ text });
    showAiReply(reply);
    await refreshAiStatus();
    scheduleAiObservation();
  } finally {
    state.aiBusy = false;
    refreshPanel();
  }
}
