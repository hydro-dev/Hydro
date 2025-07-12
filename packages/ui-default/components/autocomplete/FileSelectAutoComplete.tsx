import AutoComplete, { AutoCompleteOptions } from '.';
import FileSelectAutoCompleteFC from './components/FileSelectAutoComplete';

interface FileSelectOptions {
  data: {
    id: string;
    name: string;
  }[];
}

export default class FileSelectAutoComplete<Multi extends boolean> extends AutoComplete<FileSelectOptions> {
  static DOMAttachKey = 'ucwFileSelectAutoCompleteInstance';

  constructor($dom, options: FileSelectOptions & AutoCompleteOptions<Multi>) {
    super($dom, {
      classes: 'file-select',
      component: FileSelectAutoCompleteFC,
      props: {
        data: options.data,
        multi: options.multi,
        height: 'auto',
      },
      ...options,
    });
  }
}

window.Hydro.components.FileSelectAutoComplete = FileSelectAutoComplete;
