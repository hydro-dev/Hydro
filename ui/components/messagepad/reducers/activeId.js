import 'jquery.easing';

function scrollToViewport() {
  const BOUND_TOP = 60;
  const BOUND_BOTTOM = 20;
  const node = $('.messagepad')[0];
  if (node.offsetHeight + BOUND_TOP + BOUND_BOTTOM < window.innerHeight) {
    const rect = node.getBoundingClientRect();
    const rectBody = document.body.getBoundingClientRect();
    let targetScrollTop = null;
    if (rect.top < BOUND_TOP) {
      targetScrollTop = rect.top - rectBody.top - BOUND_TOP;
    } else if (rect.top + node.offsetHeight > window.innerHeight) {
      targetScrollTop = rect.top - rectBody.top + node.offsetHeight + BOUND_BOTTOM - window.innerHeight;
    }
    if (targetScrollTop !== null) {
      $('html, body').stop().animate({ scrollTop: targetScrollTop }, 200, 'easeOutCubic');
    }
  }
}

export default function reducer(state = null, action) {
  switch (action.type) {
  case 'DIALOGUES_SWITCH_TO': {
    scrollToViewport();
    return action.payload;
  }
  case 'DIALOGUES_POST_SEND_FULFILLED': {
    return action.payload.mdoc._id;
  }
  default:
    return state;
  }
}
