// eslint-disable-next-line simple-import-sort/imports
import 'prismjs';

import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/toolbar/prism-toolbar.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';
import 'prismjs/plugins/line-highlight/prism-line-highlight';

{{ const components = require('prismjs/components') }}
{{ const dependencies = require('prismjs/dependencies') }}
{{+ dependencies(components, Object.keys(components.languages).filter((l) => l !== 'meta')).getIds().map((it) => `import 'prismjs/components/prism-${it}';`).join('\n') }}
