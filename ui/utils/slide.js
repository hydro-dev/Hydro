import 'jquery.easing';

export async function slideDown($element, duration, fromCss = {}, toCss = {}) {
  const originalStyl = $element.attr('style') || '';
  $element.css({
    position: 'absolute',
    visibility: 'none',
    display: 'block',
  });
  const height = $element.outerHeight();
  $element.attr('style', originalStyl);
  $element.css({
    height: 0,
    overflow: 'hidden',
    display: 'block',
    ...fromCss,
  });
  $element.height();
  await $element
    .transition({
      height,
      ...toCss,
    }, {
      duration,
      easing: 'easeOutCubic',
    })
    .promise();
  $element.attr('style', originalStyl);
  $element.css({
    display: 'block',
  });
}

export async function slideUp($element, duration, fromCss = {}, toCss = {}) {
  const originalStyl = $element.attr('style') || '';
  const height = $element.outerHeight();
  $element.css({
    height,
    overflow: 'hidden',
    display: 'block',
    ...fromCss,
  });
  $element.height();
  await $element
    .transition({
      height: 0,
      ...toCss,
    }, {
      duration,
      easing: 'easeOutCubic',
    })
    .promise();
  $element.attr('style', originalStyl);
  $element.css({
    display: 'none',
  });
}
