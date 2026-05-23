import { Link } from '../components/link';

export default function Homepage() {
  return (
    <div>
      <div>homepage</div>
      <Link to="problem_main">problem_main</Link>
    </div>
  );
}

export function Layout({ children }: React.PropsWithChildren) {
  return (
    <div>
      {children}
      <div>layout test</div>
    </div>
  );
}
