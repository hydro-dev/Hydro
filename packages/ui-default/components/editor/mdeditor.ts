import 'md-editor-rt/lib/style.css';

import Anchor from 'markdown-it-anchor';
import Footnote from 'markdown-it-footnote';
import Mark from 'markdown-it-mark';
import MergeCells from 'markdown-it-merge-cells';
import TOC from 'markdown-it-table-of-contents';
import { config, MdEditor } from 'md-editor-rt';
import Imsize from '../../backendlib/markdown-it-imsize';
import katex from '../../backendlib/markdown-it-katex';
import { Media } from '../../backendlib/markdown-it-media';
import { xssProtector } from '../../backendlib/markdown-it-xss';

const pagename = document.documentElement.getAttribute('data-page');
const isProblemPage = ['problem_create', 'problem_edit'].includes(pagename);

config({
  markdownItConfig(mdit) {
    mdit.options.html = true;
    mdit.options.linkify = true;
    mdit.linkify.tlds('.py', false);
    mdit.linkify.tlds('.zip', false);
    mdit.linkify.tlds('.mov', false);
    mdit.use(Media);
    mdit.use(Footnote);
    mdit.use(Mark);
    mdit.use(Imsize);
    mdit.use(Anchor);
    mdit.use(TOC);
    mdit.use(MergeCells);
    mdit.use(xssProtector);
    mdit.use(katex);
    if (isProblemPage) {
      mdit.core.ruler.before('normalize', 'xss', (state) => {
        state.src = state.src.replace(/file:\/\//g, pagename === 'problem_create' ? `/file/${UserContext._id}/` : './file/');
      });
    }
  },
  markdownItPlugins() {
    // disable all default plugins
    return [];
  },
});

export { MdEditor };
