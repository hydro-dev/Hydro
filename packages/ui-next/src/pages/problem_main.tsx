import { Link } from '../components/link';

export default function ProblemMain() {
  return (
    <div>
      <div>problem_main</div>
      <Link to="homepage">homepage</Link>
      <Link to="problem_detail" params={{ pid: '2' }}>p2</Link>
    </div>
  );
}
