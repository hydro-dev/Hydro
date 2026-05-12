import type { PluginAPI } from '@hydrooj/ui-next';

export function setup(api: PluginAPI) {
    api.before('page:app', () => {
        console.log('before app');
        // throw new Error('test error boundary in before interceptor');
        return <div>before app via @hydrooj/ui-next-plugin-sample</div>;
    });
}
