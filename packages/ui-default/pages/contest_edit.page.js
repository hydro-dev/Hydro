import { NamedPage } from 'vj/misc/Page';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';

const page = new NamedPage(['contest_edit', 'contest_create'], () => {
  console.log($('[name="pids"]'));
  ProblemSelectAutoComplete.getOrConstruct($('[name="pids"]'));
});

export default page;
