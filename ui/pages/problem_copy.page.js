import { NamedPage } from 'vj/misc/PageLoader';
import DomainSelectAutoComplete from 'vj/components/autocomplete/DomainSelectAutoComplete';

const page = new NamedPage('problem_copy', async () => {
  DomainSelectAutoComplete.getOrConstruct($('.section__body [name="src_domain_id"]'));
});

export default page;
