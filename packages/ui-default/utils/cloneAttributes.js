export default function cloneAttributes(from, to) {
  const attributes = from.prop('attributes');
  $.each(attributes, function () {
    to.attr(this.name, this.value);
  });
}
