/* eslint-disable no-empty-function */
/* eslint-disable class-methods-use-this */
import { NotFoundError } from '../error';
import { Route, Handler } from '../service/server';

class NotFoundHandler extends Handler {
    prepare() {
        throw new NotFoundError(this.request.path);
    }

    all() { }
}

export async function apply() {
    Route('notfound', '/:a', NotFoundHandler);
    Route('notfound', '/:a/:b', NotFoundHandler);
    Route('notfound', '/:a/:b/:c', NotFoundHandler);
    Route('notfound', '/:a/:b/:c/:d', NotFoundHandler);
    Route('notfound', '/:a/:b/:c/:d/:e', NotFoundHandler);
    Route('notfound', '/:a/:b/:c/:d/:e/:f', NotFoundHandler);
    Route('notfound', '/:a/:b/:c/:d/:e/:f/:g', NotFoundHandler);
    Route('notfound', '/:a/:b/:c/:d/:e/:f/:g/:h', NotFoundHandler);
}

global.Hydro.handler.notfound = apply;
