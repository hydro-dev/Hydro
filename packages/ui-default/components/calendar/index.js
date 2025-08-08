/* eslint-disable no-lone-blocks */
import $ from 'jquery';
import _ from 'lodash';
import moment from 'moment';
import { tpl } from 'vj/utils';

export default class Calendar {
  constructor(events) {
    this.$dom = $(tpl`
      <div class="calendar">
        <div class="calendar__header">
          <button name="prev"><span class="icon icon-chevron_left"></span></button>
          <h1 class="calendar__header__title"></h1>
          <button name="next"><span class="icon icon-chevron_right"></span></button>
        </div>
        <div class="calendar__week-title">
          <table>
            <thead><tr>
              <th>SUN</th>
              <th>MON</th>
              <th>TUE</th>
              <th>WED</th>
              <th>THU</th>
              <th>FRI</th>
              <th>SAT</th>
            </tr></thead>
          </table>
        </div>
        <div class="calendar__body-container"></div>
      </div>
    `);
    this.events = events.map((ev) => ({
      ...ev,
      beginAt: moment(ev.beginAt),
      endAt: moment(ev.endAt),
      maskFrom: ev.maskFrom ? moment(ev.maskFrom) : null,
    }));
    this.$dom.find('[name="prev"]').click(() => this.navToPrev());
    this.$dom.find('[name="next"]').click(() => this.navToNext());
    this.$lastBody = null;
    this.navToToday();
  }

  getDom() {
    return this.$dom;
  }

  navToToday() {
    if (this.animating) {
      return;
    }
    this.current = moment().date(1);
    this.update();
  }

  navToNext() {
    if (this.animating) {
      return;
    }
    this.current.add('months', 1);
    this.update(1);
  }

  navToPrev() {
    if (this.animating) {
      return;
    }
    this.current.subtract('months', 1);
    this.update(-1);
  }

  update(direction = 0) {
    this.updateHeader();
    this.updateBody(direction);
  }

  updateHeader() {
    this.$dom.find('.calendar__header__title').text(this.current.format('MMMM YYYY'));
  }

  async updateBody(direction) {
    this.animating = true;
    const $newBody = this.buildBody();
    $newBody.appendTo(this.$dom.find('.calendar__body-container'));
    if (this.$lastBody !== null) {
      this.$lastBody
        .addClass('exit')
        .transition({
          y: direction * 100,
          opacity: 0,
        }, {
          duration: 500,
          easing: 'easeOutCubic',
        });
      await $newBody
        .css({
          y: -direction * 100,
          opacity: 0,
        })
        .transition({
          y: 0,
          opacity: 1,
        }, {
          duration: 500,
          easing: 'easeOutCubic',
        })
        .promise();
      this.$lastBody.remove();
    }
    this.$lastBody = $newBody;
    this.animating = false;
  }

  buildBody() {
    const data = this.buildBodyData();
    const $body = $('<div class="calendar__body"></div>');
    data.forEach((week) => {
      const $row = $(tpl`<div class="calendar__row">
        <div class="calendar__row__bg"><table><tbody><tr></tr></tbody></table></div>
        <div class="calendar__row__content"><table><thead><tr></tr></thead><tbody></tbody></table></div>
      </div>`);
      const $bgContainer = $row.find('.calendar__row__bg tr');
      const $numContainer = $row.find('.calendar__row__content thead tr');
      const $bannerContainer = $row.find('.calendar__row__content tbody');
      week.days.forEach((day) => {
        const isInactive = day.active ? '' : 'is-inactive';
        const isCurrentDay = day.current ? 'is-current-day' : '';
        const today = day.current ? ' (TODAY)' : '';
        $bgContainer.append($('<td></td>').addClass(isInactive).addClass(isCurrentDay));
        $numContainer.append($(tpl`<th>${day.date.format('D')}${today}</th>`).addClass(isInactive).addClass(isCurrentDay));
      });
      week.banners.forEach((banners) => {
        const $tr = $('<tr/>');
        banners.forEach((bannerSpan) => {
          if (!bannerSpan.banner) {
            $tr.append(tpl`<td colspan="${bannerSpan.span}"></td>`);
            return;
          }
          const $cell = $(tpl`<td colspan="${bannerSpan.span}"></td>`);
          const $banner = $(tpl`
            <a
              href="${bannerSpan.banner.event.link}"
              class="calendar__banner color-${bannerSpan.banner.event.colorIndex}"
            >${bannerSpan.banner.mask ? bannerSpan.banner.event.maskTitle : bannerSpan.banner.event.title}</a>
          `);
          if (bannerSpan.banner.mask) {
            $banner.addClass('is-masked');
          }
          if (bannerSpan.banner.beginTrunc) {
            $banner.addClass('is-trunc-begin');
          } else if (bannerSpan.banner.beginSnap) {
            $banner.addClass('is-snap-begin');
          }
          if (bannerSpan.banner.endTrunc) {
            $banner.addClass('is-trunc-end');
          } else if (bannerSpan.banner.endSnap) {
            $banner.addClass('is-snap-end');
          }
          $cell.append($banner);
          $tr.append($cell);
        });
        $bannerContainer.append($tr);
      });
      $body.append($row);
    });
    return $body;
  }

  buildBodyData() {
    const days = [];
    {
      // back fill
      const base = this.current.clone();
      const dayOfWeek = base.day();
      if (dayOfWeek > 0) {
        base.subtract(dayOfWeek + 1, 'days');
        for (let i = dayOfWeek; i > 0; --i) {
          days.push({
            active: false,
            date: base.add(1, 'days').clone(),
          });
        }
      }
    }
    {
      // current month
      const base = this.current.clone();
      while (base.month() === this.current.month()) {
        days.push({
          active: true,
          date: base.clone(),
        });
        base.add(1, 'days');
      }
    }
    {
      // forward fill
      const base = this.current.clone().add(1, 'months').subtract(1, 'days');
      const dayOfWeek = base.day();
      if (dayOfWeek < 6) {
        for (let i = dayOfWeek; i < 6; ++i) {
          days.push({
            active: false,
            date: base.add(1, 'days').clone(),
          });
        }
      }
    }

    const now = moment();
    days.forEach((day) => {
      day.current = day.date.isSame(now, 'day');
    });

    const daysByWeek = _.chunk(days, 7);

    const numberOfWeeks = days.length / 7;
    const bannersByWeek = _.fill(Array.from({ length: numberOfWeeks }), 1).map(() => []);
    const beginDate = days[0].date.clone();
    const endDate = _.last(days).date.clone();

    // cut events by week to banners
    this.events.forEach((ev) => {
      if (ev.endAt.isBefore(ev.beginAt, 'day')) {
        return;
      }
      if (ev.endAt.isBefore(beginDate, 'day') || ev.beginAt.isAfter(endDate, 'day')) {
        return;
      }
      if (ev.beginAt.hour() >= 22) {
        ev.beginAt.add(1, 'day').startOf('day');
      }
      if (ev.endAt.hour() <= 2) {
        ev.endAt.subtract(1, 'day').endOf('day');
      }
      let [bannerBegin, bannerBeginTruncated] = [ev.beginAt.clone(), false];
      if (bannerBegin.isBefore(beginDate, 'day')) {
        [bannerBegin, bannerBeginTruncated] = [beginDate.clone(), true];
      }
      do {
        const bannerEndMax = bannerBegin.clone().endOf('week');
        let [bannerEnd, bannerEndTruncated] = [ev.endAt.clone(), false];
        if (bannerEnd.isAfter(bannerEndMax, 'day')) {
          [bannerEnd, bannerEndTruncated] = [bannerEndMax, true];
        }
        const weekIndex = bannerBegin.clone().startOf('day').diff(beginDate.clone().startOf('day'), 'week');
        bannersByWeek[weekIndex].push({
          beginAt: bannerBegin.startOf('day'),
          beginTrunc: bannerBeginTruncated,
          endAt: bannerEnd.endOf('day'),
          endTrunc: bannerEndTruncated,
          event: ev,
        });
        if (!bannerEndTruncated) {
          break;
        }
        [bannerBegin, bannerBeginTruncated] = [bannerEnd.clone().add(1, 'day'), true];
      } while (!bannerBegin.isAfter(endDate, 'day'));
    });

    // layout banners
    const layout = bannersByWeek
      .map((banners) => _
        .sortBy(banners, [
          (banner) => banner.beginAt.valueOf(),
          (banner) => (banner.beginTrunc ? 0 : 1), // truncated events first
          (banner) => -banner.endAt.valueOf(), // long events first
        ]))
      .map((banners) => {
        const dayBitmap = _
          .fill(Array.from({ length: 7 }), 1)
          .map(() => []);
        banners.forEach((banner) => {
          const beginDay = banner.beginAt.day();
          const endDay = banner.endAt.day();
          // find available space
          const vIndexMax = _.max(_
            .range(beginDay, endDay + 1)
            .map((day) => dayBitmap[day].length));
          let vIndex = 0;
          for (; vIndex < vIndexMax; ++vIndex) {
            if (_.every(_
              .range(beginDay, endDay + 1)
              .map((day) => !dayBitmap[day][vIndex]), // eslint-disable-line
            )) break;
          }
          // fill space
          for (let i = beginDay; i <= endDay; ++i) {
            dayBitmap[i][vIndex] = banner;
          }
        });
        // merge adjacent cells and arrange banners by vertical index
        const vMaxLength = _.max(_.range(0, 7).map((day) => dayBitmap[day].length));
        const weekBanners = _
          .fill(Array.from({ length: vMaxLength }), 1)
          .map(() => []);
        for (let vIndex = 0; vIndex < vMaxLength; ++vIndex) {
          let last = { span: 1, banner: dayBitmap[0][vIndex] };
          weekBanners[vIndex].push(last);
          for (let day = 1; day < 7; ++day) {
            const banner = dayBitmap[day][vIndex];
            if (banner !== last.banner) {
              last = { span: 1, banner };
              weekBanners[vIndex].push(last);
            } else {
              last.span++;
            }
          }
        }
        // cut banners by masked areas, scanning from left to right
        weekBanners.forEach((bannerSpans) => {
          for (let i = 0; i < bannerSpans.length; ++i) {
            const { banner } = bannerSpans[i];
            if (!banner) {
              continue;
            }
            if (banner.mask) {
              continue;
            }
            if (!banner.event.maskFrom) {
              continue;
            }
            if (banner.event.maskFrom.isSame(banner.event.endAt)) {
              // do not show masks if maskFrom === endAt
              continue;
            }
            if (banner.event.endAt.isSame(banner.event.beginAt, 'day')) {
              // do not show masks if endAt - beginAt <= 1 day
              continue;
            }
            if (banner.event.maskFrom.isAfter(banner.endAt, 'day')) {
              // we are not in the time region for masking
              continue;
            }
            if (banner.event.maskFrom.isSameOrBefore(banner.beginAt, 'day')) {
              // mask begins before this banner: replace current banner with masked banner
              banner.mask = true;
            } else {
              // mask begins during this banner: cut current banner into two pieces
              const newBanner = {
                ...banner,
                beginAt: banner.event.maskFrom.clone(),
                beginSnap: true,
                beginTrunc: false,
                mask: true,
              };
              const newBannerSpan = {
                span: newBanner.endAt.day() - newBanner.beginAt.day() + 1,
                banner: newBanner,
              };
              banner.endAt = banner.event.maskFrom.clone().subtract(1, 'day');
              banner.endSnap = true;
              bannerSpans[i].span -= newBannerSpan.span;
              bannerSpans.splice(i + 1, 0, newBannerSpan);
              i++;
            }
          }
        });
        return weekBanners;
      });
    return daysByWeek
      .map((daysInWeek, weekIndex) => ({
        days: daysInWeek,
        banners: layout[weekIndex],
      }));
  }
}
