import { animated, easings, useSprings } from '@react-spring/web';
import useKey from 'react-use/lib/useKey';
import {
  addPage, NamedPage, React, ReactDOM, request,
} from '@hydrooj/ui-default';

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

type Verdict = 'RJ' | 'AC' | 'NA';

addPage(new NamedPage(['resolver'], () => {
  function processData({
    contest_name, solutions, users, problem_count, frozen_seconds,
  }) {
    $('title').text(contest_name);
    $('#title').text(contest_name);
    $('.footer').css('display', 'none');

    // const resolver = new Resolver(data.solutions, data.users, data.problem_count, data.frozen_seconds);
    // resolver.calcOperations();

    const teams = Object.keys(users).map((key) => ({
      id: key,
      rank: 0,
      score: 0,
      penalty: 0,
      ranked: !users[key].is_exclude,
      total: 0,
      problems: Array.from({ length: problem_count }, (v, i) => i + 1).map(() => ({
        old: 0,
        frozen: 0,
        pass: false,
      })),
    }));
    const allSubmissions: Array<{
      user_id: string, problem_index: string, verdict: Verdict, submitted_seconds: number
    }> = Object.values(solutions).sort((a: any, b: any) => a.submitted_seconds - b.submitted_seconds) as any;
    const allAc = allSubmissions.filter((i) => i.verdict === 'AC');
    for (const submission of allSubmissions) {
      const team = teams.find((v) => v.id === submission.user_id);
      if (!team) continue;
      const isFrozen = submission.submitted_seconds > frozen_seconds;
      const problem = team.problems[+submission.problem_index - 1];
      if (problem.pass) continue;
      team.total++;
      if (isFrozen) {
        problem.frozen += 1;
      } else {
        if (submission.verdict === 'AC') {
          problem.pass = true;
          team.score += 1;
          team.penalty += submission.submitted_seconds + problem.old * 20 * 60;
        }
        problem.old += 1;
      }
    }
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
    const initial = processRank();

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

    function MainList(props) {
      const [selectedTeam, setTeam] = React.useState('');
      const [selectedProblem, setP] = React.useState<number | null>(null);
      const [ready, setReady] = React.useState(true);
      const order = React.useRef(initial);

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

      useKey('ArrowRight', () => {
        console.log('click');
        if (!ready) return;
        for (let i = teams.length - 1; i > 0; i--) {
          const team = teams[order.current[i]];
          for (let j = 0; j < problem_count; j++) {
            const problem = team.problems[j];
            if (problem.frozen && !problem.pass) {
              setReady(false);
              setTeam(team);
              setP(j);
              // scroll to selected line
              console.log(i, team.id, order.current.indexOf(i));
              scrollTo(i * 103 - window.innerHeight + 261).then(() => {
                setTimeout(() => {
                  if (allAc.find((s) => s.user_id === team.id && +s.problem_index === j + 1)) {
                    const sub = allSubmissions.filter((s) => s.user_id === team.id && +s.problem_index === j + 1);
                    let penalty = 0;
                    for (const s of sub) {
                      if (s.verdict !== 'AC') {
                        penalty += 20 * 60;
                        problem.old++;
                      } else {
                        penalty += s.submitted_seconds;
                        break;
                      }
                    }
                    team.penalty += penalty;
                    team.score += 1;
                    problem.pass = true;
                    problem.frozen = 0;
                    setP(null);
                    setTimeout(() => {
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
                      setReady(true);
                    }, 1000);
                  } else {
                    problem.old += problem.frozen;
                    problem.frozen = 0;
                    setReady(true);
                    setP(null);
                  }
                }, 1000);
              });
              return;
            }
          }
        }
      }, {}, [ready]);

      return (<>
        {springs.map(({
          zIndex, y,
        }, i) => {
          const team = teams[i];
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
              <div className="content">
                <div className="name" style={{ color: 'white' }}>{users[team.id].college}--{users[team.id].name}</div>
                <ul className="problems">
                  {Array.from({ length: problem_count }, (v, i) => i).map((v, n) => {
                    const uncover = team?.id === selectedTeam && selectedProblem === n;
                    return <li className={`${status(team.problems[n])} prob-${n + 1} ${uncover ? 'uncover' : ''} item`}>
                      <div className={`${status(team.problems[n])} ${uncover ? 'uncover' : ''} p-content`}>{submissions(team.problems[n])}</div>
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
    ReactDOM.createRoot(document.getElementById('rank-list')!).render(<MainList />);
  }

  const current = new URL(window.location.href);

  async function loadAndStart(input: string) {
    let data;
    try {
      data = JSON.parse(input);
    } catch (e) {
      console.log(`load data from url. [url=${input}]`);
      const res = await request.get(input, {}, {
        dataType: 'text',
      });
      if (res.startsWith('@')) data = convertPayload(res, +(current.searchParams.get('lock') || 0));
      else data = JSON.parse(res);
    }
    processData(data);
  }

  const input = current.searchParams.get('input');
  if (input) loadAndStart(input);
  $('#load').on('click', () => {
    const src = $('#input-data').val()?.toString()?.trim();
    if (src) loadAndStart(src);
  });
}));
