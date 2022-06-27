import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { Popover } from '@blueprintjs/core';
import { AutoloadPage } from 'vj/misc/Page';

function DateTimePicker({ name, val }) {
  const [date, setDate] = React.useState(val);
  return (
    <Popover
      minimal
      onOpening={() => {
        $('.date-input-inner').val(date.split(' ')[0]);
        $('.time-input-inner').val(date.split(' ')[1]);
        $('.datetime-picker').trigger('vjContentNew');
      }}
    >
      <input className="textbox" name={name} value={date} placeholder="YYYY-mm-dd HH:MM" readOnly />
      <div className="section__body datetime-picker">
        <input
          className="date-input-inner textbox"
          data-pick-date
          onFocus={
            (e) => {
              setDate(`${e.target.value} ${date.split(' ')[1]}`);
            }
          }
          onChange={
            (e) => {
              setDate(`${date.split(' ')[0]} ${$(e.target).val()}`);
            }
          }
        />
        <input
          className="time-input-inner textbox"
          data-pick-time
          onFocus={
            (e) => {
              setDate(`${date.split(' ')[0]} ${e.target.value}`);
            }
          }
          onChange={
            (e) => {
              setDate(`${date.split(' ')[0]} ${$(e.target).val()}`);
            }
          }
        />
      </div>
    </Popover>
  );
}

const datetimePage = new AutoloadPage('datetimePage', async () => {
  if ($('[data-pick-datetime]').length) {
    $('[data-pick-datetime]').each((i, e) => {
      ReactDOM.createRoot(e.parentElement).render(
        <DateTimePicker
          name={e.parentElement.getAttribute('name').replace('form_item_', '')}
          val={$(e).val()}
        />);
      $(e).trigger('vjContentNew');
    });
  }
});

export default datetimePage;
