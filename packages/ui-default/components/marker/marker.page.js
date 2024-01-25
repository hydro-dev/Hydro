import { AutoloadPage } from 'vj/misc/Page';
import MarkerReactive from './MarkerReactive';

const markerPage = new AutoloadPage('markerPage', () => {
  MarkerReactive.initAll();
});

export default markerPage;
