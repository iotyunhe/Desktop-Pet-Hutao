import idleSpriteUrl from '../assets/pet/hutao-chibi.png';

export interface ShellElements {
  petButton: HTMLButtonElement;
  petImage: HTMLImageElement;
  menuButton: HTMLButtonElement;
  menuBadge: HTMLSpanElement;
  bubble: HTMLDivElement;
  burst: HTMLDivElement;
  panel: HTMLElement;
}

let elements: ShellElements | null = null;

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`桌宠 UI 缺少元素：${selector}`);
  }

  return element;
}

export function mountShell(): ShellElements {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) {
    throw new Error('缺少 #app 挂载点。');
  }

  app.innerHTML = `
    <section class="pet-shell" aria-label="胡桃桌宠">
      <div class="speech-bubble" hidden></div>
      <div class="reaction-burst" aria-hidden="true"></div>
      <aside class="side-panel" hidden></aside>
      <button class="pet-button" type="button" data-mood="idle" aria-label="和胡桃互动">
        <img class="pet-image" src="${idleSpriteUrl}" alt="" draggable="false" />
      </button>
      <button class="menu-button" type="button" title="互动" aria-label="打开互动面板">
        <span aria-hidden="true">⋯</span>
        <span class="menu-badge" hidden>1</span>
      </button>
    </section>
  `;

  elements = {
    petButton: query<HTMLButtonElement>('.pet-button'),
    petImage: query<HTMLImageElement>('.pet-image'),
    menuButton: query<HTMLButtonElement>('.menu-button'),
    menuBadge: query<HTMLSpanElement>('.menu-badge'),
    bubble: query<HTMLDivElement>('.speech-bubble'),
    burst: query<HTMLDivElement>('.reaction-burst'),
    panel: query<HTMLElement>('.side-panel')
  };

  return elements;
}

export function getElements(): ShellElements {
  if (!elements) {
    throw new Error('桌宠 UI 还没挂载。');
  }

  return elements;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
