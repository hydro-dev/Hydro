import { CustomSelectAutoComplete } from '@hydrooj/components';
import PropTypes from 'prop-types';
import React from 'react';

const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
const data = Object.keys(window.LANGS).filter((i) => !prefixes.has(i))
  .map((i) => ({ name: `${i.includes('.') ? `${window.LANGS[i.split('.')[0]].display || ''}/` : ''}${window.LANGS[i].display}`, _id: i }));
const withAuto = [...data, { name: 'Auto', _id: 'auto' }];

const LanguageSelectAutoComplete = React.forwardRef<any, any>((props, ref) => (
  <CustomSelectAutoComplete
    ref={ref as any}
    {...props}
    selectedKeys={typeof props.selectedKeys === 'string' ? props.selectedKeys.split(',') : props.selectedKeys}
    data={props.withAuto ? withAuto : data}
    renderItem={(item) => (prefixes.has(item._id) ? '' : `${item.name}`)}
    onChange={(val) => {
      let value = val.split(',');
      const active = new Set(value.filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
      value = value.filter((i) => !prefixes.has(i) || active.has(i));
      for (const i of active) if (!value.includes(i)) value.push(i);
      props.onChange(value.join(','));
    }}
    multi={!!props.multi}
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
  data: PropTypes.arrayOf(PropTypes.any),
  withAuto: PropTypes.bool,
};

LanguageSelectAutoComplete.displayName = 'LanguageSelectAutoComplete';

export default LanguageSelectAutoComplete;
