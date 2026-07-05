import blessed from 'blessed';

import type { ScreenName } from '../domain/models';

type CompletionResult = {
  value: string;
  suggestionLine?: string;
};

export type UiRenderModel = {
  currentScreen: ScreenName;
  logLines: string[];
  prompt: string;
  peerId: string;
  persistenceMode: 'connected' | 'ephemeral';
  accountEmail: string | null;
};

export class TerminalUi {
  private readonly commandHistory: string[] = [];
  private historyIndex: number | null = null;
  private draftInput = '';
  private completionHandler: ((input: string) => CompletionResult | null) | null = null;
  private infoHandler: ((line: string) => void) | null = null;
  private renderedLogCount = 0;
  private hasUnreadLogs = false;

  private readonly screen = blessed.screen({
    smartCSR: true,
    title: 'ChatPose',
    cursor: {
      artificial: true,
      blink: true,
      shape: 'line'
    }
  });

  private readonly header = blessed.box({
    parent: this.screen,
    top: 0,
    left: 0,
    height: 3,
    width: '100%',
    tags: true,
    border: 'line',
    style: {
      border: { fg: 'green' },
      fg: 'green'
    }
  });

  private readonly body = blessed.box({
    parent: this.screen,
    top: 3,
    left: 0,
    width: '100%',
    bottom: 5,
    border: 'line',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    tags: true,
    style: {
      border: { fg: 'green' },
      fg: 'white'
    }
  });

  private readonly footer = blessed.box({
    parent: this.screen,
    bottom: 3,
    left: 0,
    width: '100%',
    height: 2,
    tags: true,
    style: {
      fg: 'green'
    }
  });

  private readonly input = blessed.textbox({
    parent: this.screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    keys: true,
    inputOnFocus: true,
    border: 'line',
    style: {
      border: { fg: 'green' },
      fg: 'white',
      bg: 'black'
    }
  });

  public constructor() {
    this.screen.key(['C-c'], () => process.exit(0));
    this.screen.key(['pageup'], () => this.scrollBodyBy(-8));
    this.screen.key(['pagedown'], () => this.scrollBodyBy(8));
    this.screen.key(['C-u'], () => this.scrollBodyBy(-8));
    this.screen.key(['C-d'], () => this.scrollBodyBy(8));
    this.input.on('focus', () => {
      this.input.readInput();
      this.screen.program.showCursor();
      this.screen.render();
    });
    this.input.on('keypress', () => {
      this.screen.render();
    });
    this.input.key(['up'], () => {
      this.navigateHistoryPrevious();
      return false;
    });
    this.input.key(['down'], () => {
      this.navigateHistoryNext();
      return false;
    });
    this.input.key(['tab'], () => {
      // Blessed textboxes can still inject a tab character; strip it before completion.
      const sanitizedValue = this.input.getValue().replace(/\t+/g, '');
      if (sanitizedValue !== this.input.getValue()) {
        this.input.setValue(sanitizedValue);
      }
      this.applyCompletion();
      return false;
    });
    this.body.on('scroll', () => {
      if (this.isBodyAtBottom() && this.hasUnreadLogs) {
        this.hasUnreadLogs = false;
        this.screen.render();
      }
    });
  }

  public onSubmit(callback: (value: string) => void): void {
    this.input.on('submit', (value: string) => {
      const trimmed = value.trim();
      this.pushHistory(trimmed);
      callback(value);
      this.input.clearValue();
      this.historyIndex = null;
      this.draftInput = '';
      this.screen.render();
      this.input.focus();
    });
  }

  public onKey(name: string, callback: () => void): void {
    this.screen.key([name], callback);
    this.input.key([name], callback);
  }

  public onInfo(callback: (line: string) => void): void {
    this.infoHandler = callback;
  }

  public onCompletion(callback: (input: string) => CompletionResult | null): void {
    this.completionHandler = callback;
  }

  public render(model: UiRenderModel): void {
    const modeColor = model.persistenceMode === 'connected' ? 'green-fg' : 'yellow-fg';
    const wasAtBottom = this.isBodyAtBottom();
    const hasNewLogs = model.logLines.length > this.renderedLogCount;
    if (hasNewLogs && !wasAtBottom) {
      this.hasUnreadLogs = true;
    }

    const unreadDot = this.hasUnreadLogs ? ' {red-fg}●{/red-fg}' : '';
    const account = model.accountEmail ?? 'none';
    this.header.setContent(
      `{bold}ChatPose${unreadDot}{/bold} | Screen: {green-fg}${model.currentScreen}{/green-fg} | Mode: {${modeColor}}${model.persistenceMode}{/${modeColor}} | Account: ${account}`
    );

    this.body.setContent(model.logLines.join('\n'));
    this.renderedLogCount = model.logLines.length;

    if (hasNewLogs && wasAtBottom) {
      this.body.setScrollPerc(100);
      this.hasUnreadLogs = false;
    }

    if (this.isBodyAtBottom() && this.hasUnreadLogs) {
      this.hasUnreadLogs = false;
    }

    this.footer.setContent(`hint> ${model.prompt}`);
    this.screen.render();
  }

  public startInput(): void {
    this.input.focus();
    this.input.readInput();
    this.screen.program.showCursor();
    this.screen.render();
  }

  private pushHistory(value: string): void {
    if (!value) {
      return;
    }

    if (this.commandHistory[this.commandHistory.length - 1] === value) {
      return;
    }

    this.commandHistory.push(value);
    if (this.commandHistory.length > 100) {
      this.commandHistory.shift();
    }
  }

  private navigateHistoryPrevious(): void {
    if (this.commandHistory.length === 0) {
      return;
    }

    if (this.historyIndex === null) {
      this.draftInput = this.input.getValue();
      this.historyIndex = this.commandHistory.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex -= 1;
    }

    this.input.setValue(this.commandHistory[this.historyIndex]);
    this.screen.render();
  }

  private navigateHistoryNext(): void {
    if (this.historyIndex === null) {
      return;
    }

    if (this.historyIndex < this.commandHistory.length - 1) {
      this.historyIndex += 1;
      this.input.setValue(this.commandHistory[this.historyIndex]);
      this.screen.render();
      return;
    }

    this.historyIndex = null;
    this.input.setValue(this.draftInput);
    this.screen.render();
  }

  private applyCompletion(): void {
    if (!this.completionHandler) {
      return;
    }

    const currentValue = this.input.getValue().replace(/\t+/g, '');
    if (currentValue !== this.input.getValue()) {
      this.input.setValue(currentValue);
    }
    const result = this.completionHandler(currentValue);
    if (!result) {
      this.screen.render();
      return;
    }

    this.input.setValue(result.value);
    if (result.suggestionLine && this.infoHandler) {
      this.infoHandler(result.suggestionLine);
    }
    this.screen.render();
  }

  private scrollBodyBy(offset: number): void {
    this.body.scroll(offset);
    if (this.isBodyAtBottom() && this.hasUnreadLogs) {
      this.hasUnreadLogs = false;
    }
    this.screen.render();
  }

  private isBodyAtBottom(): boolean {
    if (this.body.getScrollHeight() === 0) {
      return true;
    }

    return this.body.getScrollPerc() >= 99;
  }
}
