import { Context, Handler } from 'hydrooj';

class ExampleHomeHandler extends Handler {
    useUiNext = true;

    async get() {
        // response.body is forwarded to the page as `args` (see usePageData).
        this.response.body = { message: 'Hello from the ui-next example plugin server side!' };
    }
}

class ExampleCssHandler extends Handler {
    useUiNext = true;

    async get() {
        this.response.body = {};
    }
}

export async function apply(ctx: Context) {
    // A couple of test routes to host the example pages.
    ctx.Route('example_home', '/example', ExampleHomeHandler);
    ctx.Route('example_css', '/example/css', ExampleCssHandler);
}
