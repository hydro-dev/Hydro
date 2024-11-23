/* eslint-disable no-await-in-loop */
import { animated, easings, useSprings } from '@react-spring/web';
import useKey from 'react-use/lib/useKey';
import {
  addPage, NamedPage, React, ReactDOM,
} from '@hydrooj/ui-default';
import { ResolverInput } from '../interface';

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
export interface DisplaySettings {
  showAvatar: boolean;
  showSchool: boolean;
}

interface Props extends DisplaySettings {
  data: ResolverInput;
}

interface ProblemStatus {
  old: number;
  frozen: number;
  pass: boolean;
  time: number;
  index: number;
  id?: string;
}

function status(problem: ProblemStatus) {
  if (!problem) return 'untouched';
  if (problem.pass) return 'ac';
  if (!problem.old && !problem.frozen) return 'untouched';
  if (problem.frozen) return 'frozen';
  return 'failed';
}

function submissions(problem: ProblemStatus) {
  const st = status(problem);
  if (st === 'ac') { return `${problem.old} / ${problem.time}`; }
  if (st === 'frozen') { return `${problem.old}+${problem.frozen}`; }
  if (st === 'failed') { return problem.old; }
  return String.fromCharCode('A'.charCodeAt(0) + problem.index);
}

export function start(data: ResolverInput, options: DisplaySettings) {
  $('title').text(`${data.name} - Resolver`);
  $('.header .title').text(`${data.name}`);
  const teams = data.teams.map((v) => ({
    id: v.id,
    rank: 0,
    score: 0,
    penalty: 0,
    ranked: !v.exclude,
    total: 0,
    problems: data.problems.map((problem, idx) => ({
      old: 0,
      frozen: 0,
      pass: false,
      id: problem.id,
      index: idx,
      time: 0,
    })),
  }));
  const allSubmissions = data.submissions.filter((i) => !['CE', 'SE', 'FE', 'IGN'].includes(i.verdict)).sort((a, b) => a.time - b.time);
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
        problem.time = Math.floor(submission.time / 60);
        team.score += 1;
        team.penalty += Math.floor(submission.time / 60) + problem.old * 20;
      }
      problem.old += 1;
    }
  }

  function MainList(props: Props) {
    const [selectedTeam, setTeam] = React.useState('');
    const [selectedProblem, setP] = React.useState<string | null>(null);
    const [executeIdx, setExecuteIdx] = React.useState(0);
    const [, setRenderC] = React.useState(0);

    function processRank(source = teams) {
      const clone = [...source];
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
      return clone.map((i) => source.indexOf(i));
    }

    const order = React.useRef(processRank());

    const [springs, api] = useSprings(teams.length, (index) => ({
      y: order.current.indexOf(index) * 80 - index * 80,
      scale: 1,
      zIndex: 0,
      shadow: 1,
      immediate: (key: string) => key === 'y' || key === 'zIndex',
    }));

    const operations = {
      async highlightTeam(teamId: string, scrollIdx: number) {
        setP(null);
        setTeam(teamId);
        await scrollTo(scrollIdx * 80 - window.innerHeight + 241 + 40);
      },
      async highlightProblem(problemId: string) {
        setP(problemId);
      },
      async revealProblem(teamId: string, problemId: string) {
        const team = teams.find((i) => i.id === teamId);
        const problem = team?.problems.find((i) => i.id === problemId);
        if (!team || !problem) return;
        if (allAc.find((s) => s.team === teamId && s.problem === problemId)) {
          const sub = allSubmissions.filter((s) => s.team === teamId && s.problem === problemId);
          let penalty = 0;
          for (const s of sub) {
            problem.old++;
            if (s.verdict !== 'AC') {
              penalty += 20;
            } else {
              problem.time = Math.floor(s.time / 60);
              penalty += Math.floor(s.time / 60);
              break;
            }
          }
          team.penalty += penalty;
          team.score += 1;
          problem.pass = true;
          problem.frozen = 0;
        } else {
          problem.old += problem.frozen;
          problem.frozen = 0;
        }
        setP(null);
      },
      async updateRank() {
        order.current = processRank();
        api.start((index) => ({
          y: order.current.indexOf(index) * 80 - index * 80,
          scale: 1,
          zIndex: 0,
          shadow: 1,
          config: {
            easing: easings.steps(5),
          },
        }));
      },
    };

    const calculated = React.useMemo(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const clone = JSON.parse(JSON.stringify(teams));
      const ops: { name: string, args: any[] }[] = [];
      function queueOperations(name: string, ...args: any[]) {
        ops.push({ name, args });
      }
      let orders = processRank(clone);
      for (let i = clone.length - 1; i >= 0; i--) {
        const team = clone[orders[i]];
        queueOperations('highlightTeam', team.id, i);
        for (const pinfo of data.problems) {
          const problem: ProblemStatus = team.problems.find((idx) => idx.id === pinfo.id);
          if (!problem || !problem.frozen || problem.pass) continue;
          queueOperations('highlightProblem', pinfo.id);
          queueOperations('revealProblem', team.id, pinfo.id);
          // scroll to selected line
          if (allAc.find((s) => s.team === team.id && s.problem === problem.id)) {
            const sub = allSubmissions.filter((s) => s.team === team.id && s.problem === problem.id);
            let penalty = 0;
            for (const s of sub) {
              problem.old++;
              if (s.verdict !== 'AC') {
                penalty += 20;
              } else {
                problem.time = Math.floor(s.time / 60);
                penalty += Math.floor(s.time / 60);
                break;
              }
            }
            team.penalty += penalty;
            team.score += 1;
            problem.pass = true;
            problem.frozen = 0;
            queueOperations('updateRank');
            const oldOrder = JSON.stringify(orders);
            orders = processRank(clone);
            if (oldOrder !== JSON.stringify(orders)) {
              i++;
              break;
            }
          } else {
            problem.old += problem.frozen;
            problem.frozen = 0;
          }
        }
      }
      console.log(ops.length, 'operations');
      return ops;
    }, [data]);

    useKey((key) => ['n', 'ArrowRight'].includes(key.key), async () => {
      const op = calculated[executeIdx];
      if (!op) return;
      setExecuteIdx(executeIdx + 1);
      await operations[op.name](...op.args);
      setRenderC((i) => i + 1);
    }, {}, [executeIdx, calculated]);

    return (<>
      {springs.map(({
        zIndex, y,
      }, i) => {
        const team = teams[i];
        const teamInfo = data.teams.find((idx) => idx.id === team.id);
        if (!teams[i]) return <animated.div key={i}>Team {i} not found</animated.div>;
        if (!teamInfo) return <animated.div key={i}>Team info for id {team.id} not found</animated.div>;
        return <animated.div
          key={i}
          className="rank-list-item clearfix"
          style={{
            zIndex,
            // boxShadow: shadow.to((s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`),
            y,
            ...(selectedTeam === team.id ? {
              backgroundColor: '#406b82',
            } : {
              background: 'transparent',
            }),
          }}
          children={<>
            <div className="rank">{team.rank === -1 ? '*' : team.rank}</div>
            {props.showAvatar && <img className="avatar" src={`${teamInfo?.avatar}`} />}
            <div className="content">
              <div className="name">
                {props.showSchool ? `${teamInfo.institution} - ` : ''}{teamInfo.name}
              </div>
              <div className="problems">
                {data.problems.map((v) => {
                  const uncover = team.id === selectedTeam && selectedProblem === v.id;
                  const problemStatus = team.problems.find((idx) => idx.id === v.id);
                  if (!problemStatus) return <span key={v.id} className="item">ERR</span>;
                  return <span key={v.id} className={`${status(problemStatus)} ${uncover ? 'uncover' : ''} item`}>
                    {submissions(problemStatus)}
                  </span>;
                })}
              </div>
            </div>
            <div className="solved">{team.score}</div>
            <div className="penalty">{team.penalty}</div>
          </>}
        />;
      })}
    </>);
  }
  ReactDOM.createRoot(document.getElementById('rank-list')!).render(<MainList {...options} data={data} />);
}

addPage(new NamedPage(['resolver'], () => {
  start(UiContext.payload, {
    showAvatar: true,
    showSchool: true,
  });
}));
