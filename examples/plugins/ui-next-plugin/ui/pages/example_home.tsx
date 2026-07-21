import '../styles.css'; // (3) plain CSS import — applied globally when this page loads

import { Link, usePageData } from '@hydrooj/ui-next';

export default function ExampleHome() {
    const { args } = usePageData(); // args carries the handler's response.body
    return (
        <div className="example-page">
            <h1>ui-next example plugin</h1>
            <p>{args.message as string}</p>
            <Link to="example_css">See the CSS-module demo →</Link>
        </div>
    );
}
