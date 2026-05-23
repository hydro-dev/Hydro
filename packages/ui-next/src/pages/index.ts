import { registerPage } from '../registry/page';

registerPage('homepage', () => import('./homepage'));
registerPage('problem_main', () => import('./problem_main'));
