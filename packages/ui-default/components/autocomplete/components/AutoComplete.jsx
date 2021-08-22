import React, { forwardRef, useState, useRef, useImperativeHandle, createRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { debounce } from 'lodash';

export const CloseIcon = (props) => {
    return (
        <svg {...props} className="autocomplete-icon" viewBox="0 0 24 24">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
        </svg>
    );
};

export const CheckIcon = (props) => {
    return (
        <svg {...props} className="autocomplete-icon" viewBox="0 0 24 24">
            <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path>
        </svg>
    );
};

const AutoComplete = forwardRef(function AutoComplete(props, ref) {
    const width = props.width ?? '100%';
    // if you need fix height, set to at least "30px"
    // for Hydro, no less then "34px" can be better
    const height = props.height ?? 'auto';
    const name = props.name ?? '';
    const listStyle = props.listStyle ?? {};
    const itemsFn = props.itemsFn ?? (async () => []);
    const renderItem = props.renderItem ?? (item => item);
    const itemText = props.itemText ?? (item => item);
    const itemKey = props.itemKey ?? itemText;
    const multi = props.multi ?? false;
    const rawDefaultItems = props.defaultItems ?? [];
    const defaultItems = typeof rawDefaultItems === 'string' ?
        props.defaultItems.split(',').map(i => i.trim()) : rawDefaultItems;
    const allowEmptyQuery = props.allowEmptyQuery ?? false;
    const freeSolo = props.freeSolo ?? false;
    const freeSoloConverter = freeSolo ? props.freeSoloConverter ?? (i => i) : (i => i);

    const [focused, setFocused] = useState(false); // is focused
    const [selected, setSelected] = useState(defaultItems); // selected items
    const [selectedKeys, setSelectedKeys] = useState(defaultItems.map(i => itemKey(i))); // keys of selected items
    const [itemList, setItemList] = useState([]); // items list
    const [currentItem, setCurrentItem] = useState(null); // index of current item (in item list)

    const inputRef = createRef();
    const listRef = createRef();

    const cache = useRef({});

    const queryList = async (query) => {
        if (!query && !allowEmptyQuery) {
            setItemList([]);
            setCurrentItem(null);
            return;
        }
        let items;
        if (cache.current[query]) {
            items = cache.current[query];
        } else {
            items = await itemsFn(query);
            cache.current[query] = items;
        }
        setItemList(items);
        setCurrentItem(null);
    }

    const handleInputChange = debounce(async e => {
        const { target } = e;
        const value = target.value;
        queryList(value);
    }, 500);

    const toggleItem = item => {
        if (multi) {
            const key = itemKey(item);
            const idx = selectedKeys.indexOf(key);
            if (idx !== -1) {
                setSelected(s => {
                    const newSelected = [...s];
                    newSelected.splice(idx, 1);
                    return newSelected;
                });
                setSelectedKeys(s => {
                    const newSelectedKeys = [...s];
                    newSelectedKeys.splice(idx, 1);
                    return newSelectedKeys;
                });
            } else {
                setSelected(s => [...s, item]);
                setSelectedKeys(s => [...s, key]);
            }
            inputRef.current.value = "";
            inputRef.current.focus();
        } else {
            inputRef.current.value = itemKey(item);
        }
        setItemList([]);
        setCurrentItem(null);
    };

    const handleInputKeyDown = e => {
        const { key, target } = e;
        console.log(e);
        if (key === 'Escape') {
            setItemList([]);
            setCurrentItem(null);
            return;
        } else if (key === 'Enter') {
            if (currentItem !== null) {
                toggleItem(itemList[currentItem]);
                return;
            }
            if (freeSolo) {
                toggleItem(freeSoloConverter(target.value));
            }
            return;
        } else if (key === 'Backspace') {
            if (target.value.length > 0) return;
            if (selected.length > 0) {
                setSelected(s => s.slice(0, -1));
                setSelectedKeys(s => s.slice(0, -1));
            }
            return;
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            if (itemList.length === 0) return;
            const idx = (currentItem ?? 0) - 1;
            const newIdx = idx < 0 ? itemList.length - 1 : idx;
            setCurrentItem(newIdx);
            listRef.current.children[newIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        } else if (key === 'ArrowDown') {
            e.preventDefault();
            if (itemList.length === 0) return;
            const idx = (currentItem ?? itemList.length - 1) + 1;
            const newIdx = idx >= itemList.length ? 0 : idx;
            setCurrentItem(newIdx);
            listRef.current.children[newIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
    };

    const inputValue = useMemo(() => {
        return multi ? selectedKeys.join(', ') : inputRef.current.value;
    }, [multi, selectedKeys, inputRef.current.value]);

    useImperativeHandle(ref, () => ({
        getSelectedItems: () => selected,
        getSelectedItemsAsString: () => selectedKeys.join(', '),
        setSelectedItems: items => {
            setSelected(items);
            setSelectedKeys(items.map(i => itemKey(i)));
        },
        getQuery: () => inputRef.current.value,
        setQuery: query => inputRef.current.value = query,
        triggerQuery: () => queryList(inputRef.current.value),
        closeList: () => {
            setItemList([]);
            setCurrentItem(null);
        },
        getValue: () => multi ? selectedKeys.join(', ') : inputRef.current.value,
        getValueArray: () => multi ? selected : [inputRef.current.value],
        getValueWithQuery: () => {
            const query = inputRef.current.value;
            if (!query) return multi ? selectedKeys.join(', ') : "";
            return multi ? selectedKeys.join(', ') + ', ' + query : query;
        },
        getValueArrayWithQuery: () => {
            const query = inputRef.current.value;
            if (!query) return multi ? selected : [""];
            return multi ? [...selected, query] : [query];
        },
        clear: () => {
            setSelected([]);
            setSelectedKeys([]);
            inputRef.current.value = "";
        },
        focus: () => {
            setFocused(true);
            inputRef.current.focus();
        },
    }));

    return (
        <div style={{ display: "inline-block" }}>
            <div
                className={focused ? "autocomplete-wrapper focused" : "autocomplete-wrapper"}
                style={{ width, height }}
            >
                {selected.map((item, idx) => (
                    <div className="autocomplete-tag" key={selectedKeys[idx]}>
                        <div>{itemText(item)}</div>
                        <CloseIcon onClick={() => toggleItem(item)} />
                    </div>
                ))}
                <input
                    ref={inputRef}
                    onChange={handleInputChange}
                    onFocus={() => {
                        setFocused(true);
                        if (allowEmptyQuery) {
                            handleInputChange();
                        }
                    }}
                    onBlur={() => setFocused(false)}
                    onKeyDown={handleInputKeyDown}
                />
            </div>
            <input type="hidden" name={name} value={inputValue} />
            {focused && itemList.length > 0 && (
                <ul ref={listRef} className="autocomplete-list" style={listStyle} onMouseDown={e => e.preventDefault()}>
                    {itemList.map((item, idx) => (
                        <li
                            key={itemKey(item)}
                            onClick={() => toggleItem(item)}
                            onMouseMove={() => setCurrentItem(idx)}
                            aria-selected={selectedKeys.includes(itemKey(item))}
                            data-focus={idx === currentItem}
                        >
                            <div>{renderItem(item)}</div>
                            <CheckIcon />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
});

AutoComplete.propTypes = {
    width: PropTypes.string,
    height: PropTypes.string,
    name: PropTypes.string,
    listStyle: PropTypes.object,
    itemsFn: PropTypes.func.isRequired,
    itemKey: PropTypes.func,
    renderItem: PropTypes.func,
    itemText: PropTypes.func,
    multi: PropTypes.bool,
    defaultItems: PropTypes.oneOfType([(PropTypes.arrayOf(PropTypes.any)), PropTypes.string]),
    allowEmptyQuery: PropTypes.bool,
    freeSolo: PropTypes.bool,
    freeSoloConverter: PropTypes.func,
};

AutoComplete.defaultProps = {
    width: '100%',
    height: 'auto',
    name: '',
    listStyle: {},
    renderItem: item => item,
    itemText: item => item,
    multi: false,
    defaultItems: [],
    allowEmptyQuery: false,
    freeSolo: false,
    freeSoloConverter: input => input,
};

AutoComplete.displayName = 'AutoComplete';

export default AutoComplete;
