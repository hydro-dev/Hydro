import './autocomplete.scss';

import { debounce, uniqueId } from 'lodash';
import React, {
  forwardRef, useEffect,
  useImperativeHandle, useRef, useState,
} from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Icon from '../Icon';

export interface AutoCompleteProps<Item> {
  width?: string;
  /**
   * if you need fix height, set to at least "30px"
   * for Hydro, no less then "34px" can be better
   */
  height?: string;
  disabled?: boolean;
  placeholder?: string;
  disabledHint?: string;
  listStyle?: React.CSSProperties;
  cacheKey?: string;
  renderItem?: (item: Item) => any;
  queryItems?: (query: string) => Promise<Item[]> | Item[];
  fetchItems?: (ids: string[]) => Promise<Item[]> | Item[];
  itemText?: (item: Item) => string;
  itemKey?: (item: Item) => string;
  onChange?: (value: string) => any;
  multi?: boolean;
  draggable?: boolean;
  selectedKeys?: string[];
  allowEmptyQuery?: boolean;
  freeSolo?: boolean;
  freeSoloConverter?: (value: string) => string;
}

export interface AutoCompleteHandle<Item> {
  getSelectedItems: () => Item[];
  getSelectedItemKeys: () => string[];
  setSelectedItems: (items: Item[]) => void;
  getQuery: () => string;
  setQuery: (query: string) => void;
  setSelectedKeys: (keys: string[]) => void;
  triggerQuery: () => any;
  closeList: () => void;
  getValue: () => string;
  clear: () => void;
  focus: () => void;
}

const superCache = {};

function DraggableSelection({
  type, id, move, children, ...props
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, drag] = useDrag<{ id: string }, any, boolean>(() => ({
    type,
    item: { id },
    collect: (m) => m.isDragging(),
  }));
  const [, drop] = useDrop({
    accept: type,
    hover: (item: { id: string }) => {
      if (!ref.current) return;
      move(item.id, id);
    },
  });
  drag(drop(ref));
  return (
    <div ref={ref} {...props} style={{ opacity: isDragging ? 0.2 : 1 }}>
      {children}
    </div>
  );
}

// eslint-disable-next-line prefer-arrow-callback
const AutoComplete = forwardRef(function Impl<T>(props: AutoCompleteProps<T>, ref: React.Ref<AutoCompleteHandle<T>>) {
  const {
    multi = false, width = '100%', height = 'auto',
    freeSolo = false, allowEmptyQuery = false, listStyle = {},
    disabled = false, disabledHint = '', draggable = multi,
  } = props;
  const queryItems = props.queryItems ?? (() => []);
  const renderItem = props.renderItem ?? ((item) => item);
  const itemText = props.itemText ?? ((item) => item.toString());
  const itemKey = props.itemKey ?? itemText;
  const onChange = props.onChange ?? (() => { });
  const freeSoloConverter = freeSolo ? props.freeSoloConverter ?? ((i) => i) : (i) => i;

  const [focused, setFocused] = useState(false); // is focused
  const [selectedKeys, setSelectedKeys] = useState(props.selectedKeys || []); // keys of selected items
  const [itemList, setItemList] = useState([]); // items list
  const [currentItem, setCurrentItem] = useState(null); // index of current item (in item list)
  const [rerender, setRerender] = useState(false);
  const [draggableId] = useState(() => uniqueId());

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  let [queryCache, valueCache] = [useRef({}).current, useRef({}).current];
  if (props.cacheKey) {
    superCache[props.cacheKey] ||= { query: {}, value: {} };
    queryCache = superCache[props.cacheKey].query;
    valueCache = superCache[props.cacheKey].value;
  }

  const queryList = async (query) => {
    if (!query && !allowEmptyQuery) {
      setItemList([]);
      setCurrentItem(null);
      return;
    }
    try {
      queryCache[query] ||= await queryItems(query);
      for (const item of queryCache[query]) valueCache[itemKey(item)] = item;
      setItemList(queryCache[query]);
      setCurrentItem((!freeSolo && queryCache[query].length) ? 0 : null);
    } catch (e) {
      console.error('Failed to query items', e);
      setItemList([]);
      setCurrentItem(null);
    }
  };

  useEffect(() => {
    setSelectedKeys(props.selectedKeys || []);
  }, [JSON.stringify(props.selectedKeys)]);
  const dispatchChange = () => {
    if (!multi) onChange(inputRef.current?.value);
    else onChange(selectedKeys.filter((v) => v?.trim().length).join(','));
  };

  useEffect(() => {
    dispatchChange();
    if (!multi) return; // Load pre-selected items only in multi mode
    const ids = [];
    for (const key of selectedKeys) if (!valueCache[key]) ids.push(key);
    if (!ids.length) return;
    Promise.resolve(props.fetchItems(ids)).then((items) => {
      for (const item of items) valueCache[itemKey(item)] = item;
      setRerender(!rerender);
    }).catch((e) => {
      console.error('Failed to fetch items', e);
    });
  }, [selectedKeys, multi]);

  const handleInputChange = debounce((e?) => queryList(e ? e.target.value : ''), 300);

  const toggleItem = (item: T, key = itemKey(item), preserve = false) => {
    const shouldKeepOpen = multi && allowEmptyQuery && inputRef.current.value === '';
    if (multi) {
      const idx = selectedKeys.indexOf(key);
      if (idx !== -1) {
        setSelectedKeys((s) => {
          const newSelectedKeys = [...s];
          newSelectedKeys.splice(idx, 1);
          return newSelectedKeys;
        });
      } else {
        setSelectedKeys((s) => [...s, key]);
      }
      if (!preserve) inputRef.current.value = '';
      inputRef.current.focus();
    } else {
      setSelectedKeys([key]);
      inputRef.current.value = key;
    }
    if (!shouldKeepOpen) {
      setItemList([]);
      setCurrentItem(null);
    }
  };

  const handleInputKeyDown = (e) => {
    const { key, target } = e;
    if (key === 'Escape') {
      setItemList([]);
      setCurrentItem(null);
      return;
    }
    if (key === 'Enter' || key === ',') {
      e.preventDefault();
      if (currentItem !== null) {
        toggleItem(itemList[currentItem]);
        return;
      }
      if (freeSolo && target.value !== '') {
        toggleItem(freeSoloConverter(target.value));
      }
      return;
    }
    if (key === 'Backspace') {
      if (target.value.length) return;
      if (selectedKeys.length) {
        setSelectedKeys((s) => s.slice(0, -1));
      }
      return;
    }
    if (key === 'ArrowUp') {
      e.preventDefault();
      if (itemList.length === 0) return;
      const idx = (currentItem ?? 0) - 1;
      const newIdx = idx < 0 ? itemList.length - 1 : idx;
      setCurrentItem(newIdx);
      listRef.current.children[newIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      if (itemList.length === 0) return;
      const idx = (currentItem ?? itemList.length - 1) + 1;
      const newIdx = idx >= itemList.length ? 0 : idx;
      setCurrentItem(newIdx);
      listRef.current.children[newIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // eslint-disable-next-line no-useless-return
      return;
    }
    // TODO: handle other keys
  };

  useImperativeHandle(ref, () => ({
    getSelectedItems: () => selectedKeys.map((key) => valueCache[key]),
    getSelectedItemKeys: () => [...selectedKeys, inputRef.current?.value].filter((v) => v?.trim().length),
    setSelectedItems: (items) => {
      setSelectedKeys(items.map((i) => itemKey(i)));
      if (!multi && inputRef.current) inputRef.current.value = items.map((i) => itemKey(i)).join(',');
    },
    setSelectedKeys,
    getQuery: () => inputRef.current?.value,
    setQuery: (query) => {
      if (inputRef.current) inputRef.current.value = query;
    },
    triggerQuery: () => queryList(inputRef.current?.value),
    closeList: () => {
      setItemList([]);
      setCurrentItem(null);
    },
    getValue: () => (multi ? selectedKeys.join(',') : (inputRef.current.value ?? '')),
    clear: () => {
      setSelectedKeys([]);
      if (inputRef.current) inputRef.current.value = '';
    },
    focus: () => {
      setFocused(true);
      inputRef.current?.focus();
    },
  }), [selectedKeys, inputRef, multi]);

  const move = (dragId: string, hoverId: string) => {
    if (dragId === hoverId || !draggable) return;
    const dragIndex = selectedKeys.indexOf(dragId);
    const hoverIndex = selectedKeys.indexOf(hoverId);
    setSelectedKeys((s) => {
      const a = [...s];
      a.splice(dragIndex, 1);
      a.splice(hoverIndex, 0, s[dragIndex]);
      return a;
    });
  };

  return (
    <div className="autocomplete-container" style={{ display: 'inline-block', width: '100%', marginBottom: '1rem' }}>
      <div
        className={focused ? 'autocomplete-wrapper focused' : 'autocomplete-wrapper'}
        style={{ width, height }}
      >
        <DndProvider backend={HTML5Backend}>
          {multi && selectedKeys.map((key) => {
            const item = valueCache[key];
            return (
              <DraggableSelection type={draggableId} id={key} move={move} className="autocomplete-tag" key={item ? key : `draft-${key}`}>
                <div>{item ? itemText(item) : key}</div>
                <Icon name="close" onClick={() => toggleItem(item, key, true)} />
              </DraggableSelection>
            );
          })}
          <input
            ref={inputRef}
            autoComplete="off"
            hidden={disabled}
            onChange={(e) => {
              dispatchChange();
              handleInputChange(e);
            }}
            onFocus={() => {
              if (allowEmptyQuery) handleInputChange();
              setFocused(true);
            }}
            onPaste={async (e) => {
              if (!multi) return;
              const text = e.clipboardData.getData('text');
              if (!text || (!text.includes(',') && !text.includes('，'))) return;
              e.preventDefault();
              const ids = text.replace(/，/g, ',').split(',').filter((v) => v?.trim().length && !selectedKeys.includes(v));
              if (!ids.length) return;
              try {
                const fetched = await props.fetchItems(ids);
                for (const item of fetched) valueCache[itemKey(item)] = item;
                setSelectedKeys([...selectedKeys, ...fetched.map((val) => itemKey(val))]);
              } catch (err) {
                console.error('Failed to fetch items on paste', err);
              }
            }}
            placeholder={props.placeholder}
            onBlur={() => setFocused(false)}
            onKeyDown={handleInputKeyDown}
            defaultValue={multi ? '' : selectedKeys.join(',')}
          />
        </DndProvider>
      </div>
      {disabled && (
        <input
          disabled
          autoComplete="off"
          value={disabledHint}
        />
      )}
      {focused && itemList.length > 0 && (
        <ul ref={listRef} className="autocomplete-list" style={listStyle} onMouseDown={(e) => e.preventDefault()}>
          {itemList.map((item, idx) => {
            const inner = renderItem(item);
            if (!inner) return null;
            return <li
              key={itemKey(item)}
              onClick={() => toggleItem(item)}
              onMouseMove={() => setCurrentItem(idx)}
              data-selected={selectedKeys.includes(itemKey(item))}
              data-focus={idx === currentItem}
            >
              <div>{inner}</div>
              {selectedKeys.includes(itemKey(item)) && <Icon name="check" />}
            </li>;
          })}
        </ul>
      )}
    </div>
  );
}) as (<T>(props: AutoCompleteProps<T> & { ref: React.Ref<AutoCompleteHandle<T>> }) => React.ReactElement) & React.FC;

AutoComplete.displayName = 'AutoComplete';

export default AutoComplete;
