import { AutoComplete, AutoCompleteHandle, AutoCompleteProps } from '@hydrooj/components';
import PropTypes from 'prop-types';
import React, { forwardRef } from 'react';

interface LanguageFakeDoc {
  _id: string
  name: string
}

const getLanguagesDocList = (): LanguageFakeDoc[] => {
  try {
    if (!window.LANGS || typeof window.LANGS !== 'object') {
      console.error('window.LANGS is not available or invalid');
      return [];
    }

    const prefixes = new Set(
      Object.keys(window.LANGS)
        .filter((i) => i.includes('.'))
        .map((i) => i.split('.')[0]),
    );

    return Object.keys(window.LANGS)
      .filter((i) => !prefixes.has(i))
      .map((i) => ({
        name: `${i.includes('.') ? `${window.LANGS[i.split('.')[0]].display || ''}/` : ''}${window.LANGS[i].display}`,
        _id: i,
      }));
  } catch (error) {
    console.error('Error processing languages:', error);
    return [];
  }
};

const LanguageSelectAutoComplete = forwardRef<AutoCompleteHandle<LanguageFakeDoc>, AutoCompleteProps<LanguageFakeDoc>>((props, ref) => (
  <AutoComplete<LanguageFakeDoc>
    ref={ref as any}
    cacheKey={`language-${UiContext.domainId}`}
    queryItems={async (query) => {
      const q = query.toLocaleLowerCase();
      return getLanguagesDocList().filter((el) =>
        el._id.toLocaleLowerCase().includes(q) || el.name.toLocaleLowerCase().includes(q),
      );
    }}
    fetchItems={async (ids) => getLanguagesDocList().filter((el) => ids.includes(el._id))}
    itemText={(pdoc) => pdoc.name}
    itemKey={(pdoc) => pdoc._id}
    renderItem={(pdoc) => (
      <div className="media">
        <div className="media__body medium">
          <div className="language-select__name">{pdoc.name}</div>
          <div className="language-select__id">{pdoc._id}</div>
        </div>
      </div>
    )}
    {...{
      width: '100%',
      height: 'auto',
      listStyle: {},
      multi: false,
      selectedKeys: [],
      allowEmptyQuery: false,
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props,
    }}
  />
));

LanguageSelectAutoComplete.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  listStyle: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  multi: PropTypes.bool,
  selectedKeys: PropTypes.arrayOf(PropTypes.string),
  allowEmptyQuery: PropTypes.bool,
  freeSolo: PropTypes.bool,
  freeSoloConverter: PropTypes.func,
};

LanguageSelectAutoComplete.displayName = 'LanguageSelectAutoComplete';

export default LanguageSelectAutoComplete;
