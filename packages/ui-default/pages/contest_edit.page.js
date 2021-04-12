import { NamedPage } from 'vj/misc/Page';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';

const page = new NamedPage(['contest_edit', 'contest_create'], () => {
  ProblemSelectAutoComplete.getOrConstruct($('[name="pids"]'), { multi: true });
});

export default page;
