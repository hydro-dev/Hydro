// @ts-nocheck
/* eslint-disable */
import Picker from 'pickadate/lib/picker';

const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const MINUTES_IN_DAY = HOURS_IN_DAY * MINUTES_IN_HOUR;
const { _ } = Picker;
export default class TimePicker {
  queue = {
    interval: 'i',
    min: 'measure create',
    max: 'measure create',
    now: 'now create',
    select: 'parse create',
    highlight: 'parse create',
    view: 'parse create',
  };

  item = {
    clear: null,
    interval: 15,
    disable: [],
    enable: 1,
  };

  key = {
    40: 1, // Down
    38: -1, // Up
    39: 1, // Right
    37: -1, // Left
    go(timeChange) {
      this.set(
        'highlight',
        this.item.highlight.pick + timeChange * this.item.interval,
        { interval: timeChange * this.item.interval },
      );
      this.render();
    },
  };

  constructor(picker, public settings) {
    const clock = this;
    const elementValue = picker.$node[0].value;
    const elementDataValue = picker.$node.data('value');
    const valueString = elementDataValue || elementValue;
    const formatString = elementDataValue ? settings.formatSubmit : settings.format;
    clock.$node = picker.$node;
    clock
      .set('min', settings.min)
      .set('max', settings.max)
      .set('select', valueString || '00:00', {
        format: formatString,
      });

    picker
      .on('render', () => {
        const $pickerHolder = picker.$root.children();
        const $viewset = $pickerHolder.find(`.${settings.klass.viewset}`);
        const vendors = function (prop) {
          return ['webkit', 'moz', 'ms', 'o', ''].map((vendor) => (vendor ? `-${vendor}-` : '') + prop);
        };
        const animations = function ($el, state) {
          vendors('transform').map((prop) => {
            $el.css(prop, state);
          });
          vendors('transition').map((prop) => {
            $el.css(prop, state);
          });
        };
        if ($viewset.length) {
          animations($pickerHolder, 'none');
          $pickerHolder[0].scrollTop = ~~$viewset.position().top - ($viewset[0].clientHeight * 2);
          animations($pickerHolder, '');
        }
      }, 1)
      .on('open', () => {
        picker.$root.find('button').attr('disabled', false);
      }, 1)
      .on('close', () => {
        picker.$root.find('button').attr('disabled', true);
      }, 1);
  }

  set(type, value?, options?) {
    const clock = this;
    const clockItem = clock.item;

    if (value === null) {
      if (type == 'clear') type = 'select';
      clockItem[type] = value;
      return clock;
    }

    // Otherwise go through the queue of methods, and invoke the functions.
    // Update this as the time unit, and set the final value as this item.
    // * In the case of `enable`, keep the queue but set `disable` instead.
    clockItem[type] = clock.queue[type].split(' ').map((method) => {
      value = clock[method](type, value, options);
      return value;
    }).pop();

    if (type == 'select') {
      clock.set('highlight', clockItem.select, options);
    } else if (type == 'highlight') {
      clock.set('view', clockItem.highlight, options);
    } else if (type == 'min') {
      clock.set('max', clockItem.max, options);
    }
    return clock;
  }

  get(type) {
    return this.item[type];
  }

  formats = {
    H(string, timeObject) {
      return string ? _.digits(string) : `${timeObject.hour % 24}`;
    },
    i(string, timeObject) {
      return string ? 2 : _.lead(timeObject.mins);
    },

    // Create an array by splitting the formatting string passed.
    toArray(formatString) { return formatString.split(/(h{1,2}|H{1,2}|i|a|A|!.)/g); },
    // Format an object into a string using the formatting options.
    toString(formatString, itemObject) {
      const clock = this;
      return clock.formats.toArray(formatString).map((label) => _.trigger(clock.formats[label], clock, [0, itemObject]) || label.replace(/^!/, '')).join('');
    },
  };

  create(type, value, options) {
    const clock = this;
    value = value === undefined ? type : value;
    if (_.isDate(value)) {
      value = [value.getHours(), value.getMinutes()];
    }
    if ($.isPlainObject(value) && _.isInteger(value.pick)) {
      value = value.pick;
    } else if ($.isArray(value)) {
      value = +value[0] * MINUTES_IN_HOUR + (+value[1]);
    }
    if (type == 'max' && value < clock.item.min.pick) {
      value += MINUTES_IN_DAY;
    }
    if (type != 'min' && type != 'max' && (value - clock.item.min.pick) % clock.item.interval !== 0) {
      value += clock.item.interval;
    }
    value = clock.normalize(type, value, options);
    return {
      hour: ~~(HOURS_IN_DAY + value / MINUTES_IN_HOUR) % HOURS_IN_DAY,
      mins: (MINUTES_IN_HOUR + value % MINUTES_IN_HOUR) % MINUTES_IN_HOUR,
      time: (MINUTES_IN_DAY + value) % MINUTES_IN_DAY,
      pick: value % MINUTES_IN_DAY,
    };
  }

  normalize(type, value/* , options */) {
    const { interval } = this.item;
    const minTime = this.item.min && this.item.min.pick || 0;
    value -= type == 'min' ? 0 : (value - minTime) % interval;
    return value;
  }

  measure(type, value, options) {
    const clock = this;
    if (!value) {
      value = type == 'min' ? [0, 0] : [HOURS_IN_DAY - 1, MINUTES_IN_HOUR - 1];
    }

    if (typeof value === 'string') {
      value = clock.parse(type, value);
    } else if ($.isPlainObject(value) && _.isInteger(value.pick)) {
      value = clock.normalize(type, value.pick, options);
    }

    return value;
  }

  scope = function (timeObject) {
    const minLimit = this.item.min.pick;
    const maxLimit = this.item.max.pick;
    return this.create(timeObject.pick > maxLimit ? maxLimit : timeObject.pick < minLimit ? minLimit : timeObject);
  }; // TimePicker.prototype.scope

  parse(type, value, options) {
    let hour; let minutes; let item; let parseValue;
    const clock = this;
    const parsingObject = {};
    if (!value || typeof value !== 'string') return value;

    if (!(options && options.format)) {
      options = options || {};
      options.format = clock.settings.format;
    }

    clock.formats.toArray(options.format).map((label) => {
      let substring;
      const formattingLabel = clock.formats[label];
      const formatLength = formattingLabel
        ? _.trigger(formattingLabel, clock, [value, parsingObject])
        : label.replace(/^!/, '').length;
      if (formattingLabel) {
        substring = value.substr(0, formatLength);
        parsingObject[label] = substring.match(/^\d+$/) ? +substring : substring;
      }
      value = value.substr(formatLength);
    });

    // Grab the hour and minutes from the parsing object.
    for (item in parsingObject) {
      parseValue = parsingObject[item];
      if (_.isInteger(parseValue)) {
        if (item.match(/^(h|hh)$/i)) hour = parseValue;
        else if (item == 'i') minutes = parseValue;
      }
    }

    // Calculate it in minutes and return.
    return hour * MINUTES_IN_HOUR + minutes;
  }

  nodes(isOpen) {
    const clock = this;
    const { settings } = clock;
    const selectedObject = clock.item.select;
    const highlightedObject = clock.item.highlight;
    const viewsetObject = clock.item.view;

    return _.node(
      'ul',
      _.group({
        min: clock.item.min.pick,
        max: clock.item.max.pick,
        i: clock.item.interval,
        node: 'li',
        item(loopedTime) {
          loopedTime = clock.create(loopedTime);
          const timeMinutes = loopedTime.pick;
          const isSelected = selectedObject && selectedObject.pick == timeMinutes;
          const isHighlighted = highlightedObject && highlightedObject.pick == timeMinutes;
          const formattedTime = _.trigger(clock.formats.toString, clock, [settings.format, loopedTime]);
          return [
            _.trigger(clock.formats.toString, clock, [_.trigger(settings.formatLabel, clock, [loopedTime]) || settings.format, loopedTime]),
            (function (klasses) {
              if (isSelected) klasses.push(settings.klass.selected);

              if (isHighlighted) klasses.push(settings.klass.highlighted);

              if (viewsetObject && viewsetObject.pick == timeMinutes) {
                klasses.push(settings.klass.viewset);
              }

              return klasses.join(' ');
            }([settings.klass.listItem])),
            `data-pick=${loopedTime.pick} ${_.ariaAttr({
              role: 'option',
              label: formattedTime,
              selected: isSelected && clock.$node.val() === formattedTime ? true : null,
              activedescendant: isHighlighted ? true : null,
              disabled: null,
            })}`,
          ];
        },
      })
      + _.node(
        'li',
        _.node(
          'button',
          settings.clear,
          settings.klass.buttonClear,
          `type=button data-clear=1${isOpen ? '' : ' disabled'} ${_.ariaAttr({ controls: clock.$node[0].id })}`,
        ),
        '',
        _.ariaAttr({ role: 'presentation' }),
      ),
      settings.klass.list,
      _.ariaAttr({ role: 'listbox', controls: clock.$node[0].id }),
    );
  }

  static defaults = (function (prefix) {
    return {
      clear: 'Clear',
      format: 'h:i A',
      interval: 30,
      closeOnSelect: true,
      closeOnClear: true,
      updateInput: true,
      klass: {
        picker: `${prefix} ${prefix}--time`,
        holder: `${prefix}__holder`,
        list: `${prefix}__list`,
        listItem: `${prefix}__list-item`,
        disabled: `${prefix}__list-item--disabled`,
        selected: `${prefix}__list-item--selected`,
        highlighted: `${prefix}__list-item--highlighted`,
        viewset: `${prefix}__list-item--viewset`,
        now: `${prefix}__list-item--now`,
        buttonClear: `${prefix}__button--clear`,
      },
    };
  }(Picker.klasses().picker));
}
