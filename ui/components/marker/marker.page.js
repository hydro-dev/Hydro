import { AutoloadPage } from 'vj/misc/PageLoader';
import MarkerReactive from './MarkerReactive';

const markerPage = new AutoloadPage('markerPage', () => {
  MarkerReactive.initAll();
});

export default markerPage;
