import { defineSlot } from '../registry';

const Layout = defineSlot('app:layout', ({ children }: React.PropsWithChildren) => <>{children}</>);

export default Layout;
