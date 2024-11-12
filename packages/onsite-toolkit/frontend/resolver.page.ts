import { addPage, NamedPage, request } from '@hydrooj/ui-default';
import { ResolverInput } from '../interface';
import { DisplaySettings, start } from './resolver';

function convertPayload(ghost: string, lock: number): ResolverInput {
  const lines = ghost.split('\n');

  const problemCount = +(lines[2].split(' ')[1]);
  const teamCount = +(lines[3].split(' ')[1]);
  const submissionCount = +(lines[4].split(' ')[1]);
  const data: ResolverInput = {
    name: lines[0].split('"')[1].split('"')[0],
    frozen: +lock || 1800,
    teams: [],
    submissions: [],
  };
  for (let i = 5 + problemCount; i < 5 + problemCount + teamCount; i++) {
    const team = lines[i].match(/@t (\d+),\d+,\d+,(.*)/);
    if (!team) continue;
    data.teams.push({
      id: team[2].split('-')[1],
      name: team[2].split('-')[1],
      institution: team[2].split('-')[0],
      exclude: false,
    });
  }
  for (let i = 5 + problemCount + teamCount; i < 5 + problemCount + teamCount + submissionCount; i++) {
    // @s 3,C,1,10066,AC
    const line = lines[i].split(' ')[1].split(',');
    data.submissions.push({
      team: line[0],
      problem: line[1],
      verdict: line[4] as 'AC' | 'RJ',
      time: +(line[3]),
    });
  }
  return data;
}

async function loadAndStart(input: string, lock = 0, options: DisplaySettings) {
  let data;
  try {
    if (input.startsWith('@')) data = convertPayload(input, lock);
    else data = JSON.parse(input);
  } catch (e) {
    console.log(`load data from url. [url=${input}]`);
    const res = await request.get(input, {}, {
      dataType: 'text',
    });
    if (res.startsWith('@')) data = convertPayload(res, lock);
    else data = JSON.parse(res);
  }
  start(data, options);
}

addPage(new NamedPage(['resolver'], () => {
  if (UiContext.payload) {
    start(UiContext.payload, {
      showAvatar: true,
      showSchool: true,
    });
    return;
  }
  const current = new URL(window.location.href);
  const input = current.searchParams.get('input');
  if (input) {
    loadAndStart(input, +(current.searchParams.get('lock') || 0), {
      showAvatar: true,
      showSchool: true,
    });
  }
  $('#load').on('click', () => {
    const src = $('#input-data').val()?.toString()?.trim();
    if (src) {
      loadAndStart(src, +($('[name="lock"]').val() || 0), {
        showAvatar: $('#show-avatar').prop('checked') || false,
        showSchool: $('#show-school').prop('checked') || false,
      });
    }
  });
}));
