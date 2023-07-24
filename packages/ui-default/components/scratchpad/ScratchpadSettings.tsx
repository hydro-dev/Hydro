import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './reducers';

export default function ScratchpadSettings() {
  const config = useSelector((state: RootState) => state.ui.settings.config);
  const parsed = React.useMemo(() => {
    const settings = { fontSize: 14 };
    try {
      Object.assign(settings, config);
    } catch (e) { }
    return settings;
  }, [config]);
  const dispatch = useDispatch();
  function dispatcher(setting: string, numeric = false) {
    return (ev) => {
      const val = ev?.target?.value || ev;
      dispatch({ type: 'SCRATCHPAD_SETTING_UPDATE', payload: { setting, value: numeric ? +val : val } });
    };
  }
  // TODO update style
  return <div>
    Fontsize: <input type="number" step="1" value={parsed.fontSize} onChange={dispatcher('fontSize', true)} />
  </div>;
}
