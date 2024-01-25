import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import { delay, slideDown } from 'vj/utils';

function expandMenu($menu) {
  slideDown($menu, 500, { opacity: 0 }, { opacity: 1 });
}

async function expandAllMenus() {
  await delay(200);
  $('.menu.collapsed').get().forEach((menu) => expandMenu($(menu)));
}

const menuPage = new AutoloadPage('menuPage', () => {
  expandAllMenus();
});

export default menuPage;
