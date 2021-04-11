import { AutoloadPage } from 'vj/misc/Page';
import UserSelectAutoComplete from './UserSelectAutoComplete';
import DomainSelectAutoComplete from './DomainSelectAutoComplete';
import ProblemSelectAutoComplete from './ProblemSelectAutoComplete';

const page = new AutoloadPage('autocomplete', () => {
    UserSelectAutoComplete.getOrConstruct($('[autocomplete="user"]'));
    DomainSelectAutoComplete.getOrConstruct($('[autocomplete="domain"]'));
    ProblemSelectAutoComplete.getOrConstruct($('[autocomplete="problem"]'));
});

export default page;
