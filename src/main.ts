import { Application } from './app/application';

async function bootstrap(): Promise<void> {
    const app = new Application();
    await app.start();
}

void bootstrap().catch((error) => {
    console.error('Fatal startup error:', error);
    process.exit(1);
});
