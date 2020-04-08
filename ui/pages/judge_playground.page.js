import { NamedPage } from 'vj/misc/PageLoader';

import * as recordEnum from 'vj/constant/record';

const page = new NamedPage('judge_playground', async () => {
  const SockJs = await import('sockjs-client');

  const sock = new SockJs('/judge/consume-conn');

  sock.onopen = () => {
    const div = $('<div class="section visible">').appendTo('#messages');
    $('<div class="section__header"><h1 class="section__title">Connection opened.</h1></div>')
      .appendTo(div);
  };

  sock.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    const div = $('<div class="section visible">').appendTo('#messages');
    $('<div class="section__header"><h1 class="section__title">Record</h1></div>')
      .appendTo(div);
    const body = $('<div class="section__body">').text(message.data).appendTo(div);

    const send = (key, packet) => {
      const data = {
        ...packet,
        key,
        tag: msg.tag,
      };
      sock.send(JSON.stringify(data));
    };

    $('<button class="button rounded primary">').text('Compile')
      .on('click', () => {
        send('next', { status: 20 });
      })
      .appendTo(body);

    $('<button class="button rounded primary">').text('Point0')
      .on('click', () => {
        send('next', {
          case: {
            status: recordEnum.STATUS_WRONG_ANSWER,
            score: 0,
            time_ms: 1,
            memory_kb: 777,
            judge_text: 'from playground',
          },
          progress: 51.123,
        });
      })
      .appendTo(body);

    $('<button class="button rounded primary">').text('Point10')
      .on('click', () => {
        send('next', {
          case: {
            status: recordEnum.STATUS_ACCEPTED,
            score: 10,
            time_ms: 1,
            memory_kb: 233,
            judge_text: 'from playground',
          },
          progress: 90.0,
        });
      })
      .appendTo(body);

    $('<button class="button rounded primary">').text('Accept')
      .on('click', () => {
        send('end', {
          status: recordEnum.STATUS_ACCEPTED,
          score: 100,
          time_ms: 1,
          memory_kb: 1,
        });
        $('button', div).detach();
      })
      .appendTo(body);

    $('<button class="button rounded primary">').text('WA')
      .on('click', () => {
        send('end', {
          status: recordEnum.STATUS_WRONG_ANSWER,
          score: 88,
          time_ms: 88,
          memory_kb: 88,
        });
        $('button', div).detach();
      })
      .appendTo(body);

    $('<button class="button rounded primary">').text('TLE')
      .on('click', () => {
        send('end', {
          status: recordEnum.STATUS_TIME_LIMIT_EXCEEDED,
          score: 10,
          time_ms: 9999,
          memory_kb: 88,
        });
        $('button', div).detach();
      })
      .appendTo(body);
  };

  sock.onclose = (message) => {
    const div = $('<div class="section visible">').appendTo('#messages');
    $(`
    <div class="section__header">
      <h1 class="section__title">
        Connection closed,
        reason=${JSON.stringify(message.reason)}
      </h1>
    </div>
    `)
      .appendTo(div);
  };
});

export default page;
