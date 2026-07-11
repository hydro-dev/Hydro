import 'md-editor-rt/lib/style.css';

import zh_TW from '@vavt/cm-extension/dist/locale/zh-TW';
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
const previewConfig: Record<string, string> = {
  problem_edit: './file/',
  homework_edit: './file/public/',
  contest_edit: './file/public/',
};
const isCreatePage = ['problem_create', 'homework_create', 'contest_create'].includes(pagename);
const filePreviewPrefix = previewConfig[pagename] || (isCreatePage ? `/file/${UserContext._id}/` : null);

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
    if (filePreviewPrefix) {
      mdit.core.ruler.before('normalize', 'xss', (state) => {
        state.src = state.src.replace(/file:\/\//g, filePreviewPrefix);
      });
    }
  },
  markdownItPlugins() {
    // disable all default plugins
    return [];
  },
  codeMirrorExtensions(extensions) {
    return extensions.filter((i) => i.type !== 'linkShortener');
  },
  editorConfig: {
    languageUserDefined: {
      'zh-TW': zh_TW,
    },
  },
});

export { MdEditor };
