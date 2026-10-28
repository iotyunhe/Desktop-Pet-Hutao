import { getApi } from '../api';
import { state } from '../state';

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.pet-button, .menu-button, .side-panel'));
}

/**
 * 透明窗只在胡桃本体和面板上拦截鼠标，其余区域保持穿透。
 * 只在状态变化时发 IPC，避免每次 mousemove 都跨进程通信。
 */
export function updateMousePassthrough(target: EventTarget | null): void {
  const api = getApi();
  if (!api || state.dragging) {
    return;
  }

  const shouldPass = state.panelMode === 'none' ? !isInteractiveTarget(target) : false;

  if (state.mousePassthrough === shouldPass) {
    return;
  }

  state.mousePassthrough = shouldPass;
  void api.setMousePassthrough(shouldPass);
}

export function resetMousePassthrough(): void {
  state.mousePassthrough = null;
}
