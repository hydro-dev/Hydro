import { Context, Handler } from 'hydrooj';

// Server side of the example plugin. It registers a couple of routes whose
// handlers set a `template`; with @hydrooj/ui-next installed the `next` renderer
// (priority 100) wins for every template, ignores the template file, and injects
// the route/template name into the SPA shell. The client then renders the page
// registered under `page:<template without .html>` (falling back to `page:<route name>`).

class ExampleHomeHandler extends Handler {
    async get() {
        // Stem (`example_home`) must match the slot registered in ui/index.tsx.
        this.response.template = 'example_home.html';
        // response.body is forwarded to the page as `args` (see usePageData).
        this.response.body = { message: 'Hello from the ui-next example plugin server side!' };
    }
}

class ExampleCssHandler extends Handler {
    async get() {
        this.response.template = 'example_css.html';
        this.response.body = {};
    }
}

export async function apply(ctx: Context) {
    // A couple of test routes to host the example pages.
    ctx.Route('example_home', '/example', ExampleHomeHandler);
    ctx.Route('example_css', '/example/css', ExampleCssHandler);
}
