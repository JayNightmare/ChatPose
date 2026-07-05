import blessed from 'blessed';

import type { ScreenName } from '../domain/models';

export type UiRenderModel = {
    currentScreen: ScreenName;
    logLines: string[];
    prompt: string;
    peerId: string;
};

export class TerminalUi {
    private readonly screen = blessed.screen({
        smartCSR: true,
        title: 'ChatPose'
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
        bottom: 4,
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
        bottom: 2,
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
        height: 2,
        inputOnFocus: true,
        border: 'line',
        style: {
            border: { fg: 'green' },
            fg: 'green'
        }
    });

    public constructor() {
        this.screen.key(['C-c'], () => process.exit(0));
    }

    public onSubmit(callback: (value: string) => void): void {
        this.input.on('submit', (value: string) => {
            callback(value);
            this.input.clearValue();
            this.screen.render();
            this.input.focus();
        });
    }

    public onKey(name: string, callback: () => void): void {
        this.screen.key([name], callback);
    }

    public render(model: UiRenderModel): void {
        this.header.setContent(
            `{bold}ChatPose Secure CLI{/bold} | Screen: {green-fg}${model.currentScreen}{/green-fg} | Peer: ${model.peerId}`
        );

        this.body.setContent(model.logLines.join('\n'));
        this.footer.setContent(`hint> ${model.prompt}`);
        this.screen.render();
    }

    public startInput(): void {
        this.input.focus();
        this.screen.render();
    }
}
