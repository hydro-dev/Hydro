import { AutoloadPage } from 'vj/misc/PageLoader';
import Tooltip from './Tooltip';

function getClosestTooltipElement(element) {
  const MAX_DEPTH = 3;
  for (let i = 0, e = element; i < MAX_DEPTH && e !== null && e !== document; e = e.parentNode, i++) {
    if (e.getAttribute('data-tooltip')) {
      return e;
    }
  }
  return null;
}

const tooltipPage = new AutoloadPage('tooltipPage', () => {
  $(document).on('mouseover', (e) => {
    const element = getClosestTooltipElement(e.target);
    if (!element) {
      return;
    }
    const $element = $(element);
    const options = {};
    if ($element.attr('data-tooltip-pos')) {
      options.position = $element.attr('data-tooltip-pos');
    }
    const tooltip = Tooltip.getOrConstruct($element, options);
    tooltip.open();
  });
});

export default tooltipPage;
