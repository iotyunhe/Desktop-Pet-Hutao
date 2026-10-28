import { requireApi } from '../api';
import { DRAG_START_DISTANCE, LONG_PRESS_CLICK_LIMIT_MS } from '../constants';
import { isSleepingMood, state } from '../state';
import { hideBubble } from './bubble';
import { handlePetClick } from './interactions';
import { setPressing } from './mood';
import { closePanel } from './panel';
import { updateMousePassthrough } from './passthrough';
import { noteInteraction, scheduleRoam, stopRoam } from './roam';

let dragStartTask: Promise<void> | null = null;
let longPressTimer = 0;
let longPressTriggered = false;

async function ensureDragStarted(): Promise<void> {
  if (dragStartTask) {
    await dragStartTask;
    dragStartTask = null;
  }
}

export async function onPetPointerDown(event: PointerEvent): Promise<void> {
  if (event.button !== 0) {
    return;
  }

  const api = requireApi();
  event.preventDefault();
  event.stopPropagation();

  const target = event.currentTarget as HTMLButtonElement;
  target.setPointerCapture(event.pointerId);

  state.dragging = true;
  state.movedDuringDrag = false;
  state.pointerId = event.pointerId;
  state.moodBeforePress = state.mood;
  state.pressStartedAt = performance.now();
  state.pointerStart = null;

  stopRoam();
  noteInteraction();
  state.mousePassthrough = false;
  void api.setMousePassthrough(false);
  window.clearTimeout(state.timers.activeMood);
  setPressing(true);

  // 长按期间不允许任何气泡继续显示或扩张；超过点击阈值后彻底禁止本次 click。
  longPressTriggered = false;
  window.clearTimeout(longPressTimer);
  longPressTimer = window.setTimeout(() => {
    if (state.dragging && !state.movedDuringDrag) {
      longPressTriggered = true;
      hideBubble();
    }
  }, LONG_PRESS_CLICK_LIMIT_MS + 20);

  const startPoint = {
    x: event.screenX,
    y: event.screenY
  };

  // 面板收起会改变窗口宽度和胡桃位置，等布局稳定后再计算拖拽偏移，避免起手跳一下。
  if (state.panelMode !== 'none') {
    await closePanel();
  }

  if (!state.dragging || state.pointerId !== event.pointerId) {
    return;
  }

  state.pointerStart = startPoint;
  dragStartTask = api.beginDrag(startPoint).catch(() => undefined);
}

export async function onDocumentPointerMove(event: PointerEvent): Promise<void> {
  if (!state.dragging || !state.pointerStart || state.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const deltaX = event.screenX - state.pointerStart.x;
  const deltaY = event.screenY - state.pointerStart.y;

  if (Math.hypot(deltaX, deltaY) <= DRAG_START_DISTANCE) {
    return;
  }

  state.movedDuringDrag = true;
  window.clearTimeout(longPressTimer);
  await ensureDragStarted();
  await requireApi().dragTo({
    x: event.screenX,
    y: event.screenY
  });
}

export async function onDocumentPointerUp(event: PointerEvent): Promise<void> {
  if (!state.dragging || state.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  window.clearTimeout(longPressTimer);
  const petButton = document.querySelector<HTMLButtonElement>('.pet-button');
  if (petButton?.hasPointerCapture(event.pointerId)) {
    petButton.releasePointerCapture(event.pointerId);
  }

  state.dragging = false;
  setPressing(false);
  const wasSleepingBeforePress = state.moodBeforePress !== null && isSleepingMood(state.moodBeforePress);
  const wasLongPress =
    longPressTriggered || performance.now() - state.pressStartedAt > LONG_PRESS_CLICK_LIMIT_MS;
  longPressTriggered = false;
  const shouldHandleClick = !state.movedDuringDrag && !wasLongPress;

  state.pointerStart = null;
  state.moodBeforePress = null;
  state.pressStartedAt = 0;
  state.pointerId = null;

  await ensureDragStarted();
  await requireApi().endDrag();

  if (state.movedDuringDrag) {
    scheduleRoam();
  } else if (shouldHandleClick) {
    handlePetClick(wasSleepingBeforePress);
  } else {
    scheduleRoam();
  }

  updateMousePassthrough(document.elementFromPoint(event.clientX, event.clientY));
}
