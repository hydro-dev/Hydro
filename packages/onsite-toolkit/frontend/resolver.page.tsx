/* eslint-disable no-await-in-loop */
import { animated, easings, useSprings } from '@react-spring/web';
import useKey from 'react-use/lib/useKey';
import {
  addPage, NamedPage, React, ReactDOM, request, sleep,
} from '@hydrooj/ui-default';
import { ResolverInput } from '../interface';

function convertPayload(ghost: string, lock: number) {
  const lines = ghost.split('\n');
  const data = {
    contest_name: lines[0].split('"')[1].split('"')[0],
    problem_count: +(lines[2].split(' ')[1]),
    frozen_seconds: +lock || 1800,
    teams: +(lines[3].split(' ')[1]),
    submissions: +(lines[4].split(' ')[1]),
    users: {},
    solutions: {},
  };
  for (let i = 5 + data.problem_count; i < 5 + data.problem_count + data.teams; i++) {
    const team = lines[i].match(/@t (\d+),\d+,\d+,(.*)/);
    if (!team) continue;
    data.users[team[1]] = {
      name: team[2].split('-')[1],
      college: team[2].split('-')[0],
      is_exclude: false,
    };
  }
  for (let i = 5 + data.problem_count + data.teams; i < 5 + data.problem_count + data.teams + data.submissions; i++) {
    // @s 3,C,1,10066,AC
    const line = lines[i].split(' ')[1].split(',');
    data.solutions[i] = {
      user_id: line[0],
      problem_index: +(line[1].charCodeAt(0) - 'A'.charCodeAt(0)) + 1,
      verdict: line[4],
      submitted_seconds: +(line[3]),
    };
  }
  const s = Object.keys(data.solutions).map((key) => data.solutions[key]);
  s.sort((a, b) => a.submitted_seconds - b.submitted_seconds);
  data.solutions = {};
  s.forEach((solution, index) => {
    data.solutions[index] = solution;
  });
  return data;
}

async function scrollTo(offset) {
  const fixedOffset = offset.toFixed();
  await new Promise((resolve) => {
    const onScroll = function () {
      if (window.pageYOffset.toFixed() === fixedOffset) {
        window.removeEventListener('scroll', onScroll);
        resolve(null);
      }
    };

    window.addEventListener('scroll', onScroll);
    onScroll();
    window.scrollTo({
      top: offset,
      behavior: 'smooth',
    });
  });
}
interface DisplaySettings {
  showAvatar: boolean;
  showSchool: boolean;
}

interface Props extends DisplaySettings {
  data: ResolverInput;
}

function status(problem) {
  if (!problem) return 'untouched';
  if (problem.pass) return 'ac';
  if (!problem.old && !problem.frozen) return 'untouched';
  if (problem.frozen) return 'frozen';
  return 'failed';
}

function submissions(problem) {
  const st = status(problem);
  if (st === 'ac') { return `${problem.old}`; }
  if (st === 'frozen') { return `${problem.old}+${problem.frozen}`; }
  if (st === 'failed') { return problem.old; }
  return String.fromCharCode('A'.charCodeAt(0) + problem.problem_index);
}

function start(data: ResolverInput, options: DisplaySettings) {
  $('title').text(data.name);
  $('#title').text(data.name);
  $('.footer').css('display', 'none');
  const teams = data.teams.map((v) => ({
    id: v.id,
    rank: 0,
    score: 0,
    penalty: 0,
    ranked: !v.exclude,
    total: 0,
    problems: data.problems.map((v) => ({
      old: 0,
      frozen: 0,
      pass: false,
      id: v.id,
    })),
  }));
  const allSubmissions = data.submissions.sort((a, b) => a.time - b.time);
  const allAc = allSubmissions.filter((i) => i.verdict === 'AC');
  for (const submission of allSubmissions) {
    const team = teams.find((v) => v.id === submission.team);
    if (!team) continue;
    const isFrozen = submission.time > data.frozen;
    const problem = team.problems.find((i) => i.id === submission.problem);
    if (!problem || problem.pass) continue;
    team.total++;
    if (isFrozen) problem.frozen += 1;
    else {
      if (submission.verdict === 'AC') {
        problem.pass = true;
        team.score += 1;
        team.penalty += submission.time + problem.old * 20 * 60;
      }
      problem.old += 1;
    }
  }

  function MainList(props: Props) {
    const [selectedTeam, setTeam] = React.useState('');
    const [selectedProblem, setP] = React.useState<string | null>(null);
    const [ready, setReady] = React.useState(true);

    function processRank() {
      const clone = [...teams];
      clone.sort((a, b) => b.score - a.score || a.penalty - b.penalty || b.total - a.total);
      let rank = 1;
      for (const team of clone) {
        if (team.ranked) {
          team.rank = rank;
          rank++;
        } else {
          team.rank = -1;
        }
      }
      return clone.map((i) => teams.indexOf(i));
    }

    const order = React.useRef(processRank());

    const [springs, api] = useSprings(teams.length, (index) => ({
      y: order.current.indexOf(index) * 103 - index * 103,
      scale: 1,
      zIndex: 0,
      shadow: 1,
      immediate: (key: string) => key === 'y' || key === 'zIndex',
    }));

    React.useEffect(() => {
      window.scrollTo(0, document.body.scrollHeight);
    }, []);

    useKey('ArrowRight', async () => {
      console.log('click', ready);
      if (!ready) return;
      for (let i = teams.length - 1; i > 0; i--) {
        const team = teams[order.current[i]];
        for (const pinfo of data.problems) {
          const problem = team.problems.find((i) => i.id === pinfo.id);
          if (!problem || !problem.frozen || problem.pass) continue;
          setReady(false);
          setTeam(team.id);
          setP(pinfo.id);
          // scroll to selected line
          console.log(i, team.id, order.current.indexOf(i));

          await scrollTo(i * 103 - window.innerHeight + 261);
          await sleep(1000);
          if (allAc.find((s) => s.team === team.id && s.problem === pinfo.id)) {
            const sub = allSubmissions.filter((s) => s.team === team.id && s.problem === pinfo.id);
            let penalty = 0;
            for (const s of sub) {
              if (s.verdict !== 'AC') {
                penalty += 20 * 60;
                problem.old++;
              } else {
                penalty += s.time;
                break;
              }
            }
            team.penalty += penalty;
            team.score += 1;
            problem.pass = true;
            problem.frozen = 0;
            setP(null);
            await sleep(1000);
            order.current = processRank();
            api.start((index) => ({
              y: order.current.indexOf(index) * 103 - index * 103,
              scale: 1,
              zIndex: 0,
              shadow: 1,
              config: {
                easing: easings.steps(5),
              },
            }));
          } else {
            problem.old += problem.frozen;
            problem.frozen = 0;
            setP(null);
          }
          setReady(true);
          return;
        }
      }
    }, {}, [ready]);

    return (<>
      {springs.map(({
        zIndex, y,
      }, i) => {
        const team = teams[i];
        const teamInfo = data.teams.find((i) => i.id === team.id);
        if (!teamInfo) return <animated.dev key={i}>Team info for id {team.id} not found</animated.dev>;
        return <animated.div
          key={i}
          className="rank-list-item clearfix"
          style={{
            background: 'transparent',
            zIndex,
            // boxShadow: shadow.to((s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`),
            y,
            ...(selectedTeam === team.id ? {
              backgroundColor: '#406b82',
            } : {}),
          }}
          children={<>
            <div className="rank">{team.rank === -1 ? '*' : team.rank}</div>
            {props.showAvatar && <img className="avatar" style={{ height: 32 }} src={`${teamInfo?.avatar}`} />}
            <div className="content">
              <div className="name" style={{ color: 'white', fontSize: 24 }}>
                {props.showSchool ? `${teamInfo.institution}--` : ''}{teamInfo.name}
              </div>
              <ul className="problems">
                {data.problems.map((v) => {
                  const uncover = team?.id === selectedTeam && selectedProblem === v.id;
                  const problemStatus = team.problems.find((i) => i.id === v.id);
                  return <li className={`${status(problemStatus)} ${uncover ? 'uncover' : ''} item`}>
                    <div className={`${status(problemStatus)} ${uncover ? 'uncover' : ''} p-content`}>{submissions(problemStatus)}</div>
                  </li>;
                })}
              </ul>
            </div>
            <div className="penalty" style={{ color: 'white' }}>{Math.floor(team.penalty / 60)}</div>
            <div className="solved" style={{ color: 'white' }}>{team.score}</div>
          </>}
        />;
      })}
    </>);
  }
  ReactDOM.createRoot(document.getElementById('rank-list')!).render(<MainList {...options} data={data} />);
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
