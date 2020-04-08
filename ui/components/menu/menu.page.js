import { AutoloadPage } from 'vj/misc/PageLoader';
import { slideDown } from 'vj/utils/slide';
import delay from 'vj/utils/delay';

function expandMenu($menu) {
  slideDown($menu, 500, { opacity: 0 }, { opacity: 1 });
}

async function expandAllMenus() {
  await delay(200);
  $('.menu.collapsed').get().forEach(menu => expandMenu($(menu)));
}

const menuPage = new AutoloadPage('menuPage', () => {
  expandAllMenus();
});

export default menuPage;
