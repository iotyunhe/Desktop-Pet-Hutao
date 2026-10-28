import type { AiReply } from '../../../shared';
import { state } from '../state';

export function playReplyVoice(reply: AiReply): void {
  if (!reply.audioBase64) {
    return;
  }

  stopReplyVoice();
  const audio = new Audio(`data:${reply.audioMimeType ?? 'audio/mpeg'};base64,${reply.audioBase64}`);
  audio.volume = 0.88;
  audio.addEventListener('ended', () => {
    if (state.currentVoice === audio) {
      state.currentVoice = null;
    }
  });

  state.currentVoice = audio;
  void audio.play().catch(() => undefined);
}

export function stopReplyVoice(): void {
  state.currentVoice?.pause();
  state.currentVoice = null;
}
