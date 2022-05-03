/* Copyright 2021, Milkdown by Mirone. */
/* eslint-disable consistent-return */
import {
  Emotion, ThemeBorder, ThemeFont, ThemeManager, ThemeScrollbar, ThemeShadow, ThemeSize,
  hex2rgb, ThemeColor, themeFactory, ThemeGlobal, ThemeIcon,
} from '@milkdown/core';
import { getPalette } from '@milkdown/design-system';
import { injectProsemirrorView, useAllPresetRenderer } from '@milkdown/theme-pack-helper';
import { code, typography } from '@milkdown/theme-nord/src/font';
import { getIcon } from '@milkdown/theme-nord/src/icon';
import { darkColor, lightColor } from '@milkdown/theme-nord/src/nord';

export const font = {
  typography,
  code,
};

export const size = {
  radius: '4px',
  lineWidth: '1px',
};

export const getStyle = (manager: ThemeManager, emotion: Emotion) => {
  const { injectGlobal, css } = emotion;
  const palette = getPalette(manager);
  const radius = manager.get(ThemeSize, 'radius');
  const neutral = palette('neutral', 0.87);
  const surface = palette('surface');
  const line = palette('line');
  const highlight = palette('secondary', 0.38);

  const selection = css`
    .ProseMirror-selectednode {
      outline: ${manager.get(ThemeSize, 'lineWidth')} solid ${line};
    }
    li.ProseMirror-selectednode {
      outline: none;
    }
    li.ProseMirror-selectednode::after {
      ${manager.get(ThemeBorder, undefined)};
    }
    & ::selection {
      background: ${highlight};
    }
  `;

  const editorLayout = css`
    padding: 1.25em;
    outline: none;
  `;

  const blockquote = css`
    blockquote {
      padding-left: 1.875em;
      line-height: 1.75em;
      border-left: 4px solid ${palette('primary')};
      margin-left: 0;
      margin-right: 0;
      * {
        font-size: 1em;
        line-height: 1.5em;
      }
    }
  `;

  const hr = css`
    hr {
      height: ${manager.get(ThemeSize, 'lineWidth')};
      background-color: ${line};
      border-width: 0;
    }
  `;

  const list = css`
    .list-item,
    .list-item > * {
      margin: 0.5em 0;
    }
    li {
      &::marker {
        color: ${palette('primary')};
      }
    }
    .task-list-item {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      &_checkbox {
        margin: 0.5em 0.5em 0.5em 0;
        height: 1em;
      }
    }
  `;

  // eslint-disable-next-line no-shadow
  const code = css`
    .code-fence {
      pre {
        font-family: ${manager.get(ThemeFont, 'code')};
        margin: 0 1.2em !important;
        white-space: pre;
        overflow: auto;
        ${manager.get(ThemeScrollbar, ['x'])}
        background-color: ${palette('background')};
        color: ${palette('neutral')};
        font-size: 0.875em;
        border-radius: ${radius};
        code {
          line-height: 1.5;
          font-family: ${manager.get(ThemeFont, 'code')};
        }
      }
    }
  `;

  const img = css`
    .image {
      display: inline-block;
      margin: 0 auto;
      object-fit: contain;
      width: 100%;
      position: relative;
      height: auto;
      text-align: center;
    }
  `;

  const inline = css`
    .code-inline {
      background-color: ${palette('neutral')};
      color: ${palette('background')};
      border-radius: ${radius};
      font-weight: 500;
      font-family: ${code};
      padding: 0 0.2em;
      font-size: 1.2em;
    }
    .strong {
      font-weight: 600;
    }
    .link,
    a {
      color: ${palette('secondary')};
      cursor: pointer;
      transition: all 0.4s ease-in-out;
      font-weight: 500;
      &:hover {
        background-color: ${palette('line')};
        box-shadow: 0 0.2em ${palette('line')}, 0 -0.2em ${palette('line')};
      }
    }
    .strike-through {
      text-decoration-color: ${palette('secondary')};
    }
  `;

  const footnote = css`
    .footnote-definition {
      ${manager.get(ThemeBorder, undefined)};
      border-radius: ${manager.get(ThemeSize, 'radius')};
      background-color: ${palette('background')};
      padding: 1em;
      display: flex;
      flex-direction: row;
      & > .footnote-definition_content {
        flex: 1;
        width: calc(100% - 1em);
        & > dd {
          margin-inline-start: 1em;
        }
        & > dt {
          color: ${palette('secondary')};
          font-weight: 500;
        }
      }
      & > .footnote-definition_anchor {
        width: 1em;
      }
    }
    `;

  const table = css`
    .tableWrapper {
      overflow-x: auto;
      margin: 0;
      ${manager.get(ThemeScrollbar, ['x'])}
      width: 100%;
      * {
        margin: 0;
        box-sizing: border-box;
        font-size: 1em;
      }
    }
    table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
      overflow: auto;
      border-radius: ${manager.get(ThemeSize, 'radius')};
      p {
        line-height: unset;
      }
    }
    tr {
      ${manager.get(ThemeBorder, 'bottom')};
    }
    td,
    th {
      padding: 0 1em;
      vertical-align: top;
      box-sizing: border-box;
      position: relative;
      min-width: 100px;
      ${manager.get(ThemeBorder, undefined)};
      text-align: left;
      line-height: 3;
      height: 3em;
    }
    th {
      background: ${palette('background', 0.5)};
      font-weight: 400;
    }
    .column-resize-handle {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: 0;
      z-index: 20;
      pointer-events: none;
      background: ${palette('secondary')};
      width: ${manager.get(ThemeSize, 'lineWidth')};
    }
    .resize-cursor {
      cursor: ew-resize;
      cursor: col-resize;
    }
    .selectedCell {
      &::after {
        z-index: 2;
        position: absolute;
        content: '';
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        background: ${palette('secondary', 0.38)};
        pointer-events: none;
      }
      & ::selection {
        background: transparent;
      }
    }
  `;

  injectProsemirrorView(emotion);

  // eslint-disable-next-line no-unused-expressions
  injectGlobal`
    .milkdown {
      .material-icons-outlined {
        font-size: 1.5em;
      }
      position: relative;
      margin-left: auto;
      margin-right: auto;
      box-sizing: border-box;
      color: ${neutral};
      background: ${surface};
      font-family: ${manager.get(ThemeFont, 'typography')};
      ${manager.get(ThemeShadow, undefined)}
      ${manager.get(ThemeScrollbar, undefined)}
      ${selection};
      .editor {
        ${editorLayout};
        ${blockquote};
        ${hr};
        ${list};
        ${code};
        ${img};
        ${table};
        ${footnote};
        ${inline};
      }
    }
  `;
};

export const createTheme = (isDarkMode: boolean) => (emotion: Emotion, manager: ThemeManager) => {
  const { css } = emotion;
  const colorSet = isDarkMode ? darkColor : lightColor;

  manager.set(ThemeColor, (options) => {
    if (!options) return;
    const [key, opacity] = options;
    const hex = colorSet[key];
    const rgb = hex2rgb(hex);
    if (!rgb) return;

    return `rgba(${rgb?.join(', ')}, ${opacity || 1})`;
  });

  manager.set(ThemeSize, (key) => {
    if (!key) return;
    return size[key];
  });

  manager.set(ThemeFont, (key) => {
    if (!key) return;
    return font[key].join(', ');
  });

  manager.set(ThemeScrollbar, ([direction = 'y', type = 'normal'] = ['y', 'normal'] as never) => {
    const main = manager.get(ThemeColor, ['secondary', 0.38]);
    const bg = manager.get(ThemeColor, ['secondary', 0.12]);
    const hover = manager.get(ThemeColor, ['secondary']);
    return css`
      scrollbar-width: thin;
      scrollbar-color: ${main} ${bg};
      -webkit-overflow-scrolling: touch;
      &::-webkit-scrollbar {
        ${direction === 'y' ? 'width' : 'height'}: ${type === 'thin' ? 2 : 12}px;
        background-color: transparent;
      }
      &::-webkit-scrollbar-track {
        border-radius: 999px;
        background: transparent;
        border: 4px solid transparent;
      }
      &::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background-color: ${main};
        border: ${type === 'thin' ? 0 : 4}px solid transparent;
        background-clip: content-box;
      }
      &::-webkit-scrollbar-thumb:hover {
        background-color: ${hover};
      }
    `;
  });

  manager.set(ThemeShadow, () => {
    const lineWidth = manager.get(ThemeSize, 'lineWidth');
    const getShadow = (opacity: number) => manager.get(ThemeColor, ['shadow', opacity]);
    return css`
      box-shadow: 0 ${lineWidth} ${lineWidth} ${getShadow(0.14)}, 0 2px ${lineWidth} ${getShadow(0.12)},
          0 ${lineWidth} 3px ${getShadow(0.2)};
    `;
  });

  manager.set(ThemeBorder, (direction) => {
    const lineWidth = manager.get(ThemeSize, 'lineWidth');
    const line = manager.get(ThemeColor, ['line']);
    if (!direction) {
      return css`border: ${lineWidth} solid ${line};`;
    }
    return css`${`border-${direction}`}: ${lineWidth} solid ${line};`;
  });

  manager.set(ThemeIcon, (icon) => {
    if (!icon) return;

    return getIcon(icon);
  });

  manager.set(ThemeGlobal, () => {
    getStyle(manager, emotion);
  });

  useAllPresetRenderer(manager, emotion);
};

export const getNord = (isDarkMode = false) => themeFactory((emotion, manager) => createTheme(isDarkMode)(emotion, manager));

export const nordDark = getNord(true);
export const nordLight = getNord(false);

const darkMode = Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
export const nord = getNord(darkMode);

export { color, darkColor, lightColor } from '@milkdown/theme-nord/src/nord';
