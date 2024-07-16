import '@codingame/monaco-editor-wrapper/features/extensionHostWorker';
import '@codingame/monaco-editor-wrapper/features/notifications';
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import '@codingame/monaco-vscode-json-default-extension';

import {
  createEditor, initialize, registerFile, registerServices,
} from '@codingame/monaco-editor-wrapper';
import { RegisteredMemoryFile } from '@codingame/monaco-vscode-files-service-override';
import * as monaco from 'monaco-editor';
import * as vscode from 'vscode';

export default monaco;
export {
  createEditor, registerFile, RegisteredMemoryFile, vscode,
};
export {
  getUserConfiguration, getConfiguration,
  onUserConfigurationChange, onConfigurationChanged,
  updateUserConfiguration,
} from '@codingame/monaco-editor-wrapper';

export const init = async (workbench = false) => {
  if (workbench) {
    // const [
    //   { default: getWorkbenchServiceOverride },
    //   { default: getMultiDiffEditorServiceOverride },
    //   { default: getQuickAccessServiceOverride },
    // ] = await Promise.all([
    //   import('@codingame/monaco-vscode-workbench-service-override'),
    //   import('@codingame/monaco-vscode-multi-diff-editor-service-override'),
    //   import('@codingame/monaco-vscode-quickaccess-service-override'),
    // ]);
    // registerServices({
    //   ...getWorkbenchServiceOverride(),
    //   ...getMultiDiffEditorServiceOverride(),
    //   ...getQuickAccessServiceOverride({
    //     shouldUseGlobalPicker() {
    //       return true;
    //     },
    //     isKeybindingConfigurationVisible() {
    //       return true;
    //     },
    //   }),
    // });
  }
  return initialize({
    workspaceProvider: {
      trusted: true,
      workspace: {
        workspaceUri: vscode.Uri.file('/'),
      },
      async open() {
        return false;
      },
    },
  });
};
