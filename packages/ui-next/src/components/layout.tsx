import { defineSlot } from '../registry';

const Layout = defineSlot('layout:default', ({ children }: React.PropsWithChildren) => {
  console.log('[ui-next] using default layout');
  return <>{children}</>;
});

export default Layout;
