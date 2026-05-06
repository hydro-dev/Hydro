import type { PluginAPI } from '@hydrooj/ui-next';
import BeforeComponent from './before';

export function setup(api: PluginAPI) {
    api.before('page:app', BeforeComponent);
}
