import { Handler } from '../service/server';

class ProblemCategoryCompatHandler extends Handler {
    async get({ category }) {
        this.response.redirect = this.url('problem_main', { query: { q: `category:${category}` } });
    }
}

export const apply = (ctx) => {
    ctx.Route('problem_category_compat', '/p/category/:category', ProblemCategoryCompatHandler);
};
