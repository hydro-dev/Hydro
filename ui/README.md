# Vijos UI Framework

## Responsive Cutoffs

Vijos use the following cutoffs to determine the size of a device.

Small: `[0 - 450px)` (mobile)

Medium: `[450px, 1000px)` (tablet)

Large: `[1000px, -)` (desktop)

## Layout

### Grid

See [Foundation Grid](http://foundation.zurb.com/sites/docs/grid.html)

### Float

See [Foundation Float](http://foundation.zurb.com/sites/docs/float-classes.html)

> NOTE: `.float-center` is not implemented.

## Typography

HTML elements such as headings (`h1`, `h2`, ...), lists (`ol`, `ul`, `li`, ...) and tables does not have margins and paddings by default in order to easy the styling of semantic structures. However you may want suitable space between those elements when they are used to present content to users (for example, problem content). In this case, you need to enable the typography styling by wrapping them with `<div class="typo"></div>`:

```html
<div class="typo">
  <h1>Notice</h1>
  <p>The content will be well formatted.</p>
  <ul>
    <li>Item</li>
    <li>Item</li>
    <li>Item</li>
  </ul>
</div>
```

### Text Alignment

```html
<ANY class="text-left"></ANY>
<ANY class="text-center"></ANY>
<ANY class="text-right"></ANY>
<ANY class="text-justify"></ANY>
```

## Prototype Components

### Media Object

TODO

### Number Box Object

TODO

### Balancer Object

TODO

## Basic Components

### Section

Section is served as an entry to more detailed contents. By default, each section has a white background and drop-shadow.

A section should contain a section-header and one or more section bodies.

```html
<div class="section">
  <div class="section__header">
    <!-- header -->
  </div>
  <div class="section__body">
    <!-- body -->
  </div>
  <div class="section__body">
    <!-- optionally more bodies -->
  </div>
</div>
```

There will be vertical margins between section bodies.

#### Side Section

If the section is acted as a sidebar section, it should contain `side` class so that its default font size becomes smaller:

```html
<div class="section side"></div>
```

#### Title

You can use `<X class="section__title"></X>` to specify the title for a section (`X` is from `h1` to `h3`). The font size and the color of the section title is different from normal headings.

```html
<div class="section">
  <div class="section__header">
    <h1 class="section__title">Section title</h1>
  </div>
</div>
```

#### Table

If the main content of the section is a data table (or additionally with a title and a paginator), it is suggested to apply `data-table` to the table. Table should be put inside a section-body with `no-padding` decoration.

3 * 2 table sample:

```html
<div class="section">
  <!-- ... -->
  <div class="section__body no-padding">
    <table class="data-table">
      <colgroup>
        <col class="col--1">
        <col class="col--2">
      </colgroup>
      <thead>
        <tr>
          <th class="col--1"></th>
          <th class="col--2"></th>
        </tr>
      </thead>
      <tbody>
        <tr><td class="col--1">1,1</td><td class="col--2">1,2</td></tr>
        <tr><td class="col--1">2,1</td><td class="col--2">2,2</td></tr>
        <tr><td class="col--1">3,1</td><td class="col--2">3,2</td></tr>
      </tbody>
    </table>
  </div>
</div>
```

> If you want to specify the width of a column, you should add `col--xxx` to the class name list (as shown above) and specify its width in a CSS rule like:
>
> ```css
> .col--1 { width: 120px; }
> ```

#### Samples

Section with content:

```html
<div class="section">
  <div class="section__body">
    Section content
  </div>
</div>
```

Section with title and content:

```html
<div class="section">
  <div class="section__header">
    <h1 class="section__title">Section title</h1>
  </div>
  <div class="section__body">
    Section content
  </div>
</div>
```

Section with title and table content:

```html
<div class="section">
  <div class="section__header">
    <h1 class="section__title">Section title</h1>
  </div>
  <div class="section__body no-padding">
    <table class="data-table">
      <!-- ... -->
    </table>
  </div>
</div>
```

### Button

```html
<ANY class="button"></ANY>
```

Additional class names:

`rounded`: The button would have round corners.

`primary`: The button would have blue background.

`expanded`: The button would occupy full width of the parent.

`inverse`: TODO

### Input

```html
<X class="textbox"></X>
```

`X` could be `input` or `textarea`.

Additional class names:

`material`: TODO

`inverse`: TODO

### Paginator

TODO

### Menu

```html
<ol class="menu">
  <li class="menu__item">
    <a href="#" class="menu__link">Item</a>
  </li>
  <li class="menu__seperator"></li>
</ol>
```

Optionally, a menu item can be `active` or `highlight` (notice that the decorator class name is added to `menu__link` instead of `menu__item`):

```html
<li class="menu__item">
  <a href="#" class="menu__link active">Active Item</a>
</li>
<li class="menu__item">
  <a href="#" class="menu__link highlight">Highlight Item</a>
</li>
```

Menu can be put inside a section. It should be placed inside `section__body no-padding` or directly inside `section`:

```html
<div class="section">
  <div>
    <ol class="menu">
    ...
    </ol>
  </div>
</div>
```

#### Menu Item from Headings

Menu items can be automatically generated from headings. To enable this feature, you need to specify the region to extract headings and the destination of extracted menu items by setting `data-heading-extract-to` attribute:

```html
<div class="section" data-heading-extract-to="#my-menu-item">
  <h1 id="h_1" data-heading>Heading 1</h1>
  <h1 id="h_2" data-heading>Heading 2</h1>
</div>
```

This attribute accepts a CSS selector and all elements that contain `data-heading` attribute in the element will be extracted. `id` is essential and it will be appended to the hash part so that the page will navigate when user clicks the newly generate menu item.

The CSS selector should match a `menu__item` element. Headings will become the sub-menu of that element.

### Sticky

Sticky elements are always visible when the user scrolls. To enable sticky, add `data-sticky` attribute to the element.

Optionally, the value of `data-sticky` can be `medium` or `large`. When `data-sticky` is `medium`, the element will be sticky only when window size is larger than mobile cutoff (can be tablet or desktop). When `data-sticky` is `large`, it will take effect only when window size is larger than desktop cutoff. See section Responsive Cutoffs for actual sizes.

The sticky element is restricted to the boundary of its closest parent. You can change this behavior by assigning attribute `data-sticky-parent` to the desired parent. `data-sticky-parent` can not be used in nested sticky elements.

A sample of sticky sidebar:

```html
<div class="row" data-sticky-parent>
  <div class="medium-9 columns">
    <!-- main content -->
  </div>
  <div class="medium-3 columns">
    <div data-sticky="large">
      <div class="section">Sticky!</div>
    </div>
  </div>
</div>
```

- Because the columns will be stacked when window size is smaller than `large` (tablet and mobile) and we don't want sidebars keep sticky in such cases, we have `data-sticky="large"` so that the element will be sticky ONLY when window size is `large`.

- The height of the two columns are not equal so the sticky parent should be `.row` instead.

### CommonMark Editor

CommonMark editor can be automatically transformed from a normal textarea. Inputs in the CommonMark editor will be synced to the textarea in real-time. To enable this feature, add `data-markdown` to the `textarea` element.

Sample:

```html
<textarea name="content" class="textbox" data-markdown></textarea>
```

> To make it work with newly added textareas, you need to trigger `vjContentNew` event for the new element. Textarea with `data-markdown` should be a children of the trigger target.


### Emoji

[Emoji code](http://www.webpagefx.com/tools/emoji-cheat-sheet/) can be automatically transformed into emoji images. To enable this feature, add `data-emoji-enabled` to the element.

Sample:

```html
<div class="typo" data-emoji-enabled></div>
```

> To make it work with newly added contents, you need to trigger `vjContentNew` event for the new element.

### Dropdown

TODO

### Navigation

TODO

### Star

TODO

### Tab

TODO

### Hotkey

#### Local Hotkey

Local hotkeys are triggered when it is assigned to a parent of the active element in which user presses specific key.

To enable local hotkey on an element, add `data-hotkey` attribute:

```html
<button data-hotkey="f1"></button>
```

You can specify multiple hotkeys in the attribute.

#### Global hotkey

Global hotkeys are triggered no matter where user presses specific key.

To enable global hotkey on an element, add `data-global-hotkey` attribute:

```html
<button data-global-hotkey="f2"></button>
```

You can specify multiple hotkeys in the attribute.

#### Hotkey Syntax

`hotKeyDef[,hotKeyDef[,hotKeyDef...]]`

`hotKeyDef`: `keySequence[:event]`

`keySequence`: `key1[+key2[+key3...]]`

When `keySequence` matches, the `event` will be triggered on the element that holds the attribute. If `event` is not given in `hotKeyDef`, it will be `click` by default. In addition, if `event` is `submit`, the event will be triggered on the closest `form` element, instead of the current element.

Sample:

`ctrl+f1`: Triggers click on this element when user presses `Ctrl`+`F1` or `Command`+`F1`.

`ctrl+enter:submit`: Triggers submit on the closest `form` when user presses `Ctrl+Enter` or `Command+Enter`.

`f1:submit,f2:client`: Triggers submit when user presses `f1` and triggers click when user presses `f2`.

### Tooltip

```html
<X data-tooltip="your tooltip text"></X>
```

Optionally, you can specify a location by assigning `data-tooltip-pos` attribute. Available values are:

- `"top left"`
- `"top middle"` (default)
- `"top right"`
- `"bottom left"`
- `"bottom middle"`
- `"bottom right"`

## High-Level Components

### Comment List

TODO

## Other

### JavaScript-Responsive Visibility

#### Hide if JavaScript is disabled

```html
<ANY class="nojs--hide"></ANY>
```

#### Hide if JavaScript is enabled

```html
<ANY class="hasjs--hide"></ANY>
```
