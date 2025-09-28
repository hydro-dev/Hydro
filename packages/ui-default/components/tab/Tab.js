import $ from 'jquery';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';

const TAB_TRANSITION_DURATION = 300;

export default class Tab extends DOMAttachedObject {
  static DOMAttachKey = 'vjTabInstance';

  static initAll() {
    $('.section__tabs').get().forEach((tab) => {
      Tab.getOrConstruct($(tab));
    });
  }

  static initEventListeners() {
    $(document).on('click', '[data-tab-index]', (ev) => {
      const targetIndex = $(ev.currentTarget).attr('data-tab-index');
      const $container = $(ev.currentTarget).closest('.section__tab-container');
      const tabInstance = Tab.get($container);
      tabInstance.switchToTab(+targetIndex);
    });
  }

  constructor($dom) {
    super($dom);
    this.attached = false;
    this.hasMemo = false;
    this.attach();
  }

  async switchToTab(idx) {
    if (idx === this.currentIndex) return;
    if (this.isAnimating) return;

    const $tabs = this.$content.children();
    const $currentTab = $tabs.eq(this.currentIndex);
    const $newTab = $tabs.eq(idx);

    // 0. Change header
    this.$header
      .children()
      .removeClass('selected')
      .eq(idx)
      .addClass('selected');

    // 1. Prepare for animating
    this.isAnimating = true;
    $newTab.addClass('active');
    const animateParameter = {};
    if (idx < this.currentIndex) {
      animateParameter.from = '-100%';
      animateParameter.to = '0%';
    } else {
      animateParameter.from = '0%';
      animateParameter.to = '-100%';
    }
    $newTab
      .css('opacity', 0);
    this.$content
      .css('x', animateParameter.from)
      .width();

    // 2. Animate transition
    $currentTab
      .transition(
        { opacity: 0 },
        {
          duration: TAB_TRANSITION_DURATION,
          easing: 'linear',
        },
      );
    $newTab
      .transition(
        { opacity: 1 },
        {
          duration: TAB_TRANSITION_DURATION,
          easing: 'linear',
        },
      );
    await this.$content
      .transition({
        x: animateParameter.to,
      }, {
        duration: TAB_TRANSITION_DURATION,
        easing: 'easeOutCubic',
      })
      .promise();

    // 3. Hide previous content
    this.$content
      .children()
      .eq(this.currentIndex)
      .removeClass('active');
    this.$content
      .css('x', '0');
    $newTab.trigger('vjContentShow');

    // 4. Finalize
    this.currentIndex = idx;
    if (this.hasMemo) location.hash = `#tab-${idx}`;
    this.isAnimating = false;
  }

  attach() {
    if (this.attached) return false;

    const $container = this.$dom
      .closest('.section__tab-container');
    const $headerWrapper = $(document.createElement('div'))
      .addClass('section__tab-header-wrapper')
      .appendTo($container);
    const $contentWrapper = $(document.createElement('div'))
      .appendTo($container);
    this.$header = $(document.createElement('ul'))
      .addClass('section__tab-header')
      .attr('data-slideout-ignore', 'on')
      .appendTo($headerWrapper);
    this.$content = $(document.createElement('div'))
      .addClass('section__tab-content')
      .appendTo($contentWrapper);

    this.$dom.find('.section__tab-title').get().forEach((element, idx) => {
      $(document.createElement('li')).text($(element).text())
        .addClass('section__tab-header-item')
        .attr('data-tab-index', idx)
        .appendTo(this.$header);
    });

    this.$dom.find('.section__tab-main')
      .appendTo(this.$content);

    this.$dom.remove();
    this.$dom = $container;

    this.currentIndex = 0;
    this.hasMemo = this.$dom.hasClass('memo');
    if (this.hasMemo) {
      const getIdx = () => {
        const hash = location.hash.substring(1);
        const match = /^tab-(\d+)$/.exec(hash);
        if (match) {
          const idx = +match[1];
          if (!Number.isNaN(idx) && idx < this.$header.children().length) {
            return idx;
          }
        }
        return null;
      };
      const handleIdChange = () => {
        const idx = getIdx();
        if (typeof idx === 'number') this.switchToTab(idx);
      };
      $(window).on('hashchange', handleIdChange);
      handleIdChange();
    } else this.currentIndex = 0;

    this.$content
      .children()
      .eq(this.currentIndex)
      .addClass('active');
    this.$header
      .children()
      .eq(this.currentIndex)
      .addClass('selected');

    return true;
  }
}
