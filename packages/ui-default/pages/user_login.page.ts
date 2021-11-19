import { AutoloadPage } from 'vj/misc/Page';
import api, { gql } from 'vj/utils/api';

export default new AutoloadPage('user_login', (pagename) => {
  (pagename === 'user_login' ? $(document) : $('.dialog--signin__main')).on('blur', '[name="uname"]', async () => {
    const uname = $('[name="uname"]').val() as string;
    if (uname.length > 0) {
      const tfa = await api(gql`
        user(uname:${uname}){
          tfa
        }
      `, ['data', 'user', 'tfa']);
      if (tfa) $('#tfa_div').show();
      else $('#tfa_div').hide();
    }
  });
});
